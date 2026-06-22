const crypto = require('crypto');

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;
const API_VERSION = '1.1';
const DEFAULT_BASE_URL = 'https://stackopsit.co.za/api/powerbi';
const API_KEY_SECRET_NAME = 'POWERBI_REPORTING_API_KEY';
const FORBIDDEN_RESPONSE_FIELDS = new Set(['ContextJson', 'CompactContextJson', 'AuditOnlyContextJson']);

const COMMON_FILTERS = {
    companyId: 'CompanyID',
    tenantId: 'TenantID',
    snapshotId: 'SnapshotID',
    runId: 'RunID',
    periodType: 'PeriodType'
};

const HISTORICAL_FILTERS = {
    ...COMMON_FILTERS,
    comparisonPeriod: 'ComparisonPeriod'
};

function dataset(name, path, view, filters, dateColumn, orderColumn, sample) {
    return Object.freeze({ name, path, view, filters: Object.freeze(filters), dateColumn, orderColumn, sample: Object.freeze(sample) });
}

const POWERBI_DATASETS = Object.freeze([
    dataset('Companies', 'companies', 'vw_PowerBI_Companies', {
        companyId: COMMON_FILTERS.companyId,
        tenantId: COMMON_FILTERS.tenantId
    }, null, 'CompanyID', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird'
    }),
    dataset('Executive Summary', 'executive-summary', 'vw_PowerBI_ExecutiveSummary', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, RunID: 21,
        PeriodType: 'daily', ReportDate: '2026-06-22', Overview: 'Security posture requires management attention.',
        BusinessImpact: 'Identity and device gaps increase operational risk.', ManagementAttentionRequired: 'Prioritise MFA and device compliance.',
        Confidence: 0.94, RiskLevel: 'high', RiskScore: 72, SecurityMaturityScore: 58, CreatedAt: '2026-06-22T08:02:00.000Z'
    }),
    dataset('Intelligence Summary', 'intelligence-summary', 'vw_PowerBI_IntelligenceSummary', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, RunID: 21, PeriodID: 5,
        PeriodType: 'daily', PeriodStart: '2026-06-22T00:00:00.000Z', PeriodEnd: '2026-06-22T23:59:59.000Z',
        ReportDate: '2026-06-22', RiskScore: 72, RiskLevel: 'high', SecurityMaturityScore: 58,
        DataCompletenessScore: 100, IdentityHealth: 64, SecurityHealth: 55, DeviceHealth: 71,
        OperationsHealth: 62, OperationsRiskScore: 38, ApplicationsHealth: 74, ApplicationsRiskScore: 26,
        CreatedAt: '2026-06-22T08:02:00.000Z'
    }),
    dataset('Board Report', 'board-report', 'vw_PowerBI_BoardReport', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, RunID: 21,
        PeriodType: 'daily', ReportDate: '2026-06-22', BoardSummary: 'The tenant remains at high risk.',
        BoardActions: '["Complete MFA rollout","Reduce privileged access"]', BoardRisks: '["Identity compromise"]',
        DecisionsRequired: '["Approve remediation ownership"]', Next30DaysFocus: '["MFA and compliance"]',
        Next90DaysFocus: '["Backup maturity"]', RiskLevel: 'high', RiskScore: 72, CreatedAt: '2026-06-22T08:02:00.000Z'
    }),
    dataset('Board Actions', 'board-actions', 'vw_PowerBI_BoardActions', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, RunID: 21,
        PeriodType: 'daily', ReportDate: '2026-06-22', ActionNumber: 1, ActionText: 'Complete MFA rollout.', CreatedAt: '2026-06-22T08:02:00.000Z'
    }),
    dataset('Risk Register', 'risk-register', 'vw_PowerBI_RiskRegister', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, RunID: 21,
        PeriodType: 'daily', ReportDate: '2026-06-22', RiskID: 103, RiskTitle: 'Incomplete MFA coverage',
        Domain: 'Identity', Severity: 'high', Likelihood: 'likely', Impact: 'major', Description: 'Some users do not have MFA.',
        BusinessImpact: 'Account compromise risk.', Recommendation: 'Complete MFA rollout.', EvidenceSummary: 'MFA coverage below target.', Status: null,
        CreatedAt: '2026-06-22T08:02:00.000Z', UpdatedAt: null
    }),
    dataset('Recommendations', 'recommendations', 'vw_PowerBI_Recommendations', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, RunID: 21,
        PeriodType: 'daily', ReportDate: '2026-06-22', RecommendationID: 52, Title: 'Complete MFA rollout',
        Detail: 'Enrol every remaining user.', Domain: 'Identity', Priority: 'high', BusinessReason: 'Reduce account compromise risk.',
        SuggestedOwner: 'IT Manager', SuggestedDueDate: '2026-07-22', Status: null, CreatedAt: '2026-06-22T08:02:00.000Z', UpdatedAt: null
    }),
    dataset('Trend Analysis', 'trend-analysis', 'vw_PowerBI_TrendAnalysis', HISTORICAL_FILTERS, 'ReportDate', 'ReportDate', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, RunID: 21,
        PeriodType: 'daily', ReportDate: '2026-06-22', TrendID: 12, Domain: 'Identity', MetricName: 'MFA Coverage',
        Direction: 'improving', CurrentValue: 88, PreviousValue: 82, ChangePercent: 7.32, ComparisonPeriod: '7_days',
        Explanation: 'MFA coverage improved over the comparison period.', CreatedAt: '2026-06-22T08:02:00.000Z'
    }),
    dataset('Compliance Review', 'compliance-review', 'vw_PowerBI_ComplianceReview', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, RunID: 21,
        PeriodType: 'daily', ReportDate: '2026-06-22', ComplianceStatus: 'needs_attention', ComplianceHealth: 61,
        Interpretation: 'Device compliance requires remediation.', EvidenceSummary: 'Four devices are non-compliant.',
        FailedControls: '["Device compliance"]', ManualReviewRequired: '["Review conditional access"]', CreatedAt: '2026-06-22T08:02:00.000Z'
    }),
    dataset('Governance Review', 'governance-review', 'vw_PowerBI_GovernanceReview', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, RunID: 21,
        PeriodType: 'daily', ReportDate: '2026-06-22', GovernanceStatus: 'partial', GovernanceHealth: 66,
        Interpretation: 'Privileged access governance needs attention.', EvidenceSummary: 'Eight privileged users were recorded.',
        ReviewStatus: 'open', ManualReviewItems: '["Review privileged roles"]', CreatedAt: '2026-06-22T08:02:00.000Z'
    }),
    dataset('Compliance Controls', 'compliance-controls', 'vw_PowerBI_ComplianceControls', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, RunID: 21,
        PeriodType: 'daily', ReportDate: '2026-06-22', ControlNumber: 1, ControlText: 'Device compliance', CreatedAt: '2026-06-22T08:02:00.000Z'
    }),
    dataset('Manual Review Items', 'manual-review-items', 'vw_PowerBI_ManualReviewItems', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, RunID: 21,
        PeriodType: 'daily', ReportDate: '2026-06-22', ReviewDomain: 'Governance', ReviewItemNumber: 1,
        ReviewItem: 'Review privileged roles.', CreatedAt: '2026-06-22T08:02:00.000Z'
    }),
    dataset('Source Health', 'source-health', 'vw_PowerBI_SourceHealth', {
        companyId: COMMON_FILTERS.companyId, tenantId: COMMON_FILTERS.tenantId, snapshotId: COMMON_FILTERS.snapshotId
    }, 'CreatedAt', 'CreatedAt', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76,
        SourceName: 'Microsoft Graph Identity', SourceKey: 'identity', SourceStatus: 'available', IsExpected: 1,
        IsAvailable: 1, FreshnessStatus: 'available', LastCollectedAt: '2026-06-22T08:00:00.000Z', CompletenessScore: 100,
        EvidenceCount: 4, AgeMinutes: 2, WarningMessage: '[]', ErrorMessage: null, CreatedAt: '2026-06-22T08:00:00.000Z'
    }),
    dataset('Azure Diagnostics', 'azure-diagnostics', 'vw_PowerBI_AzureDiagnostics', COMMON_FILTERS, 'StartedAt', 'StartedAt', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, RunID: 21,
        PeriodType: 'daily', RequestedOutputTypes: '["executive_summary","risk_register"]', Status: 'completed',
        ModelName: 'gpt-4.1-mini', AzureDeployment: 'gpt-4.1-mini', RequestSizeBytes: 294707, ResponseSizeBytes: 18342,
        InputTokens: 65123, OutputTokens: 3921, TotalTokens: 69044, RetryCount: 0, LastRetryAt: null,
        StartedAt: '2026-06-22T08:01:00.000Z', CompletedAt: '2026-06-22T08:02:00.000Z', DurationSeconds: 60,
        ErrorMessage: null, CreatedAt: '2026-06-22T08:01:00.000Z'
    }),
    dataset('Domain Health', 'domain-health', 'vw_PowerBI_DomainHealth', HISTORICAL_FILTERS, 'ReportDate', 'ReportDate', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, RunID: 21,
        PeriodType: 'daily', ReportDate: '2026-06-22', Domain: 'Operations', HealthScore: 62, RiskScore: 38,
        RiskLevel: 'moderate', Direction: 'improving', PreviousHealthScore: 60, PreviousRiskScore: 40,
        ChangePercent: 3.33, ComparisonPeriod: '24_hours', CreatedAt: '2026-06-22T08:02:00.000Z'
    }),
    dataset('Period Intelligence', 'period-intelligence', 'vw_PowerBI_PeriodIntelligence', COMMON_FILTERS, 'PeriodStart', 'PeriodStart', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', PeriodID: 5, PeriodType: 'daily',
        PeriodStart: '2026-06-22T00:00:00.000Z', PeriodEnd: '2026-06-22T23:59:59.000Z', SnapshotID: 76, RunID: 21,
        Status: 'completed', RiskScore: 72, RiskLevel: 'high', SecurityMaturityScore: 58, DataCompletenessScore: 100,
        OperationsHealth: 62, OperationsRiskScore: 38, ApplicationsHealth: 74, ApplicationsRiskScore: 26,
        ExecutiveSummaryAvailable: 1, BoardReportAvailable: 1, RiskRegisterAvailable: 1, RecommendationsAvailable: 1,
        TrendAnalysisAvailable: 1, ComplianceReviewAvailable: 1, GovernanceAssessmentAvailable: 1,
        PowerBIRowsCreated: 1, CreatedAt: '2026-06-22T08:01:00.000Z', CompletedAt: '2026-06-22T08:02:00.000Z'
    }),
    dataset('Snapshot Context', 'snapshot-context', 'vw_PowerBI_SnapshotContext', {
        companyId: COMMON_FILTERS.companyId, tenantId: COMMON_FILTERS.tenantId, snapshotId: COMMON_FILTERS.snapshotId
    }, 'CreatedAt', 'CreatedAt', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, SnapshotType: 'manual_test',
        FullSnapshotSizeBytes: 1048576, CompactContextID: 9, CompactContextSizeBytes: 294707, ReductionPercent: 71.89,
        EvidenceIncludedCount: 38, EvidenceOmittedCount: 460, HistoricalCoverageSummary: '24_hours: available, 7_days: available',
        CreatedAt: '2026-06-22T08:00:00.000Z'
    }),
    dataset('Metrics', 'metrics', 'vw_PowerBI_Metrics', {
        companyId: COMMON_FILTERS.companyId, tenantId: COMMON_FILTERS.tenantId, snapshotId: COMMON_FILTERS.snapshotId
    }, 'SnapshotCreatedAt', 'SnapshotCreatedAt', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, SourceStatusID: 810,
        SourceKey: 'identity', MetricName: 'mfaCoverage', MetricLabel: 'MFA Coverage', MetricType: 'number', NumericValue: 88,
        TextValue: null, BooleanValue: null, JsonValue: null, PeriodStart: null, PeriodEnd: null,
        SnapshotCreatedAt: '2026-06-22T08:00:00.000Z'
    }),
    dataset('Historical Comparisons', 'historical-comparisons', 'vw_PowerBI_HistoricalComparisons', {
        companyId: COMMON_FILTERS.companyId, tenantId: COMMON_FILTERS.tenantId, snapshotId: COMMON_FILTERS.snapshotId,
        comparisonPeriod: 'ComparisonPeriod'
    }, 'TargetAt', 'TargetAt', {
        CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76, ComparisonPeriod: '7_days',
        TargetOffsetMinutes: 10080, TargetAt: '2026-06-15T08:00:00.000Z', BaselineSnapshotID: 42,
        BaselineCreatedAt: '2026-06-15T08:02:00.000Z', DifferenceMinutes: 2, AvailabilityStatus: 'available',
        MetricChangesJson: '{}', WarningsJson: '[]'
    }),
    dataset('AI Output Lineage', 'ai-output-lineage', 'vw_PowerBI_AIOutputLineage', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        AIOutputID: 301, CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76,
        RunID: 21, PeriodID: 5, PeriodType: 'daily', PeriodStart: '2026-06-22T00:00:00.000Z',
        PeriodEnd: '2026-06-22T23:59:59.000Z', ReportDate: '2026-06-22', OutputType: 'executive_summary',
        OutputTitle: 'Executive Summary', ExecutiveSummary: 'Security posture requires attention.', ModelName: 'gpt-4.1-mini',
        AzureDeployment: 'gpt-4.1-mini', PromptVersion: 'stackctrl-intelligence-v2', ConfidenceScore: 0.94,
        OutputStatus: 'completed', CreatedAt: '2026-06-22T08:02:00.000Z'
    }),
    dataset('Enterprise Runs', 'enterprise-runs', 'vw_PowerBI_EnterpriseRuns', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        RunID: 401, CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76,
        PeriodType: 'daily', ReportDate: '2026-06-22', Status: 'completed', Mode: 'enterprise_deep_reporting',
        TotalInputTokens: 72000, TotalOutputTokens: 18000, TotalTokens: 90000, RetryCount: 1
    }),
    dataset('Domain Intelligence', 'domain-intelligence', 'vw_PowerBI_DomainIntelligence', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        DomainIntelligenceID: 501, CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird',
        SnapshotID: 76, RunID: 401, DomainKey: 'identity', DomainName: 'Identity Protection',
        PeriodType: 'daily', ReportDate: '2026-06-22', HealthScore: 72, RiskScore: 28, RiskLevel: 'moderate',
        DomainExecutiveSummary: 'Identity controls are improving, with remaining MFA gaps.', ConfidenceScore: 0.93, Status: 'completed'
    }),
    dataset('Domain Findings', 'domain-findings', 'vw_PowerBI_DomainFindings', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        FindingID: 601, CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76,
        RunID: 401, DomainKey: 'identity', DomainName: 'Identity Protection', PeriodType: 'daily',
        ReportDate: '2026-06-22', Title: 'MFA coverage gap', Severity: 'high', Status: 'open',
        EvidenceSummary: 'Stored identity metrics show users without MFA.'
    }),
    dataset('Domain Risks', 'domain-risks', 'vw_PowerBI_DomainRisks', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        RiskID: 701, CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76,
        RunID: 401, DomainKey: 'applications', DomainName: 'Applications', PeriodType: 'daily',
        ReportDate: '2026-06-22', RiskTitle: 'Broad application permissions', Severity: 'high',
        BusinessImpact: 'An over-permissioned application could expose tenant data.'
    }),
    dataset('Domain Recommendations', 'domain-recommendations', 'vw_PowerBI_DomainRecommendations', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        RecommendationID: 801, CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76,
        RunID: 401, DomainKey: 'applications', DomainName: 'Applications', PeriodType: 'daily',
        ReportDate: '2026-06-22', Title: 'Review broad consent grants', Priority: 'high', SuggestedOwner: 'Security Lead'
    }),
    dataset('Domain Trends', 'domain-trends', 'vw_PowerBI_DomainTrends', HISTORICAL_FILTERS, 'ReportDate', 'ReportDate', {
        TrendID: 901, CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76,
        RunID: 401, DomainKey: 'identity', DomainName: 'Identity Protection', PeriodType: 'daily',
        ReportDate: '2026-06-22', MetricName: 'MFA coverage', Direction: 'improving', CurrentValue: 92,
        PreviousValue: 88, ChangePercent: 4.55, ComparisonPeriod: '24_hours'
    }),
    dataset('Domain Evidence Audit', 'domain-evidence-audit', 'vw_PowerBI_DomainEvidenceAudit', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        EvidenceAuditID: 1001, CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76,
        RunID: 401, DomainKey: 'identity', DomainName: 'Identity Protection', PeriodType: 'daily', ReportDate: '2026-06-22',
        StackCTRLDataCount: 120, SentToAzureCount: 45, OmittedCount: 75, MetricsIncludedCount: 18,
        HistoricalComparisonsIncluded: 4, AzureMentionedDomain: 1, RisksReturnedCount: 3,
        RecommendationsReturnedCount: 5, TrendsReturnedCount: 4, InputTokens: 6800, OutputTokens: 1800, Status: 'completed'
    }),
    dataset('Enterprise Synthesis', 'enterprise-synthesis', 'vw_PowerBI_EnterpriseSynthesis', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        SynthesisID: 1101, CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76,
        RunID: 401, PeriodType: 'daily', ReportDate: '2026-06-22', Status: 'completed',
        EnterpriseExecutiveSummary: 'The tenant has moderate overall risk with priority identity and application actions.',
        MaturityLevel: 'defined', OverallRiskScore: 38, OverallRiskLevel: 'moderate'
    }),
    dataset('Enterprise Board Report', 'enterprise-board-report', 'vw_PowerBI_EnterpriseBoardReport', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        SynthesisID: 1101, CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76,
        RunID: 401, PeriodType: 'daily', ReportDate: '2026-06-22',
        BoardSummary: 'Management attention is required for identity and application governance.', Status: 'completed'
    }),
    dataset('Enterprise Management Actions', 'enterprise-management-actions', 'vw_PowerBI_EnterpriseManagementActions', COMMON_FILTERS, 'ReportDate', 'ReportDate', {
        ActionID: 1201, CompanyID: 1, CompanyName: 'Sunbird', TenantID: 'tenant-sunbird', SnapshotID: 76,
        RunID: 401, DomainKey: 'identity', DomainName: 'Identity Protection', PeriodType: 'daily', ReportDate: '2026-06-22',
        ActionType: 'management_action', Title: 'Complete MFA rollout', Priority: 'high', SuggestedOwner: 'IT Manager'
    })
]);

