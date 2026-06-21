function parseJson(value, fallback = null) {
    if (value == null) return fallback;
    if (Buffer.isBuffer(value)) value = value.toString('utf8');
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
}

function normalizeRow(row) {
    if (!row) return null;
    const normalized = { ...row };
    for (const key of [
        'RequestedOutputTypes', 'ContentJson', 'TokenUsageJson', 'ConfigurationJson',
        'WarningsJson', 'MetricsJson', 'SourceFreshnessJson'
    ]) {
        if (Object.prototype.hasOwnProperty.call(normalized, key)) {
            normalized[key] = parseJson(normalized[key], normalized[key]);
        }
    }
    return normalized;
}

function createAdminIntelligenceService({
    pool,
    azureOpenAI,
    intelligenceService,
    schedulerService,
    automationService = null,
    defaultOutputTypes = [],
    logger = console
} = {}) {
    if (!pool || !azureOpenAI || !intelligenceService || !schedulerService) {
        throw new Error('Admin Intelligence requires database, Azure, intelligence, and scheduler services');
    }

    function auditAction(action, companyId, user) {
        logger.log('[StackCTRL Admin Intelligence] Action requested.', {
            action,
            companyId: Number(companyId),
            userId: user?.id || user?.userId || null,
            email: user?.email || null
        });
    }

    async function getRunMetrics() {
        try {
            const [[dailyRows], [rateLimitedRows]] = await Promise.all([
                pool.query(
                    `SELECT COUNT(*) AS TotalRunsToday,
                            SUM(Status = 'completed') AS CompletedRunsToday,
                            SUM(Status = 'failed') AS FailedRunsToday,
                            SUM(Status = 'rate_limited' OR RetryCount > 0) AS RateLimitedRunsToday,
                            COALESCE(SUM(InputTokens), 0) AS InputTokensToday,
                            COALESCE(SUM(OutputTokens), 0) AS OutputTokensToday,
                            COALESCE(SUM(TotalTokens), 0) AS TotalTokensToday,
                            AVG(RequestSizeBytes) AS AverageRequestSize,
                            AVG(ResponseSizeBytes) AS AverageResponseSize
                     FROM StackCTRLIntelligenceRuns
                     WHERE StartedAt >= CURDATE()`
                ),
                pool.query(
                    `SELECT COUNT(*) AS CurrentRateLimitedRuns
                     FROM StackCTRLIntelligenceRuns
                     WHERE Status = 'rate_limited'`
                )
            ]);
            return { ...normalizeRow(dailyRows[0]), ...normalizeRow(rateLimitedRows[0]), metadataAvailable: true };
        } catch (error) {
            if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
            const [rows] = await pool.query(
                `SELECT COUNT(*) AS TotalRunsToday,
                        SUM(Status = 'completed') AS CompletedRunsToday,
                        SUM(Status = 'failed') AS FailedRunsToday
                 FROM StackCTRLIntelligenceRuns
                 WHERE StartedAt >= CURDATE()`
            );
            return {
                ...normalizeRow(rows[0]),
                RateLimitedRunsToday: 0,
                CurrentRateLimitedRuns: 0,
                InputTokensToday: 0,
                OutputTokensToday: 0,
                TotalTokensToday: 0,
                AverageRequestSize: null,
                AverageResponseSize: null,
                metadataAvailable: false
            };
        }
    }

    async function getSystemStatus() {
        const [azure, latestCompleted, latestFailed, latestRun, usage] = await Promise.all([
            azureOpenAI.getSafeConfiguration(),
            pool.query(`SELECT * FROM StackCTRLIntelligenceRuns WHERE Status = 'completed' ORDER BY ID DESC LIMIT 1`),
            pool.query(`SELECT * FROM StackCTRLIntelligenceRuns WHERE Status = 'failed' ORDER BY ID DESC LIMIT 1`),
            pool.query('SELECT * FROM StackCTRLIntelligenceRuns ORDER BY ID DESC LIMIT 1'),
            getRunMetrics()
        ]);
        return {
            azure,
            latestSuccessfulRun: normalizeRow(latestCompleted[0][0]),
            latestFailedRun: normalizeRow(latestFailed[0][0]),
            latestRun: normalizeRow(latestRun[0][0]),
            latestErrorMessage: latestFailed[0][0]?.ErrorMessage || null,
            lastRetryCount: Number(latestRun[0][0]?.RetryCount || 0),
            usage,
            serverAutomation: automationService?.getStatus?.() || null
        };
    }

    function capabilitySummary(rows) {
        const expected = rows.filter(row => Number(row.IsExpected) === 1);
        return {
            profileKey: rows.find(row => row.ProfileKey)?.ProfileKey || 'standard',
            totalSources: rows.length,
            expectedSources: expected.length,
            enabledSources: rows.filter(row => Number(row.IsEnabled) === 1).length,
            expectedSourceKeys: expected.map(row => row.SourceKey)
        };
    }

    async function getTenants() {
        const [companiesResult, capabilitiesResult, snapshotsResult] = await Promise.all([
            pool.query('SELECT ID, CompanyName FROM Companies ORDER BY CompanyName LIMIT 500'),
            pool.query('SELECT CompanyID, ProfileKey, SourceKey, IsExpected, IsEnabled FROM StackCTRLClientCapabilities'),
            pool.query(
                `SELECT CompanyID, TenantKey, ID AS SnapshotID, CreatedAt
                 FROM StackCTRLTenantEvidenceSnapshots
                 WHERE ID IN (
                    SELECT MAX(ID) FROM StackCTRLTenantEvidenceSnapshots GROUP BY CompanyID
                 )`
            )
        ]);
        const capabilities = new Map();
        for (const row of capabilitiesResult[0]) {
            if (!capabilities.has(row.CompanyID)) capabilities.set(row.CompanyID, []);
            capabilities.get(row.CompanyID).push(row);
        }
        const snapshots = new Map(snapshotsResult[0].map(row => [row.CompanyID, row]));
        return companiesResult[0].map(company => ({
            companyId: company.ID,
            companyName: company.CompanyName,
            tenantKey: snapshots.get(company.ID)?.TenantKey || `company-${company.ID}`,
            latestSnapshotId: snapshots.get(company.ID)?.SnapshotID || null,
            latestSnapshotAt: snapshots.get(company.ID)?.CreatedAt || null,
            capabilities: capabilitySummary(capabilities.get(company.ID) || [])
        }));
    }

    async function readinessRow(tableName, companyId) {
        try {
            const [rows] = await pool.query(
                `SELECT COUNT(*) AS RecordCount, MAX(CreatedAt) AS LatestUpdatedAt
                 FROM ${tableName} WHERE CompanyID = ?`,
                [companyId]
            );
            return { tableName, available: true, ...normalizeRow(rows[0]) };
        } catch (error) {
            if (error?.code === 'ER_BAD_FIELD_ERROR') {
                const [rows] = await pool.query(`SELECT COUNT(*) AS RecordCount FROM ${tableName} WHERE CompanyID = ?`, [companyId]);
                return { tableName, available: true, ...normalizeRow(rows[0]), LatestUpdatedAt: null };
            }
            if (error?.code === 'ER_NO_SUCH_TABLE') return { tableName, available: false, RecordCount: 0, LatestUpdatedAt: null };
            throw error;
        }
    }

    async function getTenant(companyId) {
        const numericCompanyId = Number(companyId);
        const [companyRows] = await pool.query('SELECT ID, CompanyName FROM Companies WHERE ID = ? LIMIT 1', [numericCompanyId]);
        if (!companyRows.length) {
            const error = new Error('Company not found');
            error.statusCode = 404;
            throw error;
        }

        const [snapshotRows] = await pool.query(
            `SELECT ID, CompanyID, TenantKey, SnapshotType, DataCompletenessScore, CreatedAt,
                    OCTET_LENGTH(ContextJson) AS ContextSizeBytes
             FROM StackCTRLTenantEvidenceSnapshots
             WHERE ID = (SELECT MAX(ID) FROM StackCTRLTenantEvidenceSnapshots WHERE CompanyID = ?)
             LIMIT 1`,
            [numericCompanyId]
        );
        const snapshot = normalizeRow(snapshotRows[0]);
        const snapshotId = snapshot?.ID || 0;
        const readinessTables = [
            'StackCTRLTenantAIOutputs',
            'StackCTRLTenantRiskRegister',
            'StackCTRLTenantRecommendations',
            'StackCTRLTenantTrendAnalysis',
            'StackCTRLIntelligenceMetrics',
            'StackCTRLIntelligenceSourceStatus'
        ];

        const [sourceRows, runRows, outputRows, riskRows, recommendationRows, trendRows, capabilityRows, readiness] = await Promise.all([
            snapshotId
                ? pool.query('SELECT * FROM StackCTRLIntelligenceSourceStatus WHERE SnapshotID = ? ORDER BY SourceKey', [snapshotId])
                : Promise.resolve([[]]),
            pool.query('SELECT * FROM StackCTRLIntelligenceRuns WHERE CompanyID = ? ORDER BY ID DESC LIMIT 50', [numericCompanyId]),
            pool.query('SELECT * FROM StackCTRLTenantAIOutputs WHERE CompanyID = ? ORDER BY ID DESC LIMIT 50', [numericCompanyId]),
            pool.query('SELECT * FROM StackCTRLTenantRiskRegister WHERE CompanyID = ? ORDER BY ID DESC LIMIT 20', [numericCompanyId]),
            pool.query('SELECT * FROM StackCTRLTenantRecommendations WHERE CompanyID = ? ORDER BY ID DESC LIMIT 20', [numericCompanyId]),
            pool.query('SELECT * FROM StackCTRLTenantTrendAnalysis WHERE CompanyID = ? ORDER BY ID DESC LIMIT 20', [numericCompanyId]),
            pool.query('SELECT * FROM StackCTRLClientCapabilities WHERE CompanyID = ?', [numericCompanyId]),
            Promise.all(readinessTables.map(table => readinessRow(table, numericCompanyId)))
        ]);
        const sources = sourceRows[0].map(normalizeRow);
        const expectedSources = sources.filter(source => Number(source.IsExpected) === 1);
        const availableSources = expectedSources.filter(source => ['available', 'stale'].includes(source.Status));

        return {
            company: {
                companyId: companyRows[0].ID,
                companyName: companyRows[0].CompanyName,
                tenantKey: snapshot?.TenantKey || `company-${numericCompanyId}`,
                capabilities: capabilitySummary(capabilityRows[0])
            },
            latestSnapshot: snapshot ? {
                ...snapshot,
                expectedSources: expectedSources.length,
                availableSources: availableSources.length,
                missingSources: expectedSources.filter(source => ['missing', 'not_configured', 'error'].includes(source.Status)).length,
                staleSources: expectedSources.filter(source => source.Status === 'stale').length,
                notExpectedSources: sources.filter(source => source.Status === 'not_expected').length
            } : null,
            sourceStatuses: sources,
            runs: runRows[0].map(normalizeRow),
            outputs: outputRows[0].map(normalizeRow),
            risks: riskRows[0].map(normalizeRow),
            recommendations: recommendationRows[0].map(normalizeRow),
            trends: trendRows[0].map(normalizeRow),
            powerBIReadiness: readiness
        };
    }

    async function createSnapshot(companyId, user) {
        auditAction('create_snapshot', companyId, user);
        return intelligenceService.bootstrap({ companyId: Number(companyId), user });
    }

    async function runAnalysis(companyId, options, user) {
        auditAction('run_analysis', companyId, user);
        let snapshotId = Number(options?.snapshotId || 0);
        if (!snapshotId) {
            const [rows] = await pool.query(
                'SELECT MAX(ID) AS SnapshotID FROM StackCTRLTenantEvidenceSnapshots WHERE CompanyID = ?',
                [Number(companyId)]
            );
            snapshotId = Number(rows[0]?.SnapshotID || 0);
        }
        if (!snapshotId) {
            const error = new Error('Create a snapshot before running Azure analysis');
            error.statusCode = 400;
            throw error;
        }
        const outputTypes = Array.isArray(options?.outputTypes) && options.outputTypes.length
            ? options.outputTypes
            : defaultOutputTypes;
        return schedulerService.runScheduledAzureAnalysis(Number(companyId), snapshotId, outputTypes, user);
    }

    async function runFullTest(companyId, options, user) {
        auditAction('run_full_test', companyId, user);
        return schedulerService.runNow({
            companyId: Number(companyId),
            includeAnalysis: options?.includeAnalysis !== false,
            outputTypes: Array.isArray(options?.outputTypes) && options.outputTypes.length
                ? options.outputTypes
                : defaultOutputTypes,
            user
        });
    }

    return { getSystemStatus, getTenants, getTenant, createSnapshot, runAnalysis, runFullTest };
}

module.exports = { createAdminIntelligenceService };
