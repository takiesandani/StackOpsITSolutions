const { buildEmailDashboardSource } = require('./email-dashboard-source');

function buildEmailDashboardPayload({
    tenantKey = 'sunbird',
    payload = {},
    fetchedAt,
    success = true,
    now = () => new Date()
} = {}) {
    const collectedAt = fetchedAt || payload.fetchedAt || now().toISOString();

    const warnings = [
        ...(Array.isArray(payload.warnings) ? payload.warnings : []),
        ...(Array.isArray(payload.sourceAudit?.warnings) ? payload.sourceAudit.warnings : [])
    ]
        .map(item => String(item || '').trim())
        .filter(Boolean);

    const dashboardSource = buildEmailDashboardSource({
        alertsRows: payload.alerts || [],
        incidentsRows: payload.incidents || [],
        mailActivity: payload.mailActivity || {},
        summary: payload.summary || {},
        threats: payload.threats || null,
        affectedUsers: payload.affectedUsers || {}
    });

    return {
        success,
        tenant: tenantKey,
        fetchedAt: collectedAt,
        collectionStatus: warnings.length ? 'completed_with_warnings' : 'complete',
        warnings: [...new Set(warnings)],
        sourceAudit: {
            ...(payload.sourceAudit || {}),
            warnings: [...new Set(warnings)],
            fetchedAt: collectedAt
        },
        summary: {
            ...payload.summary,
            ...dashboardSource.dashboardMetrics
        },
        alerts: dashboardSource.alerts,
        incidents: dashboardSource.incidents,
        threats: dashboardSource.threatBreakdown,
        affectedUsers: payload.affectedUsers || {},
        mailActivity: {
            users: dashboardSource.mailUsers,
            summary: dashboardSource.dashboardMetrics
        },
        insights: Array.isArray(payload.insights) ? payload.insights : [],
        recommendations: dashboardSource.recommendations,
        dashboardMetrics: dashboardSource.dashboardMetrics
    };
}

module.exports = {
    buildEmailDashboardPayload
};
