const MAX_CONTEXT_BYTES = 500 * 1024;
const DEFAULT_EVIDENCE_LIMIT = 40;
const DEFAULT_DOMAIN_LIMIT = 8;

const SEVERITY_SCORES = {
    critical: 100,
    severe: 95,
    high: 80,
    medium: 45,
    moderate: 40,
    low: 15,
    informational: 5
};

const PRIORITY_SIGNALS = [
    ['privileged', 25],
    ['mfa', 24],
    ['legacy authentication', 24],
    ['legacy auth', 24],
    ['non-compliant', 22],
    ['noncompliant', 22],
    ['unencrypted', 22],
    ['stale device', 20],
    ['email threat', 20],
    ['high-risk application', 20],
    ['backup gap', 20],
    ['cloudflare', 16],
    ['network security', 16],
    ['compliance failure', 18],
    ['governance gap', 18],
    ['missing source', 15],
    ['stale source', 14]
];

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

function sizeBytes(value) {
    return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
}

function compactValue(value, depth = 0, options = {}) {
    const maxDepth = options.maxDepth ?? 5;
    const maxArrayItems = options.maxArrayItems ?? 5;
    const maxStringLength = options.maxStringLength ?? 1200;
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        return value.length > maxStringLength ? `${value.slice(0, maxStringLength)}…` : value;
    }
    if (depth >= maxDepth) {
        if (Array.isArray(value)) return { count: value.length, detailOmitted: true };
        return { fields: Object.keys(value || {}).slice(0, 20), detailOmitted: true };
    }
    if (Array.isArray(value)) {
        return {
            count: value.length,
            sample: value.slice(0, maxArrayItems).map(item => compactValue(item, depth + 1, options)),
            omitted: Math.max(0, value.length - maxArrayItems)
        };
    }
    if (typeof value === 'object') {
        const result = {};
        for (const [key, nested] of Object.entries(value)) {
            if (/^(raw|rawdata|rawpayload|payload|contextjson|evidencejson)$/i.test(key)) continue;
            result[key] = compactValue(nested, depth + 1, options);
        }
        return result;
    }
    return String(value);
}

function severityOf(item) {
    const candidates = [
        item?.severity,
        item?.Severity,
        item?.priority,
        item?.Priority,
        item?.data?.severity,
        item?.data?.Severity,
        item?.data?.priority,
        item?.data?.Priority
    ].filter(Boolean);
    const text = candidates.join(' ').toLowerCase();
    return Object.keys(SEVERITY_SCORES).find(level => text.includes(level)) || 'unknown';
}

function domainOf(item) {
    return String(
        item?.domain || item?.Domain || item?.sourceKey || item?.data?.domain ||
        item?.data?.Domain || item?.data?.evidenceType || 'general'
    ).toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 80);
}

function rankEvidence(item) {
    const severity = severityOf(item);
    const searchable = JSON.stringify(item || {}).toLowerCase();
    let score = SEVERITY_SCORES[severity] || 10;
    for (const [signal, weight] of PRIORITY_SIGNALS) {
        if (searchable.includes(signal)) score += weight;
    }
    if (item?.isExpected === true && ['missing', 'error', 'stale'].includes(String(item?.status).toLowerCase())) score += 30;
    return score;
}

function summarizeEvidence(item, index) {
    const data = item?.data || item || {};
    return {
        evidenceKey: `${item?.sourceKey || 'source'}:${data?.evidenceType || data?.type || index}`,
        sourceKey: item?.sourceKey || data?.sourceKey || null,
        displayName: item?.displayName || data?.displayName || null,
        domain: domainOf(item),
        severity: severityOf(item),
        rank: rankEvidence(item),
        evidenceType: data?.evidenceType || data?.type || null,
        title: data?.title || data?.name || data?.label || null,
        summary: data?.summary || data?.description || data?.message || null,
        observedAt: data?.observedAt || data?.createdAt || data?.lastUpdated || null,
        data: compactValue(data, 0, { maxDepth: 5, maxArrayItems: 10, maxStringLength: 1200 })
    };
}

