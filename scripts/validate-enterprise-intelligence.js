const mysql = require('mysql2/promise');
require('dotenv').config({ quiet: true });

const companyId = Number(process.argv[2] || 1);
if (!Number.isInteger(companyId) || companyId <= 0) throw new Error('Usage: node scripts/validate-enterprise-intelligence.js <companyId>');
const enterpriseDomainKeys = [
    'identity', 'devices', 'email_security', 'cloudflare_network_security', 'security_alerts',
    'applications', 'backup', 'governance', 'operations', 'compliance'
];
const terminalDomainStatuses = new Set([
    'completed', 'completed_with_warnings', 'partial', 'failed_terminal', 'failed_invalid_json',
    'failed_source_mismatch', 'failed_evidence_validation', 'blocked_missing_source', 'blocked_stale_source',
    'failed', 'failed_storage', 'failed_rate_limited', 'skipped_rate_limited', 'skipped_pipeline_stop'
]);

const requiredTables = [
    'StackCTRLIntelligenceSchedules',
    'StackCTRLIntelligenceScheduleRuns',
    'StackCTRLSecurityEvidenceSnapshots',
    'StackCTRLSecurityEvidence',
    'StackCTRLEnterpriseReportRuns',
    'StackCTRLEnterpriseSynthesis',
    'StackCTRLTenantDomainIntelligence',
    'StackCTRLTenantDomainIntelligenceBatches'
];

