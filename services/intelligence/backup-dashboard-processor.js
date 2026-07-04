const { buildBackupDashboardSource } = require('./backup-dashboard-source');

function buildBackupDashboardPayload({
    tenantKey = 'sunbird',
    payload = {},
    fetchedAt,
    success = true,
    now = () => new Date()
} = {}) {
    const collectedAt = fetchedAt || payload.fetchedAt || now().toISOString();
    const dashboardSource = buildBackupDashboardSource({ payload });
    return {
        success,
        tenant: tenantKey,
        fetchedAt: collectedAt,
        summary: { ...payload.summary, ...dashboardSource.dashboardMetrics },
        storage: payload.storage || {},
        insights: Array.isArray(payload.insights) ? payload.insights : [],
        recommendations: dashboardSource.recommendations,
        dashboardMetrics: dashboardSource.dashboardMetrics,
        evidenceRows: dashboardSource.rows
    };
}

module.exports = { buildBackupDashboardPayload };