function selectEvidence(evidence, overallLimit = DEFAULT_EVIDENCE_LIMIT, domainLimit = DEFAULT_DOMAIN_LIMIT) {
    const ranked = (Array.isArray(evidence) ? evidence : [])
        .map(summarizeEvidence)
        .sort((left, right) => right.rank - left.rank);
    const selected = [];
    const selectedKeys = new Set();
    const domainCounts = new Map();

    function include(item) {
        if (selectedKeys.has(item.evidenceKey)) return;
        selected.push(item);
        selectedKeys.add(item.evidenceKey);
        domainCounts.set(item.domain, (domainCounts.get(item.domain) || 0) + 1);
    }

    // Critical evidence is never removed by the normal ranking limit.
    ranked.filter(item => item.severity === 'critical' || item.severity === 'severe').forEach(include);
    for (const item of ranked) {
        if ((domainCounts.get(item.domain) || 0) < domainLimit) include(item);
    }
    for (const item of ranked) {
        if (selected.length >= Math.max(overallLimit, selectedKeys.size)) break;
        include(item);
    }

    selected.sort((left, right) => right.rank - left.rank);
    return {
        items: selected.slice(0, Math.max(overallLimit, ranked.filter(item => ['critical', 'severe'].includes(item.severity)).length)),
        totalCount: ranked.length
    };
}

function riskSummary(context = {}) {
    const risk = context.riskEngine || {};
    return {
        overallRiskScore: risk.overallRiskScore ?? null,
        overallRiskLevel: risk.overallRiskLevel ?? null,
        securityMaturityScore: risk.securityMaturityScore ?? null,
        securityMaturityLevel: risk.securityMaturityLevel ?? null,
        dataCompletenessScore: risk.dataCompletenessScore ?? context.dataCompleteness?.score ?? null,
        domainRiskScores: compactValue(risk.domainRiskScores || {}, 0, { maxArrayItems: 0 }),
        executiveKPIs: compactValue(risk.executiveKPIs || context.executiveKPIs || {}, 0, { maxArrayItems: 0 })
    };
}

function sourceSummary(context = {}) {
    return (Array.isArray(context.sources) ? context.sources : []).map(source => ({
        sourceKey: source.sourceKey,
        displayName: source.displayName,
        status: source.status,
        isExpected: Boolean(source.isExpected),
        freshness: compactValue(source.freshness || {}, 0, { maxArrayItems: 0 }),
        evidenceCount: Number(source.evidenceCount ?? source.evidence?.length ?? 0),
        metrics: compactValue(source.metrics || {}, 0, { maxDepth: 5, maxArrayItems: 0 }),
        dashboardMetrics: compactValue(source.dashboardMetrics || {}, 0, { maxDepth: 5, maxArrayItems: 0 }),
        calculatedIndicators: compactValue(source.calculatedIndicators || {}, 0, { maxDepth: 5, maxArrayItems: 0 }),
        chartsData: compactValue(source.chartsData || {}, 0, { maxDepth: 5, maxArrayItems: 20, maxStringLength: 800 }),
        sourceReferences: compactValue(source.sourceReferences || {}, 0, { maxDepth: 4, maxArrayItems: 10, maxStringLength: 800 }),
        warnings: (Array.isArray(source.warnings) ? source.warnings : []).slice(0, 10).map(value => compactValue(value)),
        errorMessage: source.errorMessage || null
    }));
}

function previousOutputSummary(context = {}) {
    const rows = Array.isArray(context.previousIntelligence) ? context.previousIntelligence : [];
    const latestByType = new Map();
    for (const row of rows) {
        const type = row.OutputType || row.outputType;
        if (type && !latestByType.has(type)) latestByType.set(type, row);
    }
    return {
        topRisks: compactValue(latestByType.get('risk_register')?.ContentJson || [], 0, { maxArrayItems: 10, maxStringLength: 800 }),
        topRecommendations: compactValue(latestByType.get('recommendations')?.ContentJson || [], 0, { maxArrayItems: 10, maxStringLength: 800 }),
        latestExecutiveSummary: compactValue(latestByType.get('executive_summary')?.ContentJson || null, 0, { maxArrayItems: 3 }),
        latestTrendAnalysis: compactValue(latestByType.get('trend_analysis')?.ContentJson || [], 0, { maxArrayItems: 10, maxStringLength: 800 })
    };
}

