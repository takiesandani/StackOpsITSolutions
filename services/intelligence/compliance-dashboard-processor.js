const { buildComplianceDashboardSource } = require('./compliance-dashboard-source');

function buildComplianceDashboardPayload({
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

    const dashboardSource = buildComplianceDashboardSource({
        controls: payload.controls || [],
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
            source: payload.sourceAudit?.source || 'stackctrl_compliance_dashboard',
            fetchedAt: collectedAt,
            warnings: [...new Set(warnings)]
        },
        ...payload,
        controls: dashboardSource.allControls,
        apiControls: dashboardSource.controls,
        summary: {
            ...(payload.summary || {}),
            ...dashboardSource.dashboardMetrics,
            score: dashboardSource.dashboardMetrics.complianceScore
        },
        recommendations: dashboardSource.recommendations,
        dashboardMetrics: dashboardSource.dashboardMetrics
    };
}

module.exports = { buildComplianceDashboardPayload };