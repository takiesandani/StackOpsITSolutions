const mysql = require('mysql2/promise');
require('dotenv').config({ quiet: true });

const companyId = Number(process.argv[2] || 1);
if (!Number.isInteger(companyId) || companyId <= 0) throw new Error('Usage: node scripts/validate-enterprise-intelligence.js <companyId>');

const requiredTables = [
    'StackCTRLIntelligenceSchedules',
    'StackCTRLIntelligenceScheduleRuns',
    'StackCTRLSecurityEvidenceSnapshots',
    'StackCTRLSecurityEvidence',
    'StackCTRLEnterpriseReportRuns',
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
                `SELECT ID, SnapshotID, Status, StartedAt, CompletedAt, ErrorMessage, ProgressJson
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
    console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
    console.error(JSON.stringify({ connected: false, code: error.code || null, message: error.message }));
    process.exitCode = 1;
});