const DATASET_BY_PATH = Object.freeze(Object.fromEntries(POWERBI_DATASETS.map(item => [item.path, item])));

class ReportingApiError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

function integerParameter(value, name, { defaultValue = null, minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (!/^\d+$/.test(String(value))) throw new ReportingApiError(`${name} must be a whole number`, 400);
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum) throw new ReportingApiError(`${name} is invalid`, 400);
    return Math.min(number, maximum);
}

function stringParameter(value, name, maximumLength) {
    if (value === undefined || value === null || value === '') return null;
    const text = String(value).trim();
    if (!text || text.length > maximumLength) throw new ReportingApiError(`${name} is invalid`, 400);
    return text;
}

function dateParameter(value, name) {
    const text = stringParameter(value, name, 10);
    if (!text) return null;
    const parsed = new Date(`${text}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
        throw new ReportingApiError(`${name} must use YYYY-MM-DD`, 400);
    }
    return text;
}

function safeApiKeyMatch(provided, expected) {
    if (!provided || !expected) return false;
    const providedBuffer = Buffer.from(String(provided), 'utf8');
    const expectedBuffer = Buffer.from(String(expected), 'utf8');
    if (providedBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function sanitizeRows(rows) {
    return (Array.isArray(rows) ? rows : []).map(row => Object.fromEntries(
        Object.entries(row || {}).filter(([key]) => !FORBIDDEN_RESPONSE_FIELDS.has(key))
    ));
}

function createPowerBIReportingService({ pool, getSecret, logger = console, secretCacheMs = 5 * 60 * 1000 } = {}) {
    if (!pool) throw new Error('Power BI Reporting API requires a database pool');
    if (typeof getSecret !== 'function') throw new Error('Power BI Reporting API requires the StackCTRL secret loader');

    let cachedApiKey = null;
    let apiKeyExpiresAt = 0;

    async function getConfiguredApiKey() {
        if (apiKeyExpiresAt > Date.now()) return cachedApiKey;
        const value = String(await getSecret(API_KEY_SECRET_NAME) || '').trim();
        cachedApiKey = value || null;
        apiKeyExpiresAt = Date.now() + Math.max(1000, Number(secretCacheMs) || 0);
        return cachedApiKey;
    }

    async function authenticate(providedApiKeys) {
        const expectedApiKey = await getConfiguredApiKey();
        if (!expectedApiKey) throw new ReportingApiError('Power BI Reporting API is not configured', 500);
        const candidates = Array.isArray(providedApiKeys) ? providedApiKeys : [providedApiKeys];
        if (!candidates.some(candidate => safeApiKeyMatch(candidate, expectedApiKey))) {
            throw new ReportingApiError('Unauthorized', 401);
        }
        return true;
    }

    function buildQuery(definition, query = {}) {
        const limit = integerParameter(query.limit, 'limit', { defaultValue: DEFAULT_LIMIT, minimum: 1, maximum: MAX_LIMIT });
        const offset = integerParameter(query.offset, 'offset', { defaultValue: 0, minimum: 0 });
        const conditions = [];
        const params = [];
        for (const [queryName, columnName] of Object.entries(definition.filters)) {
            const value = queryName === 'tenantId' || queryName === 'periodType'
                ? stringParameter(query[queryName], queryName, queryName === 'tenantId' ? 255 : 50)
                : integerParameter(query[queryName], queryName, { minimum: 1 });
            if (value === null || value === undefined) continue;
            conditions.push(`\`${columnName}\` = ?`);
            params.push(value);
        }

        const fromDate = definition.dateColumn ? dateParameter(query.fromDate, 'fromDate') : null;
        const toDate = definition.dateColumn ? dateParameter(query.toDate, 'toDate') : null;
        if (definition.dateColumn && fromDate) {
            conditions.push(`\`${definition.dateColumn}\` >= ?`);
            params.push(fromDate);
        }
        if (definition.dateColumn && toDate) {
            conditions.push(`\`${definition.dateColumn}\` < DATE_ADD(?, INTERVAL 1 DAY)`);
            params.push(toDate);
        }

        const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
        const sql = `SELECT * FROM \`${definition.view}\`${where} ORDER BY \`${definition.orderColumn}\` DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        return { sql, params, limit, offset };
    }

    async function readDataset(path, query = {}) {
        const definition = DATASET_BY_PATH[path];
        if (!definition) throw new ReportingApiError('Dataset not found', 404);
        const built = buildQuery(definition, query);
        const [rows] = await pool.query(built.sql, built.params);
        const data = sanitizeRows(rows);
        return {
            success: true,
            dataset: definition.path,
            count: data.length,
            limit: built.limit,
            offset: built.offset,
            data
        };
    }

    async function health() {
        try {
            const checks = await Promise.all(POWERBI_DATASETS.map(async definition => {
                try {
                    await pool.query(`SELECT * FROM \`${definition.view}\` LIMIT 0`);
                    return { view: definition.view, available: true };
                } catch (error) {
                    logger.error('[Power BI Reporting API] View health check failed.', {
                        view: definition.view,
                        message: error.message
                    });
                    return { view: definition.view, available: false, error: error.message };
                }
            }));
            const available = checks.filter(check => check.available).length;
            return {
                success: available === POWERBI_DATASETS.length,
                status: available === POWERBI_DATASETS.length ? 'available' : 'degraded',
                database: 'connected',
                viewsChecked: available,
                viewsExpected: POWERBI_DATASETS.length,
                unavailableViews: checks.filter(check => !check.available).map(check => check.view),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error('[Power BI Reporting API] Database health check failed.', { message: error.message });
            throw new ReportingApiError('Reporting database is unavailable', 503);
        }
    }

    function metadata() {
        return {
            success: true,
            service: 'StackCTRL Power BI Reporting API',
            version: API_VERSION,
            authentication: {
                methods: [
                    'X-PowerBI-API-Key header',
                    'apiKey query parameter'
                ]
            },
            domainCoverage: {
                domains: [
                    'Identity Protection',
                    'Device Protection',
                    'Email Security',
                    'Network Security / Cloudflare',
                    'Governance',
                    'Compliance Validation',
                    'Security Alerts',
                    'Operations',
                    'Backup and Recovery',
                    'Risks',
                    'Applications'
                ],
                intelligenceSummaryFields: [
                    'OperationsHealth',
                    'OperationsRiskScore',
                    'ApplicationsHealth',
                    'ApplicationsRiskScore'
                ],
                domainMovementFields: [
                    'Direction',
                    'PreviousHealthScore',
                    'PreviousRiskScore',
                    'ChangePercent',
                    'ComparisonPeriod'
                ],
                enterpriseIntelligence: {
                    principle: 'Azure builds the intelligence. Power BI builds the report.',
                    producesReportLayouts: false,
                    datasets: [
                        'enterprise-runs', 'domain-intelligence', 'domain-findings', 'domain-risks',
                        'domain-recommendations', 'domain-trends', 'domain-evidence-audit',
                        'enterprise-synthesis', 'enterprise-board-report', 'enterprise-management-actions'
                    ]
                }
            },
            endpoints: POWERBI_DATASETS.map(definition => ({
                name: definition.name,
                path: `/api/powerbi/${definition.path}`,
                view: definition.view
            }))
        };
    }

    function openApiDocument(baseUrl = process.env.POWERBI_REPORTING_BASE_URL || DEFAULT_BASE_URL) {
        const queryParameters = [
            ['companyId', 'integer', 'Filter by CompanyID when supported.'],
            ['tenantId', 'string', 'Filter by TenantID when supported.'],
            ['snapshotId', 'integer', 'Filter by SnapshotID when supported.'],
            ['runId', 'integer', 'Filter by RunID when supported.'],
            ['periodType', 'string', 'Filter by period type when supported.'],
            ['comparisonPeriod', 'string', 'Filter historical rows by 24_hours, 7_days, 30_days, or 90_days when supported.'],
            ['fromDate', 'string', 'Inclusive start date in YYYY-MM-DD format.'],
            ['toDate', 'string', 'Inclusive end date in YYYY-MM-DD format.'],
            ['limit', 'integer', `Page size. Default ${DEFAULT_LIMIT}; maximum ${MAX_LIMIT}.`],
            ['offset', 'integer', 'Number of rows to skip.']
        ].map(([name, type, description]) => ({
            name,
            in: 'query',
            required: false,
            description,
            schema: type === 'integer' ? { type, minimum: 0 } : { type }
        }));

        const paths = {};
        const authenticationOptions = [
            { PowerBIHeaderAPIKey: [] },
            { PowerBIQueryAPIKey: [] }
        ];
        for (const definition of POWERBI_DATASETS) {
            paths[`/${definition.path}`] = {
                get: {
                    summary: definition.name,
                    operationId: `get${definition.path.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('')}`,
                    security: authenticationOptions,
                    parameters: queryParameters,
                    responses: {
                        200: {
                            description: `${definition.name} rows`,
                            content: {
                                'application/json': {
                                    example: {
                                        success: true,
                                        dataset: definition.path,
                                        count: 1,
                                        limit: DEFAULT_LIMIT,
                                        offset: 0,
                                        data: [definition.sample]
                                    }
                                }
                            }
                        },
                        400: { description: 'Invalid query parameter', content: { 'application/json': { example: { success: false, error: 'limit must be a whole number' } } } },
                        401: { description: 'Missing or invalid API key', content: { 'application/json': { example: { success: false, error: 'Unauthorized' } } } },
                        500: { description: 'Reporting API configuration or server error', content: { 'application/json': { example: { success: false, error: 'Reporting request failed' } } } }
                    }
                }
            };
        }

        paths['/'] = {
            get: {
                summary: 'Reporting API metadata', security: authenticationOptions,
                responses: { 200: { description: 'Available datasets', content: { 'application/json': { example: metadata() } } } }
            }
        };
        paths['/health'] = {
            get: {
                summary: 'Reporting view health', security: authenticationOptions,
                responses: { 200: { description: 'All reporting views are selectable' }, 503: { description: 'Database is unavailable' } }
            }
        };

        return {
            openapi: '3.0.3',
            info: {
                title: 'StackCTRL Power BI Reporting API',
                version: API_VERSION,
                description: 'Secure read-only access to compact and Enterprise Deep Reporting intelligence. Azure creates structured intelligence; Power BI creates the final report visuals. Enterprise datasets include domain narratives, findings, risks, recommendations, trends, evidence audit, synthesis, board narrative, and management actions. Fabric Dataflow Gen2 may authenticate with ?apiKey=<POWERBI_KEY>.'
            },
            servers: [{ url: String(baseUrl).replace(/\/$/, '') }],
            components: {
                securitySchemes: {
                    PowerBIHeaderAPIKey: {
                        type: 'apiKey',
                        in: 'header',
                        name: 'X-PowerBI-API-Key',
                        description: 'Preferred header authentication for API clients.'
                    },
                    PowerBIQueryAPIKey: {
                        type: 'apiKey',
                        in: 'query',
                        name: 'apiKey',
                        description: 'Fabric Dataflow Gen2-compatible query-string authentication over HTTPS.'
                    }
                }
            },
            paths
        };
    }

    return {
        authenticate,
        readDataset,
        health,
        metadata,
        openApiDocument,
        buildQuery
    };
}

module.exports = {
    API_KEY_SECRET_NAME,
    API_VERSION,
    DEFAULT_BASE_URL,
    DEFAULT_LIMIT,
    MAX_LIMIT,
    POWERBI_DATASETS,
    DATASET_BY_PATH,
    ReportingApiError,
    createPowerBIReportingService,
    safeApiKeyMatch,
    sanitizeRows
};
