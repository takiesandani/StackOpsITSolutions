const { isApiConnectedGovernanceRow } = require('./api-evidence-filters');

function numberValue(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function buildGovernanceRecommendations(metrics) {
    const recs = [];
    if (numberValue(metrics.attentionRequiredRows) > 0) {
        recs.push({
            priority: 'high',
            title: 'Review governance evidence requiring attention',
            detail: `${metrics.attentionRequiredRows} API-connected governance row(s) need review.`
        });
    }
    if (numberValue(metrics.manualRowsExcluded) > 0) {
        recs.push({
            priority: 'medium',
            title: 'Complete manual governance attestations separately',
            detail: `${metrics.manualRowsExcluded} manual governance item(s) are excluded from Azure analysis and remain dashboard-only.`
        });
    }
    if (!recs.length) {
        recs.push({
            priority: 'low',
            title: 'Maintain governance evidence baseline',
            detail: 'No urgent API-connected governance recommendations from current evidence.'
        });
    }
    return recs;
}

function buildGovernanceDashboardSource({ rows = [], summary = {} } = {}) {
    const allRows = Array.isArray(rows) ? rows : [];
    const apiRows = allRows.filter(isApiConnectedGovernanceRow);
    const manualRowsExcluded = allRows.length - apiRows.length;
    const attentionRequiredRows = apiRows.filter(row => /attention required/i.test(String(row.status || ''))).length;
    const connectedRows = apiRows.filter(row => /connected/i.test(String(row.status || ''))).length;
    const governanceScore = numberValue(
        summary.score ?? summary.governanceScore,
        apiRows.length
            ? Math.max(0, Math.min(100, Math.round((connectedRows / apiRows.length) * 100) - (attentionRequiredRows * 8)))
            : 0
    );
    const recommendations = buildGovernanceRecommendations({
        attentionRequiredRows,
        manualRowsExcluded
    });
    const dashboardMetrics = {
        totalRows: allRows.length,
        apiConnectedRows: apiRows.length,
        manualRowsExcluded,
        attentionRequiredRows,
        connectedRows,
        governanceScore,
        recommendationsCount: recommendations.length
    };
    return {
        rows: apiRows,
        allRows,
        recommendations,
        dashboardMetrics
    };
}

module.exports = {
    buildGovernanceDashboardSource,
    buildGovernanceRecommendations
};
