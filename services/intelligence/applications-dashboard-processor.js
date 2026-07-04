const { buildApplicationsDashboardSource } = require('./applications-dashboard-source');

function buildApplicationsDashboardPayload({
    tenantKey = 'sunbird',
    payload = {},
    fetchedAt,
    success = true,
    now = () => new Date()
} = {}) {
    const collectedAt = fetchedAt || payload.fetchedAt || now().toISOString();
    const dashboardSource = buildApplicationsDashboardSource({
        applicationsRows: payload.applications || [],
        summary: payload.summary || {},
        userCount: payload.userCount,
        groupCount: payload.groupCount
    });
    return {
        success,
        tenant: tenantKey,
        fetchedAt: collectedAt,
        ...payload,
        applications: dashboardSource.apps,
        summary: { ...(payload.summary || {}), ...dashboardSource.dashboardMetrics },
        recommendations: dashboardSource.recommendations,
        dashboardMetrics: dashboardSource.dashboardMetrics
    };
}

module.exports = { buildApplicationsDashboardPayload };