async function main() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        connectTimeout: 12000
    });
    const report = { connected: true, companyId };
    try {
        const [[database]] = await connection.query(
            `SELECT DATABASE() AS databaseName,
                    (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()) AS tableCount`
        );
        report.database = database;
        const [tables] = await connection.query(
            'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)',
            [requiredTables]
        );
        report.tablesPresent = tables.map(row => row.TABLE_NAME);
        report.tablesMissing = requiredTables.filter(name => !report.tablesPresent.includes(name));

        const [views] = await connection.query(
            `SELECT TABLE_NAME FROM information_schema.VIEWS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN ('vw_PowerBI_EnterpriseRuns', 'vw_PowerBI_DomainIntelligence', 'vw_PowerBI_DomainEvidenceAudit')`
        );
        report.powerBiViewsPresent = views.map(row => row.TABLE_NAME);

        if (report.tablesPresent.includes('StackCTRLIntelligenceSchedules')) {
            const [rows] = await connection.query(
                'SELECT COUNT(*) AS total, SUM(IsEnabled = 1) AS enabled FROM StackCTRLIntelligenceSchedules WHERE CompanyID = ?',
                [companyId]
            );
            report.schedules = rows[0];
        }

        if (report.tablesPresent.includes('StackCTRLSecurityEvidenceSnapshots')) {
            const [rows] = await connection.query(
                `SELECT ID, CollectionStatus, IsComplete, CollectedAt, EvidenceRecordCount,
                        ExpectedRecordCount, OmittedRecordCount, CompletenessPercent,
                        IncompleteReason, ErrorMessage
                 FROM StackCTRLSecurityEvidenceSnapshots
                 WHERE CompanyID = ? ORDER BY ID DESC LIMIT 1`,
                [companyId]
            );
            report.latestSecurity = rows[0] || null;
            if (rows[0] && report.tablesPresent.includes('StackCTRLSecurityEvidence')) {
                const [[counts]] = await connection.query(
                    `SELECT COUNT(*) AS storedRows,
                            COUNT(DISTINCT CASE WHEN EvidenceKind = 'alert' THEN SourceID END) AS sourceAlertIds
                     FROM StackCTRLSecurityEvidence WHERE SnapshotID = ?`,
                    [rows[0].ID]
                );
                report.latestSecurityStorage = counts;
            }
        }

        if (report.tablesPresent.includes('StackCTRLEnterpriseReportRuns')) {
            const [rows] = await connection.query(
                `SELECT ID, SnapshotID, Mode, Status, StartedAt, CompletedAt, ErrorMessage, ProgressJson
                 FROM StackCTRLEnterpriseReportRuns
                 WHERE CompanyID = ? ORDER BY ID DESC LIMIT 1`,
                [companyId]
            );
            const row = rows[0] || null;
            if (row) {
                let progress = {};
                try { progress = typeof row.ProgressJson === 'string' ? JSON.parse(row.ProgressJson) : (row.ProgressJson || {}); } catch (_) {}
                report.latestEnterprise = {
                    runId: row.ID,
                    snapshotId: row.SnapshotID,
                    status: row.Status,
                    startedAt: row.StartedAt,
                    completedAt: row.CompletedAt,
                    errorMessage: row.ErrorMessage,
                    currentDomain: progress.currentDomainKey || null,
                    currentStage: progress.currentStage || null,
                    lastSuccessfulStage: progress.lastSuccessfulStage || null,
                    failureReason: progress.stageFailureReason || null,
                    progressUpdatedAt: progress.updatedAt || null
                };
                if (report.tablesPresent.includes('StackCTRLTenantDomainIntelligence')) {
                    const [domains] = await connection.query(
                        `SELECT DomainKey, Status, InputTokens, OutputTokens, RetryCount, ErrorMessage
                         FROM StackCTRLTenantDomainIntelligence
                         WHERE CompanyID = ? AND RunID = ? ORDER BY ID`,
                        [companyId, row.ID]
                    );
                    report.domains = domains;
                    const domainByKey = new Map(domains.map(domain => [domain.DomainKey, domain]));
                    const missingDomains = enterpriseDomainKeys.filter(key => !domainByKey.has(key));
                    const nonTerminalDomains = domains.filter(domain => !terminalDomainStatuses.has(String(domain.Status || '')));
                    const identity = domainByKey.get('identity') || null;
                    const securityAlerts = domainByKey.get('security_alerts') || null;
                    report.enterpriseDomainChecks = {
                        expectedDomainCount: enterpriseDomainKeys.length,
                        storedDomainCount: domains.length,
                        missingDomains,
                        nonTerminalDomains: nonTerminalDomains.map(domain => ({ domainKey: domain.DomainKey, status: domain.Status })),
                        identityContinuedAfterInvalidJson: Boolean(identity && ['completed', 'completed_with_warnings', 'partial'].includes(identity.Status)),
                        securityAlertsTerminal: Boolean(securityAlerts && terminalDomainStatuses.has(String(securityAlerts.Status || '')))
                    };
                }
                if (report.tablesPresent.includes('StackCTRLEnterpriseSynthesis')) {
                    const [synthesisRows] = await connection.query(
                        `SELECT ID, Status, CreatedAt FROM StackCTRLEnterpriseSynthesis
                         WHERE CompanyID = ? AND RunID = ? ORDER BY ID DESC LIMIT 1`,
                        [companyId, row.ID]
                    );
                    report.finalSynthesis = synthesisRows[0] || null;
                }
            } else report.latestEnterprise = null;
        }

        const [accessColumns] = await connection.query(
            `SELECT COLUMN_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'TenantAccessControl'`
        );
        const columnNames = accessColumns.map(row => row.COLUMN_NAME);
        if (columnNames.includes('UserID') && columnNames.includes('AccessType')) {
            const [access] = await connection.query(
                `SELECT access.AccessType, COUNT(*) AS userCount
                 FROM TenantAccessControl access
                 INNER JOIN Users users ON users.ID = access.UserID
                 WHERE users.CompanyID = ? GROUP BY access.AccessType`,
                [companyId]
            );
            report.tenantAccess = access;
        } else report.tenantAccess = { unavailableColumns: columnNames };
    } finally {
        await connection.end();
    }

    const powerBiApiKey = process.env.POWERBI_API_KEY || process.env.POWERBI_KEY || '';
    const powerBiBaseUrl = String(process.env.POWERBI_BASE_URL || 'https://stackopsit.co.za/api/powerbi').replace(/\/$/, '');
    if (powerBiApiKey) {
        report.powerBiEndpointChecks = [];
        for (const path of [
            `/intelligence/latest/${companyId}`,
            `/tables/latest/${companyId}`,
            `/raw/domain/${companyId}/security_alerts`
        ]) {
            try {
                const response = await fetch(`${powerBiBaseUrl}${path}`, {
                    headers: { 'X-PowerBI-API-Key': powerBiApiKey }
                });
                const body = await response.json().catch(() => null);
                report.powerBiEndpointChecks.push({
                    path,
                    ok: response.ok && body && body.success !== false,
                    status: response.status,
                    hasData: Boolean(body && Object.keys(body).length)
                });
            } catch (error) {
                report.powerBiEndpointChecks.push({ path, ok: false, status: null, hasData: false, error: error.message });
            }
        }
    } else {
        report.powerBiEndpointChecks = { skipped: true, reason: 'Set POWERBI_API_KEY or POWERBI_KEY to run live endpoint checks.' };
    }

    const domainChecks = report.enterpriseDomainChecks || {};
    const endpointChecksPassed = Array.isArray(report.powerBiEndpointChecks)
        ? report.powerBiEndpointChecks.every(check => check.ok && check.hasData)
        : true;
    report.readiness = {
        requiredTablesPresent: report.tablesMissing.length === 0,
        allTenDomainsStored: domainChecks.storedDomainCount === enterpriseDomainKeys.length && !domainChecks.missingDomains?.length,
        allDomainsTerminal: Array.isArray(domainChecks.nonTerminalDomains) && domainChecks.nonTerminalDomains.length === 0,
        identityFailureDidNotStopPipeline: domainChecks.identityContinuedAfterInvalidJson === true,
        securityAlertsTerminal: domainChecks.securityAlertsTerminal === true,
        finalSynthesisExists: Boolean(report.finalSynthesis && ['completed', 'completed_with_warnings'].includes(report.finalSynthesis.Status)),
        rawSecurityEvidenceExists: Number(report.latestSecurityStorage?.storedRows || 0) > 0,
        powerBiEndpointsPassed: endpointChecksPassed
    };
    report.ready = Object.values(report.readiness).every(Boolean);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ready) process.exitCode = 2;
}

main().catch(error => {
    console.error(JSON.stringify({ connected: false, code: error.code || null, message: error.message }));
    process.exitCode = 1;
});
