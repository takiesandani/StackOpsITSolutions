const { asArray, buildContext, payloadFromSource } = require('./common');

function buildComplianceDashboardContext(source) {
    const payload = payloadFromSource(source);
    const controls = asArray(payload.controls || payload.evidence || payload.items);
    const failedControls = controls.filter(control => /fail|non.?compliant|attention|open/i.test(String(control.status || control.result || '')));
    return buildContext(source, {
        dashboardMetrics: payload.summary || source.metrics || {},
        calculatedIndicators: {
            ...(payload.calculatedIndicators || payload.scores || {}),
            failedControlCount: failedControls.length,
            complianceValidationAvailable: controls.length > 0
        },
        evidenceLists: {
            controls,
            failedControls,
            validationEvidence: asArray(payload.validationEvidence),
            recommendations: asArray(payload.recommendations)
        },
        chartsData: payload.chartsData || payload.charts || payload.distribution || {}
    });
}

module.exports = buildComplianceDashboardContext;
