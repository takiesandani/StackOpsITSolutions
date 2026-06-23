const { isApiSourcedComplianceControl } = require('./api-evidence-filters');

function numberValue(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function insightTone(insight) {
    const text = String(insight || '');
    if (text.includes('🔴')) return 'failing';
    if (text.includes('🟡')) return 'partial';
    if (text.includes('🟢')) return 'passing';
    return 'unknown';
}

function buildComplianceRecommendations(metrics) {
    const recs = [];
    if (numberValue(metrics.failingControls) > 0) {
        recs.push({
            priority: 'critical',
            title: 'Remediate failing compliance controls',
            detail: `${metrics.failingControls} API-sourced control(s) are in a failing state.`
        });
    }
    if (numberValue(metrics.partialControls) > 0) {
        recs.push({
            priority: 'medium',
            title: 'Review partial compliance controls',
            detail: `${metrics.partialControls} API-sourced control(s) need follow-up.`
        });
    }
    if (numberValue(metrics.manualControlsExcluded) > 0) {
        recs.push({
            priority: 'low',
            title: 'Track manual attestation controls outside Azure input',
            detail: `${metrics.manualControlsExcluded} manual control(s) remain dashboard-only.`
        });
    }
    if (!recs.length) {
        recs.push({
            priority: 'low',
            title: 'Maintain compliance validation baseline',
            detail: 'No urgent API-sourced compliance recommendations from current evidence.'
        });
    }
    return recs;
}

function buildComplianceDashboardSource({ controls = [], summary = {} } = {}) {
    const allControls = Array.isArray(controls) ? controls : [];
    const apiControls = allControls.filter(isApiSourcedComplianceControl);
    const manualControlsExcluded = allControls.length - apiControls.length;
    const failingControls = apiControls.filter(control => insightTone(control.insight) === 'failing').length;
    const partialControls = apiControls.filter(control => insightTone(control.insight) === 'partial').length;
    const passingControls = apiControls.filter(control => insightTone(control.insight) === 'passing').length;
    const complianceScore = numberValue(
        summary.score ?? summary.complianceScore,
        apiControls.length
            ? Math.max(0, Math.min(100, Math.round((passingControls / apiControls.length) * 100) - (failingControls * 10) - (partialControls * 4)))
            : 0
    );
    const recommendations = buildComplianceRecommendations({
        failingControls,
        partialControls,
        manualControlsExcluded
    });
    const dashboardMetrics = {
        totalControls: allControls.length,
        apiControls: apiControls.length,
        manualControlsExcluded,
        failingControls,
        partialControls,
        passingControls,
        complianceScore,
        recommendationsCount: recommendations.length
    };
    return {
        controls: apiControls,
        allControls,
        recommendations,
        dashboardMetrics
    };
}

module.exports = {
    buildComplianceDashboardSource,
    buildComplianceRecommendations
};
