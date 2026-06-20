const { loadClientCapabilities } = require('./intelligence/capabilities');
const { SOURCE_ADAPTERS } = require('./intelligence/source-adapters');

const ALLOWED_OUTPUT_TYPES = new Set([
    'executive_summary',
    'governance_assessment',
    'compliance_review',
    'risk_register',
    'recommendations',
    'trend_analysis',
    'board_report'
]);

const OUTPUT_TITLES = {
    executive_summary: 'Executive Summary',
    governance_assessment: 'Governance Assessment',
    compliance_review: 'Compliance Review',
    risk_register: 'Risk Register',
    recommendations: 'Recommendations',
    trend_analysis: 'Trend Analysis',
    board_report: 'Board Report'
};

const SYSTEM_PROMPT = 'You are StackCTRL Intelligence. You analyse only the StackCTRL-provided tenant context. You must not invent facts. You must clearly mark stale, missing, or incomplete data. Return JSON only.';
const PROMPT_VERSION = 'stackctrl-intelligence-v1';

function parseJsonValue(value) {
    if (value == null || typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return value;
    try {
        return JSON.parse(trimmed);
    } catch (_) {
        return value;
    }
}

function normalizeStoredRow(row) {
    if (!row) return null;
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, parseJsonValue(value)]));
}

function getLastUpdated(row) {
    if (!row) return null;
    return row.LastUpdated || row.last_updated || row.UpdatedAt || row.updated_at || row.CreatedAt || null;
}

function isMissingTableError(error) {
    return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code);
}