function compactHistoricalContext(historicalContext = {}) {
    const periods = {};
    for (const [key, comparison] of Object.entries(historicalContext.comparisons || {})) {
        const snapshot = comparison?.snapshot;
        const baselineContext = snapshot?.context || {};
        const baselineEvidence = selectEvidence(baselineContext.evidence || [], 5, 2);
        periods[key] = {
            label: historicalContext.historicalIntelligence?.periods?.[key]?.label || key,
            availability: comparison?.availability || 'unavailable',
            targetAt: comparison?.targetAt || null,
            differenceMinutes: comparison?.differenceMinutes ?? null,
            baselineSnapshot: snapshot ? {
                snapshotId: snapshot.snapshotId,
                createdAt: snapshot.createdAt,
                snapshotType: snapshot.snapshotType,
                dataCompletenessScore: snapshot.dataCompletenessScore,
                riskScores: riskSummary(baselineContext),
                sourceHealth: sourceSummary(baselineContext).map(source => ({
                    sourceKey: source.sourceKey,
                    status: source.status,
                    isExpected: source.isExpected,
                    evidenceCount: source.evidenceCount,
                    freshness: source.freshness
                })),
                topEvidence: baselineEvidence.items
            } : null,
            metricChanges: compactValue(comparison?.metricChanges || {}, 0, { maxDepth: 6, maxArrayItems: 0 }),
            riskAndKpiChanges: compactValue(
                historicalContext.historicalIntelligence?.periods?.[key]?.changes || {},
                0,
                { maxDepth: 6, maxArrayItems: 0 }
            )
        };
    }
    return {
        generatedAt: historicalContext.historicalIntelligence?.generatedAt || new Date().toISOString(),
        periods,
        instructions: {
            compareCurrentAgainstAvailableHistory: true,
            doNotInventMissingPeriods: true
        }
    };
}

function trimToTarget(context, maxBytes) {
    if (sizeBytes(context) <= maxBytes) return context;
    const trimmed = {
        ...context,
        topEvidence: context.topEvidence.slice(0, 25).map(item => ({
            ...item,
            data: compactValue(item.data, 0, { maxDepth: 4, maxArrayItems: 4, maxStringLength: 600 })
        }))
    };
    for (const period of Object.values(trimmed.historicalComparisons?.periods || {})) {
        if (period.baselineSnapshot) {
            period.baselineSnapshot.topEvidence = period.baselineSnapshot.topEvidence.slice(0, 2).map(item => ({
                evidenceKey: item.evidenceKey,
                sourceKey: item.sourceKey,
                domain: item.domain,
                severity: item.severity,
                title: item.title,
                summary: item.summary
            }));
        }
    }
    if (sizeBytes(trimmed) <= maxBytes) return trimmed;
    trimmed.topEvidence = trimmed.topEvidence.slice(0, 15).map(item => ({
        evidenceKey: item.evidenceKey,
        sourceKey: item.sourceKey,
        domain: item.domain,
        severity: item.severity,
        rank: item.rank,
        evidenceType: item.evidenceType,
        title: item.title,
        summary: item.summary,
        observedAt: item.observedAt
    }));
    trimmed.sourceSummary = trimmed.sourceSummary.map(source => ({
        ...source,
        warnings: source.warnings.slice(0, 3),
        dashboardMetrics: compactValue(source.dashboardMetrics, 0, { maxDepth: 3, maxArrayItems: 0, maxStringLength: 400 }),
        chartsData: { detailOmittedToMeetPayloadTarget: true },
        sourceReferences: { detailOmittedToMeetPayloadTarget: true }
    }));
    return trimmed;
}

