const { buildSecurityDashboardSource } = require('./security-dashboard-source');

function buildSecurityDashboardPayload({
    tenantKey = 'sunbird',
    payload = {},
    fetchedAt,
    success = true,
    now = () => new Date()
} = {}) {
    const collectedAt = fetchedAt || payload.fetchedAt || now().toISOString();
    const dashboardSource = buildSecurityDashboardSource({
        alertsRows: payload.alerts || [],
        incidentsRows: payload.incidents || [],
        threatsRows: payload.threats || [],
        suspiciousSignInsRows: payload.signIns?.suspicious || [],
        summary: payload.summary || {},
        recommendations: payload.recommendations
    });
    return {
        success,
        tenant: tenantKey,
        fetchedAt: collectedAt,
        ...payload,
        summary: { ...(payload.summary || {}), ...dashboardSource.dashboardMetrics },
        alerts: dashboardSource.alerts,
        incidents: dashboardSource.incidents,
        threats: dashboardSource.threats,
        signIns: payload.signIns || { suspicious: dashboardSource.suspiciousSignIns },
        recommendations: dashboardSource.recommendations,
        dashboardMetrics: dashboardSource.dashboardMetrics
    };
}

module.exports = { buildSecurityDashboardPayload };