function toDateOrNull(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toNullableNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function toNullableDate(value) {
    const date = toDateOrNull(value);
    return date ? date.toISOString().slice(0, 10) : null;
}

function flattenMetrics(value, prefix = '', depth = 0, output = []) {
    if (value === null || value === undefined) return output;
    if (depth > 3) {
        output.push({ name: prefix || 'value', type: 'json', jsonValue: value });
        return output;
    }
    if (Array.isArray(value)) {
        output.push({ name: prefix || 'value', type: 'json', jsonValue: value });
        return output;
    }
    if (typeof value === 'object') {
        for (const [key, nestedValue] of Object.entries(value)) {
            const name = prefix ? `${prefix}.${key}` : key;
            flattenMetrics(nestedValue, name, depth + 1, output);
        }
        return output;
    }
    if (typeof value === 'number') output.push({ name: prefix, type: 'number', numericValue: value });
    else if (typeof value === 'boolean') output.push({ name: prefix, type: 'boolean', booleanValue: value });
    else output.push({ name: prefix, type: 'text', textValue: String(value) });
    return output;
}

function createStackCTRLIntelligenceService({ pool, azureOpenAI, refreshSource = null, logger = console } = {}) {
    if (!pool) throw new Error('StackCTRL Intelligence requires a database pool');
    if (!azureOpenAI) throw new Error('StackCTRL Intelligence requires Azure OpenAI');

    async function buildTenantAIContext(companyId, options = {}) {
        const numericCompanyId = Number(companyId);
        if (!Number.isInteger(numericCompanyId) || numericCompanyId <= 0) {
            throw new Error('A valid companyId is required');
        }

        const [companies] = await pool.query('SELECT * FROM Companies WHERE ID = ? LIMIT 1', [numericCompanyId]);
        if (!companies.length) throw new Error('Company not found');
        const company = normalizeStoredRow(companies[0]);
        const capabilities = await loadClientCapabilities({
            pool,
            companyId: numericCompanyId,
            company,
            accessType: options.accessType || null,
            persistDefaults: options.persistCapabilities !== false
        });
        const sources = [];
        for (const capability of capabilities) {
            const adapter = SOURCE_ADAPTERS[capability.sourceKey];
            if (!adapter) continue;
            sources.push(await adapter({
                pool,
                companyId: numericCompanyId,
                capability,
                refresh: Boolean(options.refresh),
                refreshSource,
                logger
            }));
        }

        const identityTenantEvidence = sources
            .find(source => source.sourceKey === 'identity')
            ?.evidence.find(item => item?.evidenceType === 'tenant')?.data;
        const tenantKey = options.tenantKey || identityTenantEvidence?.TenantID ||
            company.TenantKey || company.tenantKey || `company-${numericCompanyId}`;
        const periodStart = toDateOrNull(options.periodStart);
        const periodEnd = toDateOrNull(options.periodEnd);
        const expectedSources = sources.filter(source => source.isExpected);
        const availableSources = expectedSources.filter(source => ['available', 'stale'].includes(source.status));
        const staleSources = expectedSources.filter(source => source.status === 'stale');
        const unavailableSources = expectedSources.filter(source => !['available', 'stale'].includes(source.status));
        const dataCompletenessScore = expectedSources.length
            ? Number(((availableSources.length / expectedSources.length) * 100).toFixed(2))
            : 100;
        const dataCompleteness = {
            score: dataCompletenessScore,
            expectedSources: expectedSources.length,
            availableSources: availableSources.length,
            staleSources: staleSources.length,
            unavailableSources: unavailableSources.length,
            notExpectedSources: sources.filter(source => source.status === 'not_expected').length
        };
        const metrics = Object.fromEntries(sources.map(source => [source.sourceKey, source.metrics]));
        const evidence = sources.flatMap(source => source.evidence.map(item => ({
            sourceKey: source.sourceKey,
            displayName: source.displayName,
            data: item
        })));
        const warnings = [...new Set(sources.flatMap(source => source.warnings || []))];
        const sourceSummaries = sources.map(source => ({
            sourceKey: source.sourceKey,
            displayName: source.displayName,
            status: source.status,
            isExpected: source.isExpected,
            freshness: source.freshness,
            metrics: source.metrics,
            evidenceCount: source.evidence.length,
            warnings: source.warnings,
            rawReference: source.rawReference,
            errorMessage: source.errorMessage
        }));
        let previousOutputs = [];
        try {
            const [rows] = await pool.query(
                `SELECT ID, SnapshotID, OutputType, Title, ExecutiveSummary, ContentJson,
                        ConfidenceScore, Status, CreatedAt
                 FROM StackCTRLTenantAIOutputs
                 WHERE CompanyID = ? AND Status = 'completed'
                 ORDER BY CreatedAt DESC LIMIT 14`,
                [numericCompanyId]
            );
            previousOutputs = rows.map(normalizeStoredRow);
        } catch (error) {
            if (!isMissingTableError(error)) throw error;
        }

        const context = {
            tenant: {
                companyId: numericCompanyId,
                tenantKey,
                company
            },
            period: {
                start: periodStart ? periodStart.toISOString() : null,
                end: periodEnd ? periodEnd.toISOString() : null,
                generatedAt: new Date().toISOString()
            },
            capabilities: {
                profileKey: capabilities[0]?.profileKey || 'standard',
                sources: capabilities.map(capability => ({
                    sourceKey: capability.sourceKey,
                    isExpected: capability.isExpected,
                    isEnabled: capability.isEnabled,
                    refreshMode: capability.refreshMode
                }))
            },
            sources: sourceSummaries,
            metrics,
            evidence,
            warnings,
            dataCompleteness,
            previousIntelligence: previousOutputs,
            aiInstructions: {
                useOnlyStackCTRLData: true,
                doNotInventFacts: true,
                markMissingDataClearly: true
            }
        };

        const sourceFreshness = Object.fromEntries(sources.map(source => [source.sourceKey, {
            status: source.status,
            lastUpdated: source.freshness.lastUpdated,
            ageMinutes: source.freshness.ageMinutes
        }]));

        return {
            companyId: numericCompanyId,
            tenantKey,
            periodStart,
            periodEnd,
            sourceFreshness,
            metrics,
            evidence,
            sources,
            capabilities,
            dataCompleteness,
            context,
            dataCompletenessScore
        };
    }

    async function createSnapshot({ companyId, options = {}, user = {} }) {
        const built = await buildTenantAIContext(companyId, options);
        const snapshotType = String(options.snapshotType || 'ai_context').slice(0, 80);
        return persistBuiltSnapshot({ built, snapshotType, user });
    }

    async function createSnapshotFromBuiltContext({ built, snapshotType = 'scheduled', user = {} }) {
        if (!built?.companyId || !built?.context || !Array.isArray(built.sources)) {
            throw new Error('A valid collected tenant context is required');
        }
        return persistBuiltSnapshot({
            built,
            snapshotType: String(snapshotType).slice(0, 80),
            user
        });
    }

    async function persistBuiltSnapshot({ built, snapshotType, user }) {
        const connection = await pool.getConnection();
        let snapshotId;
        try {
            await connection.beginTransaction();
            const [result] = await connection.query(
                `INSERT INTO StackCTRLTenantEvidenceSnapshots
                 (CompanyID, TenantKey, PeriodStart, PeriodEnd, SnapshotType,
                  SourceFreshnessJson, MetricsJson, EvidenceJson, ContextJson,
                  DataCompletenessScore, CreatedByUserID, CreatedByEmail)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    built.companyId,
                    built.tenantKey,
                    built.periodStart,
                    built.periodEnd,
                    snapshotType,
                    JSON.stringify(built.sourceFreshness),
                    JSON.stringify(built.metrics),
                    JSON.stringify(built.evidence),
                    JSON.stringify(built.context),
                    built.dataCompletenessScore,
                    user.id || user.userId || null,
                    user.email || null
                ]
            );
            snapshotId = result.insertId;

            // We store one status row per adapter so every snapshot can be audited source by source.
            for (const source of built.sources) {
                const [statusResult] = await connection.query(
                    `INSERT INTO StackCTRLIntelligenceSourceStatus
                     (CompanyID, SnapshotID, SourceKey, DisplayName, Status, IsExpected,
                      LastUpdated, AgeMinutes, EvidenceCount, MetricsJson, WarningsJson,
                      RawReferenceJson, ErrorMessage)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        built.companyId,
                        snapshotId,
                        source.sourceKey,
                        source.displayName,
                        source.status,
                        source.isExpected ? 1 : 0,
                        toDateOrNull(source.freshness.lastUpdated),
                        source.freshness.ageMinutes,
                        source.evidence.length,
                        JSON.stringify(source.metrics || {}),
                        JSON.stringify(source.warnings || []),
                        JSON.stringify(source.rawReference || {}),
                        source.errorMessage || null
                    ]
                );

                for (const metric of flattenMetrics(source.metrics || {})) {
                    await connection.query(
                        `INSERT INTO StackCTRLIntelligenceMetrics
                         (CompanyID, SnapshotID, SourceStatusID, SourceKey, MetricName,
                          MetricLabel, MetricType, NumericValue, TextValue, BooleanValue,
                          JsonValue, PeriodStart, PeriodEnd)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            built.companyId,
                            snapshotId,
                            statusResult.insertId,
                            source.sourceKey,
                            String(metric.name || 'value').slice(0, 150),
                            String(metric.name || 'value').slice(0, 180),
                            metric.type,
                            metric.numericValue ?? null,
                            metric.textValue ?? null,
                            metric.booleanValue == null ? null : (metric.booleanValue ? 1 : 0),
                            metric.jsonValue == null ? null : JSON.stringify(metric.jsonValue),
                            built.periodStart,
                            built.periodEnd
                        ]
                    );
                }
            }
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }

        return {
            snapshotId,
            companyId: built.companyId,
            tenantKey: built.tenantKey,
            snapshotType,
            dataCompletenessScore: built.dataCompletenessScore,
            dataCompleteness: built.dataCompleteness,
            sourceStatuses: built.sources.map(source => ({
                sourceKey: source.sourceKey,
                displayName: source.displayName,
                status: source.status,
                isExpected: source.isExpected,
                freshness: source.freshness,
                warnings: source.warnings
            })),
            warnings: built.context.warnings,
            sourceFreshness: built.sourceFreshness
        };
    }

    async function bootstrap({ companyId, accessType = null, user = {} }) {
        return createSnapshot({
            companyId,
            options: {
                snapshotType: 'bootstrap',
                refresh: true,
                accessType
            },
            user
        });
    }

    async function bootstrapAvailableTenants() {
        const [companies] = await pool.query('SELECT * FROM Companies ORDER BY ID');
        const results = [];
        for (const company of companies) {
            try {
                const [recent] = await pool.query(
                    `SELECT ID FROM StackCTRLTenantEvidenceSnapshots
                     WHERE CompanyID = ?
                       AND SnapshotType = 'deployment_bootstrap'
                       AND CreatedAt >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
                     ORDER BY CreatedAt DESC LIMIT 1`,
                    [company.ID]
                );
                if (recent.length) {
                    results.push({ companyId: company.ID, snapshotId: recent[0].ID, status: 'already_stored' });
                    continue;
                }
                const snapshot = await createSnapshot({
                    companyId: company.ID,
                    options: {
                        snapshotType: 'deployment_bootstrap',
                        refresh: false,
                        persistCapabilities: true
                    }
                });
                results.push({ companyId: company.ID, snapshotId: snapshot.snapshotId, status: 'stored' });
            } catch (error) {
                logger.warn(`[StackCTRL Intelligence] Deployment bootstrap skipped company ${company.ID}:`, error.message);
                results.push({ companyId: company.ID, status: 'failed', message: error.message });
            }
        }
        return results;
    }

    function validateOutputTypes(outputTypes) {
        if (!Array.isArray(outputTypes) || !outputTypes.length) {
            throw new Error('At least one outputType is required');
        }
        const unique = [...new Set(outputTypes.map(value => String(value).trim()))];
        const invalid = unique.filter(value => !ALLOWED_OUTPUT_TYPES.has(value));
        if (invalid.length) throw new Error(`Unsupported outputTypes: ${invalid.join(', ')}`);
        return unique;
    }

    function buildAnalysisPrompt(context, outputTypes) {
        return `Analyse the supplied StackCTRL snapshot and return one JSON object.

Requested output types: ${outputTypes.join(', ')}

Return this exact top-level structure:
{
  "executive_summary": {},
  "governance_assessment": {},
  "compliance_review": {},
  "risk_register": [],
  "recommendations": [],
  "trend_analysis": [],
  "board_report": {}
}

Risk fields: domain, title, description, severity, likelihood, impact, businessImpact, evidenceSummary, recommendation.
Recommendation fields: domain, title, detail, priority, businessReason, suggestedOwner, suggestedDueDate.
Trend fields: metricName, domain, currentValue, previousValue, changePercent, direction, explanation.

Do not add claims that are not supported by the snapshot. Use empty objects or arrays for unrequested output types.

STACKCTRL SNAPSHOT:
${JSON.stringify(context)}`;
    }

    async function loadAnalysisPrompt(companyId, context, outputTypes) {
        const [rows] = await pool.query(
            `SELECT * FROM StackCTRLIntelligencePrompts
             WHERE PromptKey = 'tenant_analysis'
               AND IsActive = 1
               AND (CompanyID = ? OR CompanyID IS NULL)
             ORDER BY (CompanyID = ?) DESC, UpdatedAt DESC, ID DESC
             LIMIT 1`,
            [companyId, companyId]
        );
        const prompt = rows[0] ? normalizeStoredRow(rows[0]) : null;
        if (!prompt?.UserPromptTemplate) {
            return {
                systemPrompt: prompt?.SystemPrompt || SYSTEM_PROMPT,
                userPrompt: buildAnalysisPrompt(context, outputTypes),
                promptVersion: prompt?.PromptVersion || PROMPT_VERSION
            };
        }

        const userPrompt = String(prompt.UserPromptTemplate)
            .split('{{outputTypes}}').join(outputTypes.join(', '))
            .split('{{contextJson}}').join(JSON.stringify(context));
        return {
            systemPrompt: prompt.SystemPrompt || SYSTEM_PROMPT,
            userPrompt,
            promptVersion: prompt.PromptVersion || PROMPT_VERSION
        };
    }

    async function analyseSnapshot({ snapshotId, companyId, outputTypes, user = {}, historicalContext = null }) {
        const requestedTypes = validateOutputTypes(outputTypes);
        const [snapshots] = await pool.query(
            `SELECT * FROM StackCTRLTenantEvidenceSnapshots
             WHERE ID = ? AND CompanyID = ?
             LIMIT 1`,
            [snapshotId, companyId]
        );
        if (!snapshots.length) throw new Error('Snapshot not found');

        const snapshot = normalizeStoredRow(snapshots[0]);
        const [runResult] = await pool.query(
            `INSERT INTO StackCTRLIntelligenceRuns
             (CompanyID, SnapshotID, Status, RequestedOutputTypes, CreatedByUserID, CreatedByEmail)
             VALUES (?, ?, 'started', ?, ?, ?)`,
            [companyId, snapshotId, JSON.stringify(requestedTypes), user.id || user.userId || null, user.email || null]
        );
        const runId = runResult.insertId;

        try {
            const analysisContext = historicalContext || snapshot.ContextJson;
            const prompt = await loadAnalysisPrompt(companyId, analysisContext, requestedTypes);
            // Azure only receives the frozen StackCTRL snapshot. Vendor refreshes happen before this point.
            const completion = await azureOpenAI.createJsonCompletion({
                temperature: 0.1,
                maxTokens: 5000,
                messages: [
                    { role: 'system', content: prompt.systemPrompt },
                    { role: 'user', content: prompt.userPrompt }
                ]
            });
            const analysis = completion.data;
            const connection = await pool.getConnection();
            const outputIds = {};

            try {
                await connection.beginTransaction();

                for (const outputType of requestedTypes) {
                    const content = analysis[outputType] ?? (outputType.endsWith('_register') || outputType.endsWith('_analysis') || outputType === 'recommendations' ? [] : {});
                    const summary = typeof content?.executiveSummary === 'string'
                        ? content.executiveSummary
                        : typeof content?.summary === 'string'
                            ? content.summary
                            : outputType === 'executive_summary' && typeof content === 'string'
                                ? content
                                : null;
                    const confidence = toNullableNumber(content?.confidenceScore ?? analysis.confidenceScore);
                    const [outputResult] = await connection.query(
                        `INSERT INTO StackCTRLTenantAIOutputs
                         (CompanyID, SnapshotID, OutputType, Title, ExecutiveSummary, ContentJson,
                          ModelName, AzureDeployment, PromptVersion, ConfidenceScore, Status,
                          CreatedByUserID, CreatedByEmail)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
                        [
                            companyId,
                            snapshotId,
                            outputType,
                            OUTPUT_TITLES[outputType],
                            summary,
                            JSON.stringify(content),
                            completion.deployment,
                            completion.deployment,
                            prompt.promptVersion,
                            confidence,
                            user.id || user.userId || null,
                            user.email || null
                        ]
                    );
                    outputIds[outputType] = outputResult.insertId;
                }

                if (requestedTypes.includes('risk_register')) {
                    for (const risk of Array.isArray(analysis.risk_register) ? analysis.risk_register : []) {
                        await connection.query(
                            `INSERT INTO StackCTRLTenantRiskRegister
                             (CompanyID, SnapshotID, AIOutputID, Domain, RiskTitle, RiskDescription,
                              Severity, Likelihood, Impact, BusinessImpact, EvidenceSummary, Recommendation)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                companyId, snapshotId, outputIds.risk_register,
                                String(risk.domain || 'General').slice(0, 120),
                                String(risk.title || 'Untitled risk').slice(0, 255),
                                risk.description || null,
                                String(risk.severity || 'Unknown').slice(0, 50),
                                risk.likelihood || null,
                                risk.impact || null,
                                risk.businessImpact || null,
                                risk.evidenceSummary || null,
                                risk.recommendation || null
                            ]
                        );
                    }
                }

                if (requestedTypes.includes('recommendations')) {
                    for (const recommendation of Array.isArray(analysis.recommendations) ? analysis.recommendations : []) {
                        await connection.query(
                            `INSERT INTO StackCTRLTenantRecommendations
                             (CompanyID, SnapshotID, AIOutputID, Domain, RecommendationTitle,
                              RecommendationDetail, Priority, BusinessReason, SuggestedOwner, SuggestedDueDate)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                companyId, snapshotId, outputIds.recommendations,
                                String(recommendation.domain || 'General').slice(0, 120),
                                String(recommendation.title || 'Untitled recommendation').slice(0, 255),
                                recommendation.detail || null,
                                String(recommendation.priority || 'Unspecified').slice(0, 50),
                                recommendation.businessReason || null,
                                recommendation.suggestedOwner || null,
                                toNullableDate(recommendation.suggestedDueDate)
                            ]
                        );
                    }
                }

                if (requestedTypes.includes('trend_analysis')) {
                    for (const trend of Array.isArray(analysis.trend_analysis) ? analysis.trend_analysis : []) {
                        await connection.query(
                            `INSERT INTO StackCTRLTenantTrendAnalysis
                             (CompanyID, SnapshotID, AIOutputID, MetricName, Domain, CurrentValue,
                              PreviousValue, ChangePercent, Direction, Explanation)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                companyId, snapshotId, outputIds.trend_analysis,
                                String(trend.metricName || 'Unspecified metric').slice(0, 150),
                                trend.domain || null,
                                toNullableNumber(trend.currentValue),
                                toNullableNumber(trend.previousValue),
                                toNullableNumber(trend.changePercent),
                                trend.direction || null,
                                trend.explanation || null
                            ]
                        );
                    }
                }

                await connection.query(
                    `UPDATE StackCTRLIntelligenceRuns
                     SET Status = 'completed', CompletedAt = NOW()
                     WHERE ID = ?`,
                    [runId]
                );
                await connection.commit();
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }

            return {
                runId,
                snapshotId: Number(snapshotId),
                companyId: Number(companyId),
                outputIds,
                preview: {
                    executiveSummary: analysis.executive_summary?.summary || analysis.executive_summary?.executiveSummary || null,
                    risks: Array.isArray(analysis.risk_register) ? analysis.risk_register.length : 0,
                    recommendations: Array.isArray(analysis.recommendations) ? analysis.recommendations.length : 0,
                    trends: Array.isArray(analysis.trend_analysis) ? analysis.trend_analysis.length : 0
                }
            };
        } catch (error) {
            await pool.query(
                `UPDATE StackCTRLIntelligenceRuns
                 SET Status = 'failed', CompletedAt = NOW(), ErrorMessage = ?
                 WHERE ID = ?`,
                [String(error.message || 'Analysis failed').slice(0, 5000), runId]
            ).catch(updateError => logger.error('[StackCTRL Intelligence] Failed to update run status:', updateError.message));
            throw error;
        }
    }

    async function getLatest({ companyId, outputType = null }) {
        const params = [companyId];
        let filter = '';
        if (outputType) {
            if (!ALLOWED_OUTPUT_TYPES.has(outputType)) throw new Error('Unsupported outputType');
            filter = ' AND OutputType = ?';
            params.push(outputType);
        }

        const [outputs] = await pool.query(
            `SELECT * FROM StackCTRLTenantAIOutputs
             WHERE CompanyID = ?${filter}
             ORDER BY CreatedAt DESC
             LIMIT 50`,
            params
        );
        const normalizedOutputs = outputs.map(normalizeStoredRow);
        const outputIds = normalizedOutputs.map(item => item.ID);
        if (!outputIds.length) return { outputs: [], risks: [], recommendations: [], trends: [] };

        const [risks, recommendations, trends] = await Promise.all([
            pool.query('SELECT * FROM StackCTRLTenantRiskRegister WHERE CompanyID = ? AND AIOutputID IN (?) ORDER BY CreatedAt DESC', [companyId, outputIds]),
            pool.query('SELECT * FROM StackCTRLTenantRecommendations WHERE CompanyID = ? AND AIOutputID IN (?) ORDER BY CreatedAt DESC', [companyId, outputIds]),
            pool.query('SELECT * FROM StackCTRLTenantTrendAnalysis WHERE CompanyID = ? AND AIOutputID IN (?) ORDER BY CreatedAt DESC', [companyId, outputIds])
        ]);

        return {
            outputs: normalizedOutputs,
            risks: risks[0].map(normalizeStoredRow),
            recommendations: recommendations[0].map(normalizeStoredRow),
            trends: trends[0].map(normalizeStoredRow)
        };
    }

    async function getPowerBIData(companyId) {
        const [outputs, risks, recommendations, trends] = await Promise.all([
            pool.query(
                `SELECT ID, CompanyID, SnapshotID, OutputType, Title, ExecutiveSummary,
                        ModelName, AzureDeployment, PromptVersion, ConfidenceScore, Status, CreatedAt
                 FROM StackCTRLTenantAIOutputs WHERE CompanyID = ? ORDER BY CreatedAt DESC LIMIT 1000`,
                [companyId]
            ),
            pool.query('SELECT * FROM StackCTRLTenantRiskRegister WHERE CompanyID = ? ORDER BY CreatedAt DESC LIMIT 5000', [companyId]),
            pool.query('SELECT * FROM StackCTRLTenantRecommendations WHERE CompanyID = ? ORDER BY CreatedAt DESC LIMIT 5000', [companyId]),
            pool.query('SELECT * FROM StackCTRLTenantTrendAnalysis WHERE CompanyID = ? ORDER BY CreatedAt DESC LIMIT 5000', [companyId])
        ]);

        return {
            outputs: outputs[0].map(normalizeStoredRow),
            risks: risks[0].map(normalizeStoredRow),
            recommendations: recommendations[0].map(normalizeStoredRow),
            trends: trends[0].map(normalizeStoredRow)
        };
    }

    return {
        buildTenantAIContext,
        createSnapshot,
        createSnapshotFromBuiltContext,
        bootstrap,
        bootstrapAvailableTenants,
        analyseSnapshot,
        getLatest,
        getPowerBIData,
        validateOutputTypes
    };
}

module.exports = {
    ALLOWED_OUTPUT_TYPES,
    SYSTEM_PROMPT,
    createStackCTRLIntelligenceService
};
