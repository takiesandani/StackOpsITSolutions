const { buildGovernanceDashboardSource } = require('./governance-dashboard-source');

function buildGovernanceDashboardPayload({
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

    const dashboardSource = buildGovernanceDashboardSource({
        rows: payload.rows || [],
        summary: payload.summary || {}
    });

    return {
        success,
        tenant: tenantKey,
        fetchedAt: collectedAt,
        collectionStatus: warnings.length ? 'completed_with_warnings' : 'complete',
        warnings: [...new Set(warnings)],
        sourceAudit: {
            ...(payload.sourceAudit || {}),
            source: payload.sourceAudit?.source || 'stackctrl_governance_dashboard',
            fetchedAt: collectedAt,
            warnings: [...new Set(warnings)]
        },
        ...payload,
        rows: dashboardSource.allRows,
        apiRows: dashboardSource.rows,
        summary: {
            ...(payload.summary || {}),
            ...dashboardSource.dashboardMetrics,
            score: dashboardSource.dashboardMetrics.governanceScore
        },
        recommendations: dashboardSource.recommendations,
        dashboardMetrics: dashboardSource.dashboardMetrics
    };
}

module.exports = { buildGovernanceDashboardPayload };
