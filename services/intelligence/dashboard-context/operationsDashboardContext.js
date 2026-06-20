const { asArray, buildContext, payloadFromSource } = require('./common');

function buildOperationsDashboardContext(source) {
    const payload = payloadFromSource(source);
    return buildContext(source, {
        dashboardMetrics: payload.summary || source.metrics || {},
        calculatedIndicators: payload.calculatedIndicators || payload.scores || {},
        evidenceLists: {
            operationalEvidence: asArray(payload.evidence || payload.items),
            actions: asArray(payload.actions),
            issues: asArray(payload.issues),
            recommendations: asArray(payload.recommendations)
        },
        chartsData: payload.chartsData || payload.charts || payload.distribution || {}
    });
}

module.exports = buildOperationsDashboardContext;