function buildCompactIntelligenceContext({
    snapshot,
    historicalContext = null,
    periodRollups = [],
    periodType = 'snapshot',
    periodStart = null,
    periodEnd = null,
    maxBytes = MAX_CONTEXT_BYTES
} = {}) {
    if (!snapshot) throw new Error('A frozen StackCTRL snapshot is required');
    const context = parseJson(snapshot.ContextJson ?? snapshot.context, {}) || {};
    const snapshotId = Number(snapshot.ID ?? snapshot.snapshotId);
    const companyId = Number(snapshot.CompanyID ?? snapshot.companyId ?? context.tenant?.companyId);
    const selected = selectEvidence(context.evidence || []);
    const history = compactHistoricalContext(historicalContext || {});
    const unavailablePeriods = Object.entries(history.periods)
        .filter(([, value]) => value.availability !== 'available')
        .map(([key]) => key);

    let compactContextJson = {
        contextType: 'stackctrl_compact_intelligence',
        schemaVersion: 1,
        fullSnapshotId: snapshotId,
        companyId,
        tenantSummary: {
            companyId,
            tenantKey: context.tenant?.tenantKey || snapshot.TenantKey || null,
            companyName: context.tenant?.company?.CompanyName || context.tenant?.company?.companyName || null,
            capabilityProfile: context.capabilities?.profileKey || null
        },
        periodSummary: {
            periodType,
            periodStart: periodStart || context.period?.start || snapshot.PeriodStart || null,
            periodEnd: periodEnd || context.period?.end || snapshot.PeriodEnd || null,
            snapshotCreatedAt: snapshot.CreatedAt || snapshot.createdAt || null
        },
        dataCompleteness: compactValue(context.dataCompleteness || {}, 0, { maxArrayItems: 0 }),
        riskScores: riskSummary(context),
        healthKpis: compactValue(context.riskEngine?.executiveKPIs || context.executiveKPIs || {}, 0, { maxArrayItems: 0 }),
        dashboardCalculatedMetrics: compactValue(context.metrics || snapshot.MetricsJson || {}, 0, { maxDepth: 6, maxArrayItems: 0 }),
        sourceSummary: sourceSummary(context),
        topEvidence: selected.items,
        previousIntelligence: previousOutputSummary(context),
        periodRollups: compactValue(periodRollups, 0, { maxDepth: 5, maxArrayItems: 40, maxStringLength: 1200 }),
        historicalComparisons: history,
        limitations: {
            warnings: (Array.isArray(context.warnings) ? context.warnings : []).slice(0, 30).map(value => compactValue(value)),
            unavailableHistoricalPeriods: unavailablePeriods,
            evidenceOmittedCount: Math.max(0, selected.totalCount - selected.items.length),
            fullRawEvidenceRetainedByStackCTRL: true,
            azureReceivedRawVendorLists: false
        },
        aiInstructions: {
            analyseOnlyThisFrozenStackCTRLPackage: true,
            compareCurrentAgainstEveryAvailableHistoricalPeriod: true,
            distinguishEvidenceFromInterpretation: true,
            doNotInventMissingHistoricalPeriods: true,
            doNotRecalculateAuthoritativeStackCTRLRiskScores: true
        }
    };

    compactContextJson = trimToTarget(compactContextJson, maxBytes);
    const compactContextSizeBytes = sizeBytes(compactContextJson);
    return {
        fullSnapshotId: snapshotId,
        companyId,
        periodType,
        periodStart: compactContextJson.periodSummary.periodStart,
        periodEnd: compactContextJson.periodSummary.periodEnd,
        compactContextJson,
        compactContextSizeBytes,
        fullContextSizeBytes: sizeBytes(context),
        evidenceIncludedCount: compactContextJson.topEvidence.length,
        evidenceOmittedCount: Math.max(0, selected.totalCount - compactContextJson.topEvidence.length),
        sourceSummary: compactContextJson.sourceSummary,
        riskScores: compactContextJson.riskScores,
        healthKpis: compactContextJson.healthKpis,
        topEvidence: compactContextJson.topEvidence,
        limitations: compactContextJson.limitations
    };
}

module.exports = {
    MAX_CONTEXT_BYTES,
    buildCompactIntelligenceContext,
    compactHistoricalContext,
    rankEvidence,
    selectEvidence,
    sizeBytes
};
