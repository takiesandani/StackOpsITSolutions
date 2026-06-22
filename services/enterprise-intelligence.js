const { DateTime } = require('luxon');

const ENTERPRISE_DOMAINS = Object.freeze([
    { key: 'identity', name: 'Identity Protection', sourceKey: 'identity', mode: 'enterprise_domain_identity', riskKey: 'identity', healthKey: 'identityHealth', focus: ['MFA coverage', 'users without MFA', 'privileged accounts', 'admin roles', 'legacy authentication', 'risky sign-ins', 'external users', 'Conditional Access gaps'] },
    { key: 'devices', name: 'Device Protection', sourceKey: 'devices', mode: 'enterprise_domain_devices', riskKey: 'devices', healthKey: 'deviceHealth', focus: ['compliance rate', 'stale devices', 'non-compliant devices', 'unmanaged indicators', 'endpoint security risk', 'remediation actions'] },
    { key: 'email_security', name: 'Email Security', sourceKey: 'email_security', mode: 'enterprise_domain_email_security', riskKey: 'email', healthKey: 'emailHealth', focus: ['active threats', 'unresolved threats', 'phishing and malware indicators', 'response posture', 'resolution rate', 'user exposure'] },
    { key: 'cloudflare_network_security', name: 'Network Security / Cloudflare', sourceKey: 'cloudflare_network_security', mode: 'enterprise_domain_cloudflare_network_security', riskKey: 'network', healthKey: null, focus: ['network posture', 'WAF and firewall controls', 'DNS posture', 'SSL/TLS posture', 'bot protection', 'rate limiting', 'security events', 'unknown controls'] },
    { key: 'governance', name: 'Governance', sourceKey: 'governance', mode: 'enterprise_domain_governance', riskKey: 'governance', healthKey: 'governanceHealth', focus: ['access reviews', 'admin reviews', 'policy reviews', 'governance maturity', 'manual review needs', 'evidence gaps'] },
    { key: 'compliance', name: 'Compliance Validation', sourceKey: 'compliance', mode: 'enterprise_domain_compliance', riskKey: 'compliance', healthKey: 'complianceHealth', focus: ['control status', 'failed controls', 'partial controls', 'manual-review controls', 'compliance readiness', 'evidence gaps'] },
    { key: 'security_alerts', name: 'Security Alerts', sourceKey: 'security_alerts', mode: 'enterprise_domain_security_alerts', riskKey: 'security', healthKey: 'securityHealth', focus: ['alert severity', 'high-severity alerts', 'anonymous IP sign-ins', 'active incidents', 'incident response posture', 'containment actions'] },
    { key: 'operations', name: 'Operations', sourceKey: 'operations', mode: 'enterprise_domain_operations', riskKey: 'operations', healthKey: 'operationsHealth', focus: ['data freshness', 'stale operational evidence', 'failed tasks', 'service health', 'operational risk', 'process gaps'] },
    { key: 'backup', name: 'Backup and Recovery', sourceKey: 'backup', mode: 'enterprise_domain_backup', riskKey: 'backup', healthKey: 'backupHealth', focus: ['backup coverage', 'third-party backup', 'immutable storage', 'restore testing', 'ransomware recovery readiness', 'business continuity'] },
    { key: 'applications', name: 'Applications', sourceKey: 'applications', mode: 'enterprise_domain_applications', riskKey: 'applications', healthKey: 'applicationsHealth', focus: ['external publishers', 'broad permissions', 'high-risk applications', 'shadow IT', 'consent risk', 'application governance'] }
]);

const DOMAIN_BY_KEY = Object.freeze(Object.fromEntries(ENTERPRISE_DOMAINS.map(domain => [domain.key, domain])));
const LOWER_PERIOD = Object.freeze({ weekly: 'daily', monthly: 'weekly', yearly: 'monthly' });
const DEFAULT_DOMAIN_DELAY_MS = 30000;
const DEFAULT_MAX_INPUT_BYTES = 350000;
const DEFAULT_MAX_TOTAL_TOKENS = 200000;
const DEFAULT_DOMAIN_OUTPUT_TOKENS = 5000;
const DEFAULT_SYNTHESIS_OUTPUT_TOKENS = 8000;

function parseJson(value, fallback = null) {
    if (value == null) return fallback;
    if (Buffer.isBuffer(value)) value = value.toString('utf8');
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return fallback; }
}

function bytes(value) {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
}

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function textOrNull(value, maximum = 100000) {
    if (value === null || value === undefined || value === '') return null;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.slice(0, maximum);
}

function array(value) {
    return Array.isArray(value) ? value : [];
}

function safeValue(value, depth = 0, limits = {}) {
    const maxDepth = limits.maxDepth ?? 6;
    const maxArray = limits.maxArray ?? 20;
    const maxString = limits.maxString ?? 2000;
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.slice(0, maxString);
    if (depth >= maxDepth) return Array.isArray(value) ? `[${value.length} items omitted]` : '[nested detail omitted]';
    if (Array.isArray(value)) return value.slice(0, maxArray).map(item => safeValue(item, depth + 1, limits));
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).slice(0, 80).map(([key, nested]) => [key, safeValue(nested, depth + 1, limits)]));
    }
    return String(value).slice(0, maxString);
}

function deepItemCount(value, depth = 0) {
    if (value == null || depth > 5) return 0;
    if (Array.isArray(value)) return value.length + value.reduce((total, item) => total + deepItemCount(item, depth + 1), 0);
    if (typeof value === 'object') return Object.values(value).reduce((total, item) => total + deepItemCount(item, depth + 1), 0);
    return 1;
}

function primitiveMetricCount(value, depth = 0) {
    if (value == null || depth > 6) return 0;
    if (Array.isArray(value)) return 0;
    if (typeof value === 'object') return Object.values(value).reduce((total, nested) => total + primitiveMetricCount(nested, depth + 1), 0);
    return 1;
}

function periodWindow(periodType, referenceDate = new Date()) {
    const type = String(periodType || 'daily').toLowerCase();
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(type)) throw new Error('Period type must be daily, weekly, monthly, or yearly');
    const local = DateTime.fromJSDate(referenceDate instanceof Date ? referenceDate : new Date(referenceDate), { zone: 'utc' }).setZone('Africa/Johannesburg');
    const start = type === 'daily' ? local.startOf('day') : type === 'weekly' ? local.startOf('week') : type === 'monthly' ? local.startOf('month') : local.startOf('year');
    const end = type === 'daily' ? local.endOf('day') : type === 'weekly' ? local.endOf('week') : type === 'monthly' ? local.endOf('month') : local.endOf('year');
    return { periodType: type, periodStart: start.toUTC().toJSDate(), periodEnd: end.toUTC().toJSDate() };
}

function jsonArray(value) {
    return JSON.stringify(array(value));
}

function responseUsage(response = {}) {
    const usage = response.usage || {};
    return {
        inputTokens: Number(usage.input_tokens ?? usage.inputTokens ?? 0) || 0,
        outputTokens: Number(usage.output_tokens ?? usage.outputTokens ?? 0) || 0,
        totalTokens: Number(usage.total_tokens ?? usage.totalTokens ?? 0) || 0,
        requestBytes: Number(response.requestSizeBytes || 0),
        responseBytes: Number(response.responseSizeBytes || 0),
        retries: Number(response.retryCount || 0)
    };
}

