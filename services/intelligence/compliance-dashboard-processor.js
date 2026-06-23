const { buildComplianceDashboardSource } = require('./compliance-dashboard-source');

function buildComplianceDashboardPayload({
    tenantKey = 'sunbird',
    payload = {},
    fetchedAt,
    success = true,
    now = () => new Date()
} = {}) {
    const collectedAt = fetchedAt || payload.fetchedAt || now().toISOString();
    const dashboardSource = buildComplianceDashboardSource({
        controls: payload.controls || [],
        summary: payload.summary || {}
    });
    return {
        success,
        tenant: tenantKey,
        fetchedAt: collectedAt,
        ...payload,
        controls: dashboardSource.allControls,
        apiControls: dashboardSource.controls,
        summary: { ...(payload.summary || {}), ...dashboardSource.dashboardMetrics, score: dashboardSource.dashboardMetrics.complianceScore },
        recommendations: dashboardSource.recommendations,
        dashboardMetrics: dashboardSource.dashboardMetrics
    };
}

module.exports = { buildComplianceDashboardPayload };
