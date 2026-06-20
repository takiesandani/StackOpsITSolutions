const { buildRiskEngine } = require('./risk-engine');

const PERIOD_LABELS = {
    previous: 'Previous snapshot',
    '24_hours': 'Today vs yesterday',
    '7_days': 'Today vs last week',
    '30_days': 'Today vs last month',
    '90_days': 'Today vs last quarter'
};

function numberOrNull(value) {
    const number = Number(value);
    return value === null || value === undefined || !Number.isFinite(number) ? null : number;
}

function snapshotRisk(snapshot) {
    if (!snapshot) return null;
    const context = snapshot.context || {};
    if (context.riskEngine) return context.riskEngine;
    return buildRiskEngine({
        sources: Array.isArray(context.sources) ? context.sources : [],
        dataCompleteness: context.dataCompleteness || { score: snapshot.dataCompletenessScore }
    });
}

function change(currentValue, baselineValue, higherIsBetter = true) {
    const current = numberOrNull(currentValue);
    const baseline = numberOrNull(baselineValue);
    if (current == null || baseline == null) return null;
    const delta = current - baseline;
    return {
        current,
        baseline,
        change: Number(delta.toFixed(2)),
        changePercent: baseline === 0 ? null : Number(((delta / Math.abs(baseline)) * 100).toFixed(2)),
        direction: delta === 0 ? 'stable' : (higherIsBetter ? (delta > 0 ? 'improving' : 'declining') : (delta > 0 ? 'worsening' : 'improving'))
    };
}

function compareRisk(currentRisk, baselineRisk) {
    if (!currentRisk || !baselineRisk) return null;
    const executiveKPIs = {};
    for (const key of Object.keys(currentRisk.executiveKPIs || {})) {
        executiveKPIs[key] = change(currentRisk.executiveKPIs[key], baselineRisk.executiveKPIs?.[key], true);
    }
    const domains = {};
    for (const key of Object.keys(currentRisk.domainRiskScores || {})) {
        domains[key] = change(currentRisk.domainRiskScores[key], baselineRisk.domainRiskScores?.[key], false);
    }
    return {
        overallRisk: change(currentRisk.overallRiskScore, baselineRisk.overallRiskScore, false),
        securityMaturity: change(currentRisk.securityMaturityScore, baselineRisk.securityMaturityScore, true),
        domainRiskScores: domains,
        executiveKPIs
    };
}

function riskSummary(snapshot) {
    const risk = snapshotRisk(snapshot);
    if (!risk) return null;
    return {
        snapshotId: snapshot.snapshotId,
        createdAt: snapshot.createdAt,
        overallRiskScore: risk.overallRiskScore,
        overallRiskLevel: risk.overallRiskLevel,
        securityMaturityScore: risk.securityMaturityScore,
        securityMaturityLevel: risk.securityMaturityLevel,
        domainRiskScores: risk.domainRiskScores,
        executiveKPIs: risk.executiveKPIs,
        dataCompletenessScore: risk.dataCompletenessScore
    };
}

function buildHistoricalIntelligence({ currentSnapshot, comparisons = {} } = {}) {
    const currentRisk = snapshotRisk(currentSnapshot);
    const periods = {};
    for (const [key, comparison] of Object.entries(comparisons)) {
        const baselineRisk = snapshotRisk(comparison.snapshot);
        periods[key] = {
            label: PERIOD_LABELS[key] || key,
            availability: comparison.availability,
            targetAt: comparison.targetAt,
            differenceMinutes: comparison.differenceMinutes,
            baseline: riskSummary(comparison.snapshot),
            changes: compareRisk(currentRisk, baselineRisk)
        };
    }
    return {
        generatedAt: new Date().toISOString(),
        current: riskSummary(currentSnapshot),
        periods
    };
}

module.exports = {
    PERIOD_LABELS,
    buildHistoricalIntelligence,
    compareRisk
};