function createEnterpriseIntelligenceService({
    pool,
    azureOpenAI,
    schedulerService,
    logger = console,
    wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
    config = {}
} = {}) {
    if (!pool || !azureOpenAI || !schedulerService) throw new Error('Enterprise Intelligence requires database, Azure, and historical scheduler services');

    const settings = Object.freeze({
        domainDelayMs: Math.max(0, Number(config.domainDelayMs ?? process.env.ENTERPRISE_AI_DOMAIN_DELAY_MS) || DEFAULT_DOMAIN_DELAY_MS),
        maxRetries: Math.max(0, Number(config.maxRetries ?? process.env.ENTERPRISE_AI_MAX_RETRIES) || 3),
        concurrency: Math.max(1, Math.min(4, Number(config.concurrency ?? process.env.ENTERPRISE_AI_CONCURRENCY) || 1)),
        maxInputBytes: Math.max(50000, Number(config.maxInputBytes ?? process.env.ENTERPRISE_AI_MAX_INPUT_BYTES_PER_DOMAIN) || DEFAULT_MAX_INPUT_BYTES),
        maxDomainOutputTokens: Math.max(1000, Number(config.maxDomainOutputTokens ?? process.env.ENTERPRISE_AI_MAX_OUTPUT_TOKENS_PER_DOMAIN) || DEFAULT_DOMAIN_OUTPUT_TOKENS),
        maxSynthesisOutputTokens: Math.max(2000, Number(config.maxSynthesisOutputTokens ?? process.env.ENTERPRISE_AI_MAX_OUTPUT_TOKENS_SYNTHESIS) || DEFAULT_SYNTHESIS_OUTPUT_TOKENS),
        maxTotalTokens: Math.max(10000, Number(config.maxTotalTokens ?? process.env.ENTERPRISE_AI_MAX_TOTAL_TOKENS) || DEFAULT_MAX_TOTAL_TOKENS),
        requestTimeoutMs: Math.max(60000, Number(config.requestTimeoutMs ?? process.env.ENTERPRISE_AI_REQUEST_TIMEOUT_MS) || 180000)
    });

    async function loadSnapshot(companyId, snapshotId = null) {
        const where = snapshotId ? 'ID = ? AND CompanyID = ?' : 'CompanyID = ? ORDER BY ID DESC LIMIT 1';
        const params = snapshotId ? [Number(snapshotId), Number(companyId)] : [Number(companyId)];
        const [rows] = await pool.query(
            `SELECT ID, CompanyID, TenantKey, SnapshotType, PeriodStart, PeriodEnd,
                    SourceFreshnessJson, MetricsJson, ContextJson, DataCompletenessScore, CreatedAt
             FROM StackCTRLTenantEvidenceSnapshots WHERE ${where}`,
            params
        );
        if (!rows.length) throw new Error('Create a frozen StackCTRL snapshot before running Enterprise Deep Reporting');
        return rows[0];
    }

    async function loadKnowledge(domainKey) {
        try {
            const [rows] = await pool.query(
                `SELECT Title, SourceType, SourceUrl, ContentSummary, BestPracticeJson
                 FROM StackCTRLKnowledgeBase
                 WHERE DomainKey = ? AND IsActive = 1
                 ORDER BY UpdatedAt DESC, ID DESC LIMIT 20`,
                [domainKey]
            );
            return rows.map(row => ({
                title: row.Title,
                sourceType: row.SourceType,
                sourceUrl: row.SourceUrl,
                contentSummary: row.ContentSummary,
                bestPractices: safeValue(parseJson(row.BestPracticeJson, {}), 0, { maxArray: 20 })
            }));
        } catch (error) {
            if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
            return [];
        }
    }

    async function loadPreviousDomain(companyId, domainKey, currentRunId) {
        const [rows] = await pool.query(
            `SELECT ID, PeriodType, PeriodStart, PeriodEnd, HealthScore, RiskScore, RiskLevel,
                    DomainExecutiveSummary, BusinessImpact, CurrentPosture, FindingsJson,
                    RisksJson, RecommendationsJson, TrendAnalysisJson, ConfidenceScore, CreatedAt
             FROM StackCTRLTenantDomainIntelligence
             WHERE CompanyID = ? AND DomainKey = ? AND Status = 'completed' AND RunID <> ?
             ORDER BY ID DESC LIMIT 1`,
            [companyId, domainKey, currentRunId]
        );
        if (!rows[0]) return null;
        const row = rows[0];
        return {
            id: row.ID,
            periodType: row.PeriodType,
            periodStart: row.PeriodStart,
            periodEnd: row.PeriodEnd,
            healthScore: row.HealthScore,
            riskScore: row.RiskScore,
            riskLevel: row.RiskLevel,
            executiveSummary: row.DomainExecutiveSummary,
            businessImpact: row.BusinessImpact,
            currentPosture: row.CurrentPosture,
            topFindings: array(parseJson(row.FindingsJson, [])).slice(0, 10),
            topRisks: array(parseJson(row.RisksJson, [])).slice(0, 10),
            topRecommendations: array(parseJson(row.RecommendationsJson, [])).slice(0, 10),
            trends: array(parseJson(row.TrendAnalysisJson, [])).slice(0, 10),
            confidenceScore: row.ConfidenceScore,
            createdAt: row.CreatedAt
        };
    }

    function domainFromSnapshot(snapshot, domain) {
        const context = parseJson(snapshot.ContextJson, {}) || {};
        const metrics = parseJson(snapshot.MetricsJson, {}) || {};
        const source = array(context.sources).find(item => item.sourceKey === domain.sourceKey) || {};
        const risk = context.riskEngine || metrics.stackctrl_risk || {};
        const health = risk.domainHealthScores?.[domain.riskKey] ?? risk.executiveKPIs?.[domain.healthKey] ?? metrics.executive_kpis?.[domain.healthKey] ?? null;
        const riskScore = risk.domainRiskScores?.[domain.riskKey] ?? metrics.stackctrl_risk?.domainRiskScores?.[domain.riskKey] ?? null;
        const evidence = array(source.evidence);
        return {
            context,
            source,
            metrics: source.metrics || metrics[domain.sourceKey] || {},
            dashboardMetrics: source.dashboardMetrics || {},
            calculatedIndicators: source.calculatedIndicators || {},
            evidence,
            healthScore: numberOrNull(health),
            riskScore: numberOrNull(riskScore),
            riskLevel: riskScore == null ? 'not_scored' : riskScore >= 75 ? 'critical' : riskScore >= 50 ? 'high' : riskScore >= 25 ? 'moderate' : 'low'
        };
    }

    function historicalDomainContext(historicalContext, domain) {
        const result = {};
        for (const [key, comparison] of Object.entries(historicalContext?.comparisons || {})) {
            const snapshot = comparison?.snapshot;
            if (!snapshot) {
                result[key] = { availability: 'unavailable', warning: `No ${key} baseline is available.` };
                continue;
            }
            const baselineContext = snapshot.context || {};
            const baselineSource = array(baselineContext.sources).find(source => source.sourceKey === domain.sourceKey) || {};
            const baselineRisk = baselineContext.riskEngine || {};
            result[key] = {
                availability: comparison.availability,
                snapshotId: snapshot.snapshotId,
                createdAt: snapshot.createdAt,
                differenceMinutes: comparison.differenceMinutes,
                sourceStatus: baselineSource.status || null,
                metrics: safeValue(baselineSource.metrics || snapshot.metrics?.[domain.sourceKey] || {}, 0, { maxArray: 0, maxString: 800 }),
                healthScore: numberOrNull(baselineRisk.domainHealthScores?.[domain.riskKey] ?? baselineRisk.executiveKPIs?.[domain.healthKey]),
                riskScore: numberOrNull(baselineRisk.domainRiskScores?.[domain.riskKey]),
                metricChanges: safeValue(Object.fromEntries(Object.entries(comparison.metricChanges || {}).filter(([name]) =>
                    name.startsWith(`${domain.sourceKey}.`) || name.endsWith(`domainRiskScores.${domain.riskKey}`) || (domain.healthKey && name.endsWith(domain.healthKey))
                )), 0, { maxArray: 0 })
            };
        }
        return result;
    }

    function selectedEvidence(evidence, maximum = 30) {
        return evidence.slice(0, maximum).map((item, index) => ({
            evidenceNumber: index + 1,
            evidenceType: item?.evidenceType || item?.type || 'stored_evidence',
            data: safeValue(item?.data ?? item, 0, { maxDepth: 6, maxArray: 15, maxString: 1600 })
        }));
    }

    async function buildDomainPackage({ companyId, snapshot, runId, domain, historicalContext }) {
        const current = domainFromSnapshot(snapshot, domain);
        const knowledge = await loadKnowledge(domain.key);
        const previousAnalysis = await loadPreviousDomain(companyId, domain.key, runId);
        const stackCTRLDataCount = deepItemCount(current.evidence);
        let includedEvidence = selectedEvidence(current.evidence);
        const base = {
            contextType: 'stackctrl_enterprise_domain_intelligence',
            schemaVersion: 1,
            mode: domain.mode,
            companyId,
            snapshotId: Number(snapshot.ID),
            snapshotCreatedAt: snapshot.CreatedAt,
            domain: { key: domain.key, name: domain.name, focusAreas: domain.focus },
            sourceHealth: {
                sourceKey: domain.sourceKey,
                status: current.source.status || 'missing',
                isExpected: Boolean(current.source.isExpected),
                freshness: safeValue(current.source.freshness || {}, 0, { maxArray: 0 }),
                warnings: array(current.source.warnings).slice(0, 20),
                errorMessage: current.source.errorMessage || null,
                evidenceCount: current.evidence.length
            },
            currentMetrics: safeValue(current.metrics, 0, { maxDepth: 7, maxArray: 10, maxString: 1200 }),
            dashboardMetrics: safeValue(current.dashboardMetrics, 0, { maxDepth: 6, maxArray: 10 }),
            calculatedIndicators: safeValue(current.calculatedIndicators, 0, { maxDepth: 6, maxArray: 10 }),
            authoritativeScores: { healthScore: current.healthScore, riskScore: current.riskScore, riskLevel: current.riskLevel },
            historicalComparisons: historicalDomainContext(historicalContext, domain),
            previousDomainAnalysis: previousAnalysis,
            knowledgeGrounding: knowledge,
            knowledgeWarning: knowledge.length ? null : `No curated ${domain.name} knowledge references are currently available.`,
            evidence: includedEvidence,
            limitations: {
                rawVendorPayloadIncluded: false,
                rawSnapshotContextIncluded: false,
                missingDataWarnings: [
                    ...array(current.source.warnings),
                    ...(!knowledge.length ? [`Curated ${domain.name} best-practice references were unavailable.`] : [])
                ]
            }
        };

        while (bytes(base) > settings.maxInputBytes && includedEvidence.length > 1) {
            includedEvidence = includedEvidence.slice(0, Math.max(1, Math.floor(includedEvidence.length * 0.75)));
            base.evidence = includedEvidence;
        }
        if (bytes(base) > settings.maxInputBytes) {
            base.evidence = includedEvidence.map(item => ({ evidenceNumber: item.evidenceNumber, evidenceType: item.evidenceType, data: safeValue(item.data, 0, { maxDepth: 3, maxArray: 5, maxString: 500 }) }));
            base.limitations.detailReducedToMeetInputLimit = true;
        }
        const inputSizeBytes = bytes(base);
        if (inputSizeBytes > settings.maxInputBytes) throw new Error(`${domain.name} package exceeds ENTERPRISE_AI_MAX_INPUT_BYTES_PER_DOMAIN`);
        const sentToAzureCount = deepItemCount(base.evidence);
        return {
            package: base,
            current,
            audit: {
                stackCTRLDataCount,
                sentToAzureCount,
                omittedCount: Math.max(0, stackCTRLDataCount - sentToAzureCount),
                metricsIncludedCount: primitiveMetricCount(base.currentMetrics) + primitiveMetricCount(base.dashboardMetrics) + primitiveMetricCount(base.calculatedIndicators),
                evidenceIncludedCount: base.evidence.length,
                evidenceOmittedCount: Math.max(0, current.evidence.length - base.evidence.length),
                historicalComparisonsIncluded: Object.values(base.historicalComparisons).filter(item => item.availability === 'available').length,
                inputSizeBytes
            }
        };
    }

    function domainPrompt(domain, packageValue) {
        return `You are StackCTRL Enterprise Intelligence. Analyse only the supplied frozen StackCTRL ${domain.name} package.
Azure builds structured enterprise intelligence; Power BI builds the final report. Do not create layouts, visuals, HTML, dashboard instructions, or Power BI files.
Do not claim direct access to Microsoft Graph, Cloudflare, or another vendor. Do not invent missing controls or evidence.
Every posture claim must identify supporting evidence, assessed areas, confirmed controls, unknown controls, gaps, movement, business impact, and recommended action.
StackCTRL authoritative scores must be justified but never recalculated or replaced.

Return valid JSON with exactly these fields:
{
  "domainExecutiveSummary": "",
  "technicalSummary": "",
  "businessImpact": "",
  "currentPosture": "",
  "evidenceUsed": [],
  "evidenceGaps": [],
  "scoreJustification": "",
  "controlAssessment": {},
  "keyFindings": [],
  "risks": [],
  "recommendations": [],
  "trendAnalysis": [],
  "yesterdayVsToday": {},
  "whatImproved": [],
  "whatDeteriorated": [],
  "whatStayedTheSame": [],
  "missingDataWarnings": [],
  "assumptions": [],
  "confidenceScore": null,
  "managementActions": [],
  "powerBiSummary": {}
}

Finding fields: title, description, severity, status, evidenceSummary, businessImpact.
Risk fields: title, description, severity, likelihood, impact, businessImpact, evidenceSummary, recommendation.
Recommendation/action fields: title, detail, priority, businessReason, suggestedOwner, suggestedDueDate.
Trend fields: metricName, currentValue, previousValue, changePercent, direction, comparisonPeriod, explanation.
Use empty arrays, objects, or null when evidence is unavailable. Clearly state limitations instead of filling gaps with assumptions.

STACKCTRL DOMAIN PACKAGE:
${JSON.stringify(packageValue)}`;
    }

    function synthesisPrompt(packageValue) {
        return `You are StackCTRL Enterprise Intelligence. Create a premium enterprise cybersecurity synthesis from stored domain intelligence only.
Azure builds the intelligence; Power BI builds the report. Do not create layouts, visuals, HTML, styling instructions, report pages, or Power BI files.
Do not invent facts or recalculate StackCTRL scores. Reconcile conflicts, identify evidence gaps, explain business impact, and retain domain traceability.

Return valid JSON with exactly these fields:
{
  "enterpriseExecutiveSummary": {},
  "boardReport": {},
  "managementReport": {},
  "riskRegister": [],
  "recommendations": [],
  "trendAnalysis": [],
  "complianceReview": {},
  "governanceReview": {},
  "domainScorecard": [],
  "maturityAssessment": {},
  "businessImpactSummary": "",
  "topDecisionsRequired": [],
  "next30DaysPlan": [],
  "next90DaysPlan": [],
  "evidenceJustificationSummary": {},
  "limitationsAndAssumptions": [],
  "powerBiSummary": {}
}

Risk, recommendation, trend, and management action fields must follow the domain output field names. Preserve domain keys in every row-based item.

STORED STACKCTRL ENTERPRISE INTELLIGENCE:
${JSON.stringify(packageValue)}`;
    }

    async function createRun({ companyId, snapshotId, periodType, referenceDate, mode, deduplicationKey = null }) {
        const window = periodWindow(periodType, referenceDate);
        let result;
        try {
            [result] = await pool.query(
                `INSERT INTO StackCTRLEnterpriseReportRuns
                 (CompanyID, SnapshotID, PeriodType, PeriodStart, PeriodEnd, Status, Mode, DeduplicationKey, StartedAt)
                 VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NOW())`,
                [companyId, snapshotId || null, window.periodType, window.periodStart, window.periodEnd, mode, deduplicationKey]
            );
        } catch (error) {
            if (error?.code !== 'ER_DUP_ENTRY' || !deduplicationKey) throw error;
            const [rows] = await pool.query(`SELECT ID, Status FROM StackCTRLEnterpriseReportRuns WHERE DeduplicationKey = ? LIMIT 1`, [deduplicationKey]);
            return { id: Number(rows[0]?.ID), ...window, mode, duplicate: true, status: rows[0]?.Status || 'duplicate' };
        }
        await pool.query(`UPDATE StackCTRLEnterpriseReportRuns SET Status = 'processing' WHERE ID = ?`, [result.insertId]);
        return { id: Number(result.insertId), ...window, mode };
    }

    function normalizedDomainResult(data, domain, current) {
        const value = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        return {
            ...value,
            domainExecutiveSummary: textOrNull(value.domainExecutiveSummary),
            technicalSummary: textOrNull(value.technicalSummary),
            businessImpact: textOrNull(value.businessImpact),
            currentPosture: textOrNull(value.currentPosture),
            evidenceUsed: array(value.evidenceUsed),
            evidenceGaps: array(value.evidenceGaps),
            scoreJustification: textOrNull(value.scoreJustification),
            controlAssessment: value.controlAssessment || {},
            keyFindings: array(value.keyFindings),
            risks: array(value.risks),
            recommendations: array(value.recommendations),
            trendAnalysis: array(value.trendAnalysis),
            yesterdayVsToday: value.yesterdayVsToday || {},
            whatImproved: array(value.whatImproved),
            whatDeteriorated: array(value.whatDeteriorated),
            whatStayedTheSame: array(value.whatStayedTheSame),
            missingDataWarnings: array(value.missingDataWarnings),
            assumptions: array(value.assumptions),
            confidenceScore: numberOrNull(value.confidenceScore),
            managementActions: array(value.managementActions),
            powerBiSummary: value.powerBiSummary || {},
            authoritativeScores: { healthScore: current.healthScore, riskScore: current.riskScore, riskLevel: current.riskLevel },
            domain: { key: domain.key, name: domain.name }
        };
    }

    async function insertItem({ companyId, snapshotId, runId, domainKey, domainName, period, itemType, item, source }) {
        const title = item?.title || item?.metricName || item?.name || item?.action || `${domainName} ${itemType}`;
        await pool.query(
            `INSERT INTO StackCTRLEnterpriseIntelligenceItems
             (CompanyID, SnapshotID, RunID, DomainKey, DomainName, PeriodType, PeriodStart, PeriodEnd,
              ItemType, Title, Description, Severity, Priority, Status, Likelihood, Impact,
              BusinessImpact, EvidenceSummary, Recommendation, SuggestedOwner, SuggestedDueDate,
              Direction, CurrentValue, PreviousValue, ChangePercent, ComparisonPeriod, SourceStage, CreatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                companyId, snapshotId || null, runId, domainKey, domainName,
                period.periodType, period.periodStart, period.periodEnd, itemType,
                textOrNull(title, 255), textOrNull(item?.description || item?.detail || item?.explanation),
                textOrNull(item?.severity, 50), textOrNull(item?.priority, 50), textOrNull(item?.status, 50),
                textOrNull(item?.likelihood, 80), textOrNull(item?.impact, 120),
                textOrNull(item?.businessImpact || item?.businessReason), textOrNull(item?.evidenceSummary),
                textOrNull(item?.recommendation), textOrNull(item?.suggestedOwner || item?.owner, 180),
                item?.suggestedDueDate || item?.dueDate || null, textOrNull(item?.direction, 50),
                numberOrNull(item?.currentValue), numberOrNull(item?.previousValue), numberOrNull(item?.changePercent),
                textOrNull(item?.comparisonPeriod, 50), source
            ]
        );
    }

    async function deleteItemsForDomainRun({ runId, domainKey }) {
        // Delete old items for this RunID + DomainKey before reinserting (prevents duplicates on reruns)
        await pool.query(
            `DELETE FROM StackCTRLEnterpriseIntelligenceItems WHERE RunID = ? AND DomainKey = ?`,
            [runId, domainKey]
        );
    }

    async function storeItems({ companyId, snapshotId, runId, domain, period, analysis, source = 'domain' }) {
        // Clean up old items for this domain run before inserting new ones (makes reruns idempotent)
        await deleteItemsForDomainRun({ runId, domainKey: domain.key });
        
        const groups = [
            ['finding', analysis.keyFindings],
            ['risk', analysis.risks || analysis.riskRegister],
            ['recommendation', analysis.recommendations],
            ['trend', analysis.trendAnalysis],
            ['management_action', analysis.managementActions],
            ['decision', analysis.topDecisionsRequired],
            ['management_action', analysis.next30DaysPlan],
            ['management_action', analysis.next90DaysPlan]
        ];
        for (const [itemType, items] of groups) {
            for (const itemValue of array(items)) {
                const item = typeof itemValue === 'string' ? { title: itemValue } : itemValue;
                await insertItem({ companyId, snapshotId, runId, domainKey: item?.domainKey || domain.key, domainName: item?.domainName || domain.name, period, itemType, item, source });
            }
        }
    }

    async function storeDomain({ run, companyId, snapshot, domain, packageResult, analysis, usage, status = 'completed', errorMessage = null }) {
        const evidenceSummary = analysis ? textOrNull(analysis.evidenceUsed) : null;
        const [result] = await pool.query(
            `INSERT INTO StackCTRLTenantDomainIntelligence
             (CompanyID, SnapshotID, RunID, DomainKey, DomainName, PeriodType, PeriodStart, PeriodEnd,
              HealthScore, RiskScore, RiskLevel, InputSizeBytes, ResponseSizeBytes, InputTokens,
              OutputTokens, TotalTokens, RetryCount, Status, AnalysisJson, DomainExecutiveSummary,
              TechnicalSummary, BusinessImpact, CurrentPosture, EvidenceSummary, ScoreJustification,
              ControlAssessment, FindingsJson, RisksJson, RecommendationsJson, TrendAnalysisJson,
              YesterdayVsTodayJson, MissingDataWarningsJson, AssumptionsJson, ConfidenceScore, ErrorMessage)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
              HealthScore = VALUES(HealthScore), RiskScore = VALUES(RiskScore), RiskLevel = VALUES(RiskLevel),
              InputSizeBytes = VALUES(InputSizeBytes), ResponseSizeBytes = VALUES(ResponseSizeBytes),
              InputTokens = VALUES(InputTokens), OutputTokens = VALUES(OutputTokens), TotalTokens = VALUES(TotalTokens),
              RetryCount = VALUES(RetryCount), Status = VALUES(Status), AnalysisJson = VALUES(AnalysisJson),
              DomainExecutiveSummary = VALUES(DomainExecutiveSummary), TechnicalSummary = VALUES(TechnicalSummary),
              BusinessImpact = VALUES(BusinessImpact), CurrentPosture = VALUES(CurrentPosture),
              EvidenceSummary = VALUES(EvidenceSummary), ScoreJustification = VALUES(ScoreJustification),
              ControlAssessment = VALUES(ControlAssessment), FindingsJson = VALUES(FindingsJson),
              RisksJson = VALUES(RisksJson), RecommendationsJson = VALUES(RecommendationsJson),
              TrendAnalysisJson = VALUES(TrendAnalysisJson), YesterdayVsTodayJson = VALUES(YesterdayVsTodayJson),
              MissingDataWarningsJson = VALUES(MissingDataWarningsJson), AssumptionsJson = VALUES(AssumptionsJson),
              ConfidenceScore = VALUES(ConfidenceScore), ErrorMessage = VALUES(ErrorMessage)`,
            [
                companyId, snapshot.ID, run.id, domain.key, domain.name, run.periodType, run.periodStart, run.periodEnd,
                packageResult.current.healthScore, packageResult.current.riskScore, packageResult.current.riskLevel,
                usage.requestBytes || packageResult.audit.inputSizeBytes, usage.responseBytes, usage.inputTokens, usage.outputTokens, usage.totalTokens,
                usage.retries, status, analysis ? JSON.stringify(analysis) : null,
                analysis?.domainExecutiveSummary || null, analysis?.technicalSummary || null, analysis?.businessImpact || null,
                analysis?.currentPosture || null, evidenceSummary, analysis?.scoreJustification || null,
                analysis ? JSON.stringify(analysis.controlAssessment || {}) : null,
                analysis ? jsonArray(analysis.keyFindings) : null, analysis ? jsonArray(analysis.risks) : null,
                analysis ? jsonArray(analysis.recommendations) : null, analysis ? jsonArray(analysis.trendAnalysis) : null,
                analysis ? JSON.stringify(analysis.yesterdayVsToday || {}) : null,
                analysis ? jsonArray(analysis.missingDataWarnings) : null, analysis ? jsonArray(analysis.assumptions) : null,
                analysis?.confidenceScore ?? null, errorMessage ? String(errorMessage).slice(0, 5000) : null
            ]
        );
        if (analysis) await storeItems({ companyId, snapshotId: snapshot.ID, runId: run.id, domain, period: run, analysis });
        return result.insertId || result.affectedRows;
    }

    async function storeAudit({ run, companyId, snapshot, domain, packageResult, analysis, usage, status }) {
        const combinedText = JSON.stringify(analysis || {}).toLowerCase();
        const auditInput = JSON.stringify(packageResult.package);
        const auditOmitted = JSON.stringify({
            stackCTRLDataCount: packageResult.audit.stackCTRLDataCount,
            sentToAzureCount: packageResult.audit.sentToAzureCount,
            omittedCount: packageResult.audit.omittedCount,
            evidenceOmittedCount: packageResult.audit.evidenceOmittedCount,
            detailReducedToMeetInputLimit: Boolean(packageResult.package.limitations?.detailReducedToMeetInputLimit)
        });
        const azureMentioned = combinedText.includes(domain.key.replaceAll('_', ' ')) || combinedText.includes(domain.name.toLowerCase()) ? 1 : 0;
        const risksCount = array(analysis?.risks).length;
        const recommendationsCount = array(analysis?.recommendations).length;
        const trendsCount = array(analysis?.trendAnalysis).length;
        const inputBytes = usage.requestBytes || packageResult.audit.inputSizeBytes;
        await pool.query(
            `INSERT INTO StackCTRLIntelligenceEvidenceAudit
             (CompanyID, SnapshotID, RunID, DomainKey, StackCTRLDataCount, SentToAzureCount,
              OmittedCount, MetricsIncludedCount, EvidenceIncludedCount, EvidenceOmittedCount,
              HistoricalComparisonsIncluded, AzureMentionedDomain, RisksReturnedCount,
              RecommendationsReturnedCount, TrendsReturnedCount, InputSizeBytes, OutputSizeBytes,
              InputTokens, OutputTokens, RetryCount, Status, AzureInputSummaryJson,
              OmittedSummaryJson, CreatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
              StackCTRLDataCount = ?, SentToAzureCount = ?, OmittedCount = ?, MetricsIncludedCount = ?,
              EvidenceIncludedCount = ?, EvidenceOmittedCount = ?, HistoricalComparisonsIncluded = ?,
              AzureMentionedDomain = ?, RisksReturnedCount = ?, RecommendationsReturnedCount = ?,
              TrendsReturnedCount = ?, InputSizeBytes = ?, OutputSizeBytes = ?, InputTokens = ?,
              OutputTokens = ?, RetryCount = ?, Status = ?, AzureInputSummaryJson = ?, OmittedSummaryJson = ?`,
            [
                companyId, snapshot.ID, run.id, domain.key, packageResult.audit.stackCTRLDataCount,
                packageResult.audit.sentToAzureCount, packageResult.audit.omittedCount,
                packageResult.audit.metricsIncludedCount, packageResult.audit.evidenceIncludedCount,
                packageResult.audit.evidenceOmittedCount, packageResult.audit.historicalComparisonsIncluded,
                azureMentioned, risksCount, recommendationsCount,
                trendsCount, inputBytes, usage.responseBytes, usage.inputTokens, usage.outputTokens, usage.retries, status,
                auditInput, auditOmitted,
                // ON DUPLICATE KEY UPDATE values
                packageResult.audit.stackCTRLDataCount, packageResult.audit.sentToAzureCount,
                packageResult.audit.omittedCount, packageResult.audit.metricsIncludedCount,
                packageResult.audit.evidenceIncludedCount, packageResult.audit.evidenceOmittedCount,
                packageResult.audit.historicalComparisonsIncluded, azureMentioned, risksCount,
                recommendationsCount, trendsCount, inputBytes, usage.responseBytes, usage.inputTokens,
                usage.outputTokens, usage.retries, status, auditInput, auditOmitted
            ]
        );
    }

    async function analyseDomain({ companyId, snapshot, run, domain, historicalContext }) {
        const packageResult = await buildDomainPackage({ companyId, snapshot, runId: run.id, domain, historicalContext });
        let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: packageResult.audit.inputSizeBytes, responseBytes: 0, retries: 0 };
        try {
            const response = await azureOpenAI.createJsonCompletion({
                messages: [
                    { role: 'system', content: 'You are StackCTRL Enterprise Intelligence. Return structured JSON only.' },
                    { role: 'user', content: domainPrompt(domain, packageResult.package) }
                ],
                temperature: 0.15,
                maxTokens: settings.maxDomainOutputTokens,
                maxRetriesOverride: settings.maxRetries,
                timeoutMs: settings.requestTimeoutMs
            });
            usage = responseUsage(response);
            const analysis = normalizedDomainResult(response.data, domain, packageResult.current);
            const domainIntelligenceId = await storeDomain({ run, companyId, snapshot, domain, packageResult, analysis, usage });
            await storeAudit({ run, companyId, snapshot, domain, packageResult, analysis, usage, status: 'completed' });
            return { status: 'completed', domain, domainIntelligenceId, analysis, usage, audit: packageResult.audit };
        } catch (error) {
            const metadata = error.azureMetadata || {};
            usage = {
                inputTokens: 0, outputTokens: 0, totalTokens: 0,
                requestBytes: Number(metadata.requestSizeBytes || packageResult.audit.inputSizeBytes),
                responseBytes: Number(metadata.responseSizeBytes || 0), retries: Number(metadata.retryCount || 0)
            };
            await storeDomain({ run, companyId, snapshot, domain, packageResult, analysis: null, usage, status: 'failed', errorMessage: error.message });
            await storeAudit({ run, companyId, snapshot, domain, packageResult, analysis: null, usage, status: 'failed' });
            logger.error(`[StackCTRL Enterprise] ${domain.name} analysis failed:`, error.message);
            return { status: 'failed', domain, usage, audit: packageResult.audit, errorMessage: error.message };
        }
    }

    async function loadDomainRows(runId) {
        const [rows] = await pool.query(
            `SELECT ID, CompanyID, SnapshotID, RunID, DomainKey, DomainName, HealthScore, RiskScore,
                    RiskLevel, Status, DomainExecutiveSummary, TechnicalSummary, BusinessImpact,
                    CurrentPosture, EvidenceSummary, ScoreJustification, ControlAssessment,
                    FindingsJson, RisksJson, RecommendationsJson, TrendAnalysisJson,
                    YesterdayVsTodayJson, MissingDataWarningsJson, AssumptionsJson, ConfidenceScore
             FROM StackCTRLTenantDomainIntelligence WHERE RunID = ? ORDER BY ID`,
            [runId]
        );
        return rows.map(row => ({
            domainKey: row.DomainKey, domainName: row.DomainName, healthScore: row.HealthScore,
            riskScore: row.RiskScore, riskLevel: row.RiskLevel, status: row.Status,
            domainExecutiveSummary: row.DomainExecutiveSummary, technicalSummary: row.TechnicalSummary,
            businessImpact: row.BusinessImpact, currentPosture: row.CurrentPosture,
            evidenceSummary: row.EvidenceSummary, scoreJustification: row.ScoreJustification,
            controlAssessment: safeValue(parseJson(row.ControlAssessment, {}), 0, { maxArray: 20, maxString: 2000 }),
            findings: array(parseJson(row.FindingsJson, [])).slice(0, 20),
            risks: array(parseJson(row.RisksJson, [])).slice(0, 20),
            recommendations: array(parseJson(row.RecommendationsJson, [])).slice(0, 20),
            trends: array(parseJson(row.TrendAnalysisJson, [])).slice(0, 20),
            yesterdayVsToday: safeValue(parseJson(row.YesterdayVsTodayJson, {}), 0, { maxArray: 20 }),
            missingDataWarnings: array(parseJson(row.MissingDataWarningsJson, [])).slice(0, 30),
            assumptions: array(parseJson(row.AssumptionsJson, [])).slice(0, 30),
            confidenceScore: row.ConfidenceScore
        }));
    }

    async function loadRollups(companyId, periodType, periodStart, periodEnd) {
        const lowerPeriod = LOWER_PERIOD[periodType];
        if (!lowerPeriod) return [];
        const lowerPeriods = periodType === 'monthly' ? ['weekly', 'daily'] : [lowerPeriod];
        const periodPlaceholders = lowerPeriods.map(() => '?').join(', ');
        const [rows] = await pool.query(
            `SELECT synthesis.ID, synthesis.PeriodType, synthesis.PeriodStart, synthesis.PeriodEnd,
                    synthesis.ExecutiveSummaryJson, synthesis.BoardReportJson, synthesis.ManagementReportJson,
                    synthesis.DomainScorecardJson, synthesis.MaturityAssessmentJson,
                    synthesis.EvidenceJustificationJson, synthesis.LimitationsJson, synthesis.PowerBISummaryJson
             FROM StackCTRLEnterpriseSynthesis synthesis
             WHERE synthesis.CompanyID = ? AND synthesis.Status = 'completed'
               AND synthesis.PeriodType IN (${periodPlaceholders})
               AND synthesis.PeriodStart <= ? AND synthesis.PeriodEnd >= ?
             ORDER BY synthesis.PeriodStart ASC LIMIT 400`,
            [companyId, ...lowerPeriods, periodEnd, periodStart]
        );
        return rows.map(row => ({
            synthesisId: row.ID, periodType: row.PeriodType, periodStart: row.PeriodStart, periodEnd: row.PeriodEnd,
            executiveSummary: parseJson(row.ExecutiveSummaryJson, {}), boardReport: parseJson(row.BoardReportJson, {}),
            managementReport: parseJson(row.ManagementReportJson, {}), domainScorecard: parseJson(row.DomainScorecardJson, []),
            maturityAssessment: parseJson(row.MaturityAssessmentJson, {}), evidenceJustification: parseJson(row.EvidenceJustificationJson, {}),
            limitations: parseJson(row.LimitationsJson, []), powerBiSummary: parseJson(row.PowerBISummaryJson, {})
        }));
    }

    async function runSynthesis({ companyId, snapshotId, run, existingTotals = null }) {
        const domainRows = await loadDomainRows(run.id);
        const rollups = await loadRollups(companyId, run.periodType, run.periodStart, run.periodEnd);
        if (!domainRows.length && !rollups.length) throw new Error('Enterprise synthesis requires stored domain intelligence or completed lower-period reports');
        const synthesisPackage = {
            contextType: 'stackctrl_enterprise_synthesis',
            schemaVersion: 1,
            companyId,
            snapshotId: snapshotId || null,
            period: { type: run.periodType, start: run.periodStart, end: run.periodEnd },
            domainIntelligence: domainRows,
            lowerPeriodReports: rollups,
            sourceHealthSummary: domainRows.map(row => ({ domainKey: row.domainKey, status: row.status, healthScore: row.healthScore, riskScore: row.riskScore, riskLevel: row.riskLevel })),
            missingDataWarnings: domainRows.flatMap(row => array(row.missingDataWarnings)),
            limitations: { rawSnapshotIncluded: false, rawVendorPayloadIncluded: false, synthesisUsesStoredIntelligenceOnly: true }
        };
        const response = await azureOpenAI.createJsonCompletion({
            messages: [
                { role: 'system', content: 'You are StackCTRL Enterprise Intelligence. Return structured JSON only.' },
                { role: 'user', content: synthesisPrompt(safeValue(synthesisPackage, 0, { maxDepth: 8, maxArray: 100, maxString: 5000 })) }
            ],
            temperature: 0.15,
            maxTokens: settings.maxSynthesisOutputTokens,
            maxRetriesOverride: settings.maxRetries,
            timeoutMs: settings.requestTimeoutMs
        });
        const usage = responseUsage(response);
        const analysis = response.data || {};
        const finalRunStatus = domainRows.some(row => row.status !== 'completed') ? 'completed_with_warnings' : 'completed';
        const [result] = await pool.query(
            `INSERT INTO StackCTRLEnterpriseSynthesis
             (CompanyID, SnapshotID, RunID, PeriodType, PeriodStart, PeriodEnd, Status,
              ExecutiveSummaryJson, BoardReportJson, ManagementReportJson, RiskRegisterJson,
              RecommendationsJson, TrendAnalysisJson, ComplianceReviewJson, GovernanceReviewJson,
              DomainScorecardJson, MaturityAssessmentJson, BusinessImpactSummary,
              TopDecisionsRequiredJson, Next30DaysPlanJson, Next90DaysPlanJson,
              EvidenceJustificationJson, LimitationsJson, PowerBISummaryJson, InputSizeBytes,
              ResponseSizeBytes, InputTokens, OutputTokens, TotalTokens, RetryCount, CreatedAt)
             VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                companyId, snapshotId || null, run.id, run.periodType, run.periodStart, run.periodEnd,
                JSON.stringify(analysis.enterpriseExecutiveSummary || {}), JSON.stringify(analysis.boardReport || {}),
                JSON.stringify(analysis.managementReport || {}), jsonArray(analysis.riskRegister),
                jsonArray(analysis.recommendations), jsonArray(analysis.trendAnalysis),
                JSON.stringify(analysis.complianceReview || {}), JSON.stringify(analysis.governanceReview || {}),
                jsonArray(analysis.domainScorecard), JSON.stringify(analysis.maturityAssessment || {}),
                textOrNull(analysis.businessImpactSummary), jsonArray(analysis.topDecisionsRequired),
                jsonArray(analysis.next30DaysPlan), jsonArray(analysis.next90DaysPlan),
                JSON.stringify(analysis.evidenceJustificationSummary || {}), jsonArray(analysis.limitationsAndAssumptions),
                JSON.stringify(analysis.powerBiSummary || {}), usage.requestBytes || bytes(synthesisPackage), usage.responseBytes,
                usage.inputTokens, usage.outputTokens, usage.totalTokens, usage.retries
            ]
        );
        await storeItems({
            companyId, snapshotId, runId: run.id,
            domain: { key: 'enterprise', name: 'Overall Risks' }, period: run,
            analysis: {
                riskRegister: analysis.riskRegister,
                recommendations: analysis.recommendations,
                trendAnalysis: analysis.trendAnalysis,
                managementActions: [...array(analysis.managementReport?.managementActions), ...array(analysis.managementReport?.actions)],
                topDecisionsRequired: analysis.topDecisionsRequired,
                next30DaysPlan: analysis.next30DaysPlan,
                next90DaysPlan: analysis.next90DaysPlan
            },
            source: 'synthesis'
        });
        const totals = existingTotals || { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 };
        for (const key of Object.keys(totals)) totals[key] += usage[key] || 0;
        await pool.query(
            `UPDATE StackCTRLEnterpriseReportRuns
             SET Status = ?, CompletedAt = NOW(), TotalInputTokens = ?, TotalOutputTokens = ?,
                 TotalTokens = ?, TotalRequestBytes = ?, TotalResponseBytes = ?, RetryCount = ?
             WHERE ID = ?`,
            [finalRunStatus, totals.inputTokens, totals.outputTokens, totals.totalTokens, totals.requestBytes, totals.responseBytes, totals.retries, run.id]
        );
        return { synthesisId: result.insertId, analysis, usage };
    }

    async function processDomains({ companyId, snapshot, run, domainKeys }) {
        const historicalContext = await schedulerService.getHistoricalSnapshotContext(companyId, snapshot.ID);
        const selected = domainKeys.map(key => DOMAIN_BY_KEY[key]).filter(Boolean);
        const results = [];
        const totals = { inputTokens: 0, outputTokens: 0, totalTokens: 0, requestBytes: 0, responseBytes: 0, retries: 0 };
        let nextIndex = 0;
        async function worker() {
            while (nextIndex < selected.length) {
                const index = nextIndex++;
                if (totals.totalTokens >= settings.maxTotalTokens) {
                    results.push({ status: 'skipped_token_threshold', domain: selected[index], errorMessage: 'Enterprise total token safety threshold reached' });
                    continue;
                }
                const result = await analyseDomain({ companyId, snapshot, run, domain: selected[index], historicalContext });
                results.push(result);
                for (const key of Object.keys(totals)) totals[key] += result.usage?.[key] || 0;
                if (index < selected.length - 1 && settings.domainDelayMs > 0) await wait(settings.domainDelayMs);
            }
        }
        await Promise.all(Array.from({ length: Math.min(settings.concurrency, selected.length || 1) }, () => worker()));
        return { results, totals };
    }

    async function runEnterpriseReport({ companyId, snapshotId = null, periodType = 'daily', referenceDate = new Date(), domainKeys = null, includeSynthesis = true, deduplicationKey = null } = {}) {
        const numericCompanyId = Number(companyId);
        if (!Number.isInteger(numericCompanyId) || numericCompanyId <= 0) throw new Error('A valid companyId is required');
        const snapshot = await loadSnapshot(numericCompanyId, snapshotId);
        const selectedKeys = Array.isArray(domainKeys) && domainKeys.length ? [...new Set(domainKeys)] : ENTERPRISE_DOMAINS.map(domain => domain.key);
        const invalid = selectedKeys.filter(key => !DOMAIN_BY_KEY[key]);
        if (invalid.length) throw new Error(`Unsupported enterprise domains: ${invalid.join(', ')}`);
        const run = await createRun({ companyId: numericCompanyId, snapshotId: snapshot.ID, periodType, referenceDate, mode: selectedKeys.length === 1 ? DOMAIN_BY_KEY[selectedKeys[0]].mode : 'enterprise_deep_reporting', deduplicationKey });
        if (run.duplicate) return { status: 'duplicate', runId: run.id, snapshotId: snapshot.ID, periodType: run.periodType };
        try {
            const domains = await processDomains({ companyId: numericCompanyId, snapshot, run, domainKeys: selectedKeys });
            const failures = domains.results.filter(result => result.status !== 'completed');
            let synthesis = null;
            if (includeSynthesis && domains.results.some(result => result.status === 'completed')) {
                synthesis = await runSynthesis({ companyId: numericCompanyId, snapshotId: snapshot.ID, run, existingTotals: domains.totals });
            } else {
                await pool.query(
                    `UPDATE StackCTRLEnterpriseReportRuns
                     SET Status = ?, CompletedAt = NOW(), TotalInputTokens = ?, TotalOutputTokens = ?, TotalTokens = ?,
                         TotalRequestBytes = ?, TotalResponseBytes = ?, RetryCount = ?, ErrorMessage = ? WHERE ID = ?`,
                    [failures.length ? 'completed_with_warnings' : 'completed', domains.totals.inputTokens, domains.totals.outputTokens,
                        domains.totals.totalTokens, domains.totals.requestBytes, domains.totals.responseBytes, domains.totals.retries,
                        failures.length ? `${failures.length} domain analysis request(s) did not complete.` : null, run.id]
                );
            }
            return { runId: run.id, snapshotId: snapshot.ID, periodType: run.periodType, domains: domains.results.map(result => ({ domainKey: result.domain.key, domainName: result.domain.name, status: result.status, domainIntelligenceId: result.domainIntelligenceId || null, errorMessage: result.errorMessage || null })), synthesisId: synthesis?.synthesisId || null, totals: domains.totals };
        } catch (error) {
            await pool.query(`UPDATE StackCTRLEnterpriseReportRuns SET Status = 'failed', CompletedAt = NOW(), ErrorMessage = ? WHERE ID = ?`, [String(error.message).slice(0, 5000), run.id]);
            throw error;
        }
    }

    async function runEnterpriseSynthesis({ companyId, runId }) {
        const [rows] = await pool.query(`SELECT * FROM StackCTRLEnterpriseReportRuns WHERE ID = ? AND CompanyID = ? LIMIT 1`, [Number(runId), Number(companyId)]);
        if (!rows.length) throw new Error('Enterprise run not found');
        const row = rows[0];
        const run = { id: row.ID, periodType: row.PeriodType, periodStart: row.PeriodStart, periodEnd: row.PeriodEnd };
        return runSynthesis({ companyId: Number(companyId), snapshotId: row.SnapshotID, run });
    }

    async function runRollupReport({ companyId, periodType, referenceDate = new Date(), deduplicationKey = null }) {
        if (!LOWER_PERIOD[periodType]) throw new Error('Rollup period must be weekly, monthly, or yearly');
        const latestSnapshot = await loadSnapshot(companyId, null);
        const run = await createRun({ companyId: Number(companyId), snapshotId: latestSnapshot.ID, periodType, referenceDate, mode: `enterprise_${periodType}_synthesis`, deduplicationKey });
        if (run.duplicate) return { status: 'duplicate', runId: run.id, periodType };
        try {
            const synthesis = await runSynthesis({ companyId: Number(companyId), snapshotId: latestSnapshot.ID, run });
            return { runId: run.id, synthesisId: synthesis.synthesisId, periodType };
        } catch (error) {
            await pool.query(`UPDATE StackCTRLEnterpriseReportRuns SET Status = 'failed', CompletedAt = NOW(), ErrorMessage = ? WHERE ID = ?`, [String(error.message).slice(0, 5000), run.id]);
            throw error;
        }
    }

    function isLastBusinessDay(local, unit) {
        let next = local.plus({ days: 1 });
        while (next.weekday > 5) next = next.plus({ days: 1 });
        return unit === 'month' ? next.month !== local.month : next.year !== local.year;
    }

    async function runScheduledTick({ now = new Date(), companyId = null } = {}) {
        const local = DateTime.fromJSDate(now instanceof Date ? now : new Date(now), { zone: 'utc' }).setZone('Africa/Johannesburg');
        if (local.weekday > 5 || local.hour !== 18 || local.minute < 15 || local.minute >= 30) return { status: 'not_due', localTime: local.toISO() };
        let companyIds = companyId ? [Number(companyId)] : [];
        if (!companyIds.length) {
            const [rows] = await pool.query(`SELECT DISTINCT CompanyID FROM StackCTRLClientCapabilities WHERE ProfileKey = 'sunbird' AND IsEnabled = 1`);
            companyIds = rows.map(row => Number(row.CompanyID)).filter(Boolean);
        }
        const results = [];
        for (const id of companyIds) {
            try {
                const scheduleDate = local.toFormat('yyyyLLdd');
                const daily = await runEnterpriseReport({ companyId: id, periodType: 'daily', referenceDate: now, deduplicationKey: `${id}:enterprise:daily:${scheduleDate}` });
                const companyRuns = [{ periodType: 'daily', status: 'completed', ...daily }];
                if (local.weekday === 5) companyRuns.push({ periodType: 'weekly', status: 'completed', ...(await runRollupReport({ companyId: id, periodType: 'weekly', referenceDate: now, deduplicationKey: `${id}:enterprise:weekly:${local.weekNumber}:${local.weekYear}` })) });
                if (isLastBusinessDay(local, 'month')) companyRuns.push({ periodType: 'monthly', status: 'completed', ...(await runRollupReport({ companyId: id, periodType: 'monthly', referenceDate: now, deduplicationKey: `${id}:enterprise:monthly:${local.toFormat('yyyyLL')}` })) });
                if (isLastBusinessDay(local, 'year')) companyRuns.push({ periodType: 'yearly', status: 'completed', ...(await runRollupReport({ companyId: id, periodType: 'yearly', referenceDate: now, deduplicationKey: `${id}:enterprise:yearly:${local.year}` })) });
                results.push({ companyId: id, runs: companyRuns });
            } catch (error) {
                logger.error(`[StackCTRL Enterprise] Scheduled reporting failed for company ${id}:`, error.message);
                results.push({ companyId: id, runs: [{ status: 'failed', message: error.message }] });
            }
        }
        return { status: 'completed', localTime: local.toISO(), companies: results };
    }

    async function getAdminData(companyId, runId = null) {
        const params = [Number(companyId)];
        const runFilter = runId ? ' AND RunID = ?' : '';
        if (runId) params.push(Number(runId));
        const [[runs], [domains], [audits], [synthesis], [items]] = await Promise.all([
            pool.query(`SELECT * FROM StackCTRLEnterpriseReportRuns WHERE CompanyID = ? ORDER BY ID DESC LIMIT 50`, [Number(companyId)]),
            pool.query(`SELECT * FROM StackCTRLTenantDomainIntelligence WHERE CompanyID = ?${runFilter} ORDER BY ID DESC LIMIT 200`, params),
            pool.query(`SELECT * FROM StackCTRLIntelligenceEvidenceAudit WHERE CompanyID = ?${runFilter} ORDER BY ID DESC LIMIT 200`, params),
            pool.query(`SELECT * FROM StackCTRLEnterpriseSynthesis WHERE CompanyID = ?${runFilter} ORDER BY ID DESC LIMIT 50`, params),
            pool.query(`SELECT * FROM StackCTRLEnterpriseIntelligenceItems WHERE CompanyID = ?${runFilter} ORDER BY ID DESC LIMIT 500`, params)
        ]);
        return {
            settings: { ...settings },
            domains: ENTERPRISE_DOMAINS.map(domain => ({ key: domain.key, name: domain.name, mode: domain.mode })),
            runs: runs.map(row => ({ ...row })),
            domainIntelligence: domains.map(row => ({ ...row, AnalysisJson: parseJson(row.AnalysisJson, {}) })),
            evidenceAudit: audits.map(row => ({
                ...row,
                AzureInputSummaryJson: parseJson(row.AzureInputSummaryJson, {}),
                OmittedSummaryJson: parseJson(row.OmittedSummaryJson, {})
            })),
            synthesis: synthesis.map(row => ({
                ...row,
                ExecutiveSummaryJson: parseJson(row.ExecutiveSummaryJson, {}),
                BoardReportJson: parseJson(row.BoardReportJson, {}),
                ManagementReportJson: parseJson(row.ManagementReportJson, {}),
                DomainScorecardJson: parseJson(row.DomainScorecardJson, []),
                MaturityAssessmentJson: parseJson(row.MaturityAssessmentJson, {}),
                PowerBISummaryJson: parseJson(row.PowerBISummaryJson, {})
            })),
            items
        };
    }

    return {
        settings,
        domains: ENTERPRISE_DOMAINS,
        buildDomainPackage,
        runEnterpriseReport,
        runEnterpriseSynthesis,
        runRollupReport,
        runScheduledTick,
        getAdminData
    };
}

module.exports = {
    ENTERPRISE_DOMAINS,
    DOMAIN_BY_KEY,
    createEnterpriseIntelligenceService,
    periodWindow
};
