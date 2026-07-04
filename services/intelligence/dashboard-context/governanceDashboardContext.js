const { asArray, buildContext, payloadFromSource } = require('./common');

function buildGovernanceDashboardContext(source) {
    const payload = payloadFromSource(source);
    const evidence = payload.evidence || payload.controls || payload.items || [];
    return buildContext(source, {
        dashboardMetrics: payload.summary || source.metrics || {},
        calculatedIndicators: payload.calculatedIndicators || payload.scores || {},
        evidenceLists: {
            governanceEvidence: asArray(evidence),
            controls: asArray(payload.controls),
            risks: asArray(payload.risks),
            recommendations: asArray(payload.recommendations)
        },
        chartsData: payload.chartsData || payload.charts || payload.distribution || {}
    });
}

module.exports = buildGovernanceDashboardContext;
