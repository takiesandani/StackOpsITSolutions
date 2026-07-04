const { buildOperationsDashboardSource } = require('./operations-dashboard-source');

function buildOperationsDashboardPayload({
    tenantKey = 'sunbird',
    payload = {},
    fetchedAt,
    success = true,
    now = () => new Date()
} = {}) {
    const collectedAt = fetchedAt || payload.fetchedAt || now().toISOString();
    const dashboardSource = buildOperationsDashboardSource({
        tasks: payload.tasks || [],
        summary: payload.summary || {}
    });
    return {
        success,
        tenant: tenantKey,
        fetchedAt: collectedAt,
        ...payload,
        tasks: dashboardSource.allTasks,
        apiTasks: dashboardSource.tasks,
        summary: { ...(payload.summary || {}), ...dashboardSource.dashboardMetrics },
        recommendations: dashboardSource.recommendations,
        dashboardMetrics: dashboardSource.dashboardMetrics
    };
}

module.exports = { buildOperationsDashboardPayload };
