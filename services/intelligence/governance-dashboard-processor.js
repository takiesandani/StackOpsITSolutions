const { buildGovernanceDashboardSource } = require('./governance-dashboard-source');

function buildGovernanceDashboardPayload({
    tenantKey = 'sunbird',
    payload = {},
    fetchedAt,
    success = true,
    now = () => new Date()
} = {}) {
    const collectedAt = fetchedAt || payload.fetchedAt || now().toISOString();
    const dashboardSource = buildGovernanceDashboardSource({
        rows: payload.rows || [],
        summary: payload.summary || {}
    });
    return {
        success,
        tenant: tenantKey,
        fetchedAt: collectedAt,
        ...payload,
        rows: dashboardSource.allRows,
        apiRows: dashboardSource.rows,
        summary: { ...(payload.summary || {}), ...dashboardSource.dashboardMetrics, score: dashboardSource.dashboardMetrics.governanceScore },
        recommendations: dashboardSource.recommendations,
        dashboardMetrics: dashboardSource.dashboardMetrics
    };
}

module.exports = { buildGovernanceDashboardPayload };
