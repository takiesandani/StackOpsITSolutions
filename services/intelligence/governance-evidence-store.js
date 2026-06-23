const crypto = require('crypto');
const { buildGovernanceDashboardSource } = require('./governance-dashboard-source');
const { buildRiskEngine } = require('./risk-engine');

const GOVERNANCE_EVIDENCE_SCHEMA = [
    `CREATE TABLE IF NOT EXISTS StackCTRLGovernanceEvidenceSnapshots (
        ID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        CompanyID BIGINT NOT NULL,
        TenantKey VARCHAR(100) NOT NULL,
        CollectionTrigger VARCHAR(50) NOT NULL,
        SourceSystem VARCHAR(100) NOT NULL DEFAULT 'Microsoft Graph via StackCTRL',
        SourceEndpoint VARCHAR(255) NOT NULL,
        CollectionStatus VARCHAR(30) NOT NULL,
        IsComplete TINYINT(1) NOT NULL DEFAULT 0,
        CollectedAt DATETIME(3) NOT NULL,
        SourceFetchedAt DATETIME(3) NULL,
        EvidenceRecordCount INT NOT NULL DEFAULT 0,
        ExpectedRecordCount INT NOT NULL DEFAULT 0,
        OmittedRecordCount INT NOT NULL DEFAULT 0,
        CompletenessPercent DECIMAL(6,2) NOT NULL DEFAULT 0,
        TotalRows INT NOT NULL DEFAULT 0,
        ApiConnectedRows INT NOT NULL DEFAULT 0,
        ManualRowsExcluded INT NOT NULL DEFAULT 0,
        AttentionRequiredRows INT NOT NULL DEFAULT 0,
        ConnectedRows INT NOT NULL DEFAULT 0,
        GovernanceScore DECIMAL(6,2) NOT NULL DEFAULT 0,
        RecommendationsCount INT NOT NULL DEFAULT 0,
        StackCTRLRiskScore DECIMAL(6,2) NULL,
        StackCTRLHealthScore DECIMAL(6,2) NULL,
        DashboardMetricsJson JSON NOT NULL,
        SourceAuditJson JSON NULL,
        EvidenceSha256 CHAR(64) NULL,
        IncompleteReason TEXT NULL,
        ErrorMessage TEXT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (ID),
        KEY ix_governance_evidence_latest (CompanyID, IsComplete, CollectedAt, ID),
        KEY ix_governance_evidence_status (CollectionStatus, CollectedAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS StackCTRLGovernanceEvidence (
        ID BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        SnapshotID BIGINT UNSIGNED NOT NULL,
        CompanyID BIGINT NOT NULL,
        TenantKey VARCHAR(100) NOT NULL,
        EvidenceKind VARCHAR(30) NOT NULL,
        SourceID VARCHAR(255) NULL,
        Title VARCHAR(500) NOT NULL,
        Area VARCHAR(100) NULL,
        Status VARCHAR(50) NULL,
        ProcessedEvidenceJson JSON NOT NULL,
        CollectedAt DATETIME(3) NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (ID),
        UNIQUE KEY uq_governance_evidence_snapshot_source (SnapshotID, EvidenceKind, SourceID),
        KEY ix_governance_evidence_snapshot (SnapshotID, ID),
        CONSTRAINT fk_governance_evidence_snapshot
            FOREIGN KEY (SnapshotID) REFERENCES StackCTRLGovernanceEvidenceSnapshots(ID)
            ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

function mysqlDateTime(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function governanceSourceId(row, index) {
    const key = `${row.area || 'area'}:${row.activity || 'activity'}:${row.dataSource || row.source || 'source'}`;
    return String(key).slice(0, 255) || `governance-row-${index + 1}`;
}

function deriveGovernanceEvidence(payload = {}) {
    const dashboardSource = buildGovernanceDashboardSource({
        rows: payload.rows || [],
        summary: payload.summary || payload.dashboardMetrics || {}
    });
    const metrics = dashboardSource.dashboardMetrics;
    const riskEngine = buildRiskEngine({
        sources: [{ sourceKey: 'governance', status: 'available', isExpected: true, metrics, dashboardMetrics: metrics }],
        dataCompleteness: { score: 100 }
    });
    const stackctrlHealthScore = riskEngine.domainHealthScores.governance;
    const stackctrlRiskScore = riskEngine.domainRiskScores.governance;
    const dashboardMetrics = { ...metrics, stackctrlRiskScore, stackctrlHealthScore };
    const evidenceRows = dashboardSource.rows.map((row, index) => ({
        kind: 'governance_row',
        sourceId: governanceSourceId(row, index),
        title: `${row.area || 'Governance'} - ${row.activity || 'Review'}`.slice(0, 500),
        area: row.area || null,
        status: row.status || null,
        processed: row
    }));
    const omittedRecordCount = metrics.manualRowsExcluded || 0;
    const isComplete = Boolean(payload.success !== false);
    return {
        evidenceRows,
        dashboardMetrics,
        stackctrlRiskScore,
        stackctrlHealthScore,
        expectedRecordCount: evidenceRows.length,
        omittedRecordCount,
        completenessPercent: evidenceRows.length > 0 || isComplete ? 100 : 0,
        isComplete,
        incompleteReason: isComplete ? null : 'The processed Governance dashboard did not complete successfully.'
    };
}

function createGovernanceEvidenceStore({ pool, logger = console, now = () => new Date() } = {}) {
    if (!pool?.query) throw new Error('Governance evidence storage requires a database pool');
    async function ensureSchema() {
        for (const statement of GOVERNANCE_EVIDENCE_SCHEMA) await pool.query(statement);
        return { tables: ['StackCTRLGovernanceEvidenceSnapshots', 'StackCTRLGovernanceEvidence'] };
    }
    async function persistProcessedEvidence({ companyId, tenantKey = 'sunbird', payload, collectionTrigger = 'scheduled_daily', sourceEndpoint = 'Microsoft Graph processed by StackCTRL Governance' } = {}) {
        const numericCompanyId = Number(companyId);
        if (!Number.isFinite(numericCompanyId) || numericCompanyId <= 0) throw new Error('A valid companyId is required');
        const evidence = deriveGovernanceEvidence(payload);
        const collectedAt = now();
        const connection = typeof pool.getConnection === 'function' ? await pool.getConnection() : pool;
        const ownsConnection = connection !== pool;
        let snapshotId = null;
        try {
            if (typeof connection.beginTransaction === 'function') await connection.beginTransaction();
            const metrics = evidence.dashboardMetrics;
            const [snapshotResult] = await connection.query(
                `INSERT INTO StackCTRLGovernanceEvidenceSnapshots
                 (CompanyID, TenantKey, CollectionTrigger, SourceEndpoint, CollectionStatus, IsComplete,
                  CollectedAt, SourceFetchedAt, EvidenceRecordCount, ExpectedRecordCount, OmittedRecordCount,
                  CompletenessPercent, TotalRows, ApiConnectedRows, ManualRowsExcluded, AttentionRequiredRows,
                  ConnectedRows, GovernanceScore, RecommendationsCount, StackCTRLRiskScore, StackCTRLHealthScore,
                  DashboardMetricsJson, SourceAuditJson, EvidenceSha256, IncompleteReason)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    numericCompanyId, tenantKey, collectionTrigger, sourceEndpoint,
                    evidence.isComplete ? 'complete' : 'incomplete', evidence.isComplete ? 1 : 0,
                    mysqlDateTime(collectedAt), mysqlDateTime(payload?.fetchedAt || collectedAt),
                    evidence.evidenceRows.length, evidence.expectedRecordCount, evidence.omittedRecordCount, evidence.completenessPercent,
                    metrics.totalRows, metrics.apiConnectedRows, metrics.manualRowsExcluded, metrics.attentionRequiredRows,
                    metrics.connectedRows, metrics.governanceScore, metrics.recommendationsCount,
                    evidence.stackctrlRiskScore, evidence.stackctrlHealthScore, JSON.stringify(metrics),
                    JSON.stringify({ source: 'stackctrl_processed_governance_dashboard', collectionTrigger, sourceEndpoint, manualRowsExcludedFromAzureInput: evidence.omittedRecordCount, credentialSource: 'environment' }),
                    crypto.createHash('sha256').update(JSON.stringify({ rows: evidence.evidenceRows, dashboardMetrics: metrics })).digest('hex'),
                    evidence.incompleteReason
                ]
            );
            snapshotId = snapshotResult.insertId;
            for (const row of evidence.evidenceRows) {
                await connection.query(
                    `INSERT INTO StackCTRLGovernanceEvidence
                     (SnapshotID, CompanyID, TenantKey, EvidenceKind, SourceID, Title, Area, Status, ProcessedEvidenceJson, CollectedAt)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [snapshotId, numericCompanyId, tenantKey, row.kind, row.sourceId, row.title, row.area, row.status, JSON.stringify(row.processed), mysqlDateTime(collectedAt)]
                );
            }
            if (typeof connection.commit === 'function') await connection.commit();
        } catch (error) {
            if (typeof connection.rollback === 'function') await connection.rollback();
            throw error;
        } finally {
            if (ownsConnection && typeof connection.release === 'function') connection.release();
        }
        logger.log(`[Governance Evidence] Stored snapshot ${snapshotId} with ${evidence.evidenceRows.length} API-connected governance records (${evidence.omittedRecordCount} manual rows excluded).`);
        return { snapshotId, companyId: numericCompanyId, collectedAt: collectedAt.toISOString(), recordCount: evidence.evidenceRows.length, omittedRecordCount: evidence.omittedRecordCount, isComplete: evidence.isComplete, dashboardMetrics: evidence.dashboardMetrics };
    }
    async function recordCollectionFailure({ companyId, tenantKey = 'sunbird', collectionTrigger = 'scheduled_daily', sourceEndpoint, error } = {}) {
        const [result] = await pool.query(
            `INSERT INTO StackCTRLGovernanceEvidenceSnapshots
             (CompanyID, TenantKey, CollectionTrigger, SourceEndpoint, CollectionStatus, IsComplete, CollectedAt,
              EvidenceRecordCount, ExpectedRecordCount, OmittedRecordCount, CompletenessPercent, DashboardMetricsJson, SourceAuditJson, IncompleteReason, ErrorMessage)
             VALUES (?, ?, ?, ?, 'failed', 0, ?, 0, 0, 0, 0, ?, ?, ?, ?)`,
            [Number(companyId), tenantKey, collectionTrigger, sourceEndpoint || 'Microsoft Graph processed by StackCTRL Governance', mysqlDateTime(now()), JSON.stringify({}), JSON.stringify({ credentialSource: 'environment' }), 'Governance evidence collection did not complete.', String(error?.message || error).slice(0, 5000)]
        );
        return { snapshotId: result.insertId, companyId: Number(companyId), status: 'failed' };
    }
    return { ensureSchema, persistProcessedEvidence, recordCollectionFailure, deriveGovernanceEvidence };
}

module.exports = { GOVERNANCE_EVIDENCE_SCHEMA, createGovernanceEvidenceStore, deriveGovernanceEvidence };
