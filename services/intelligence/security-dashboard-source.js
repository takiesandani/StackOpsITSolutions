function numberValue(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function buildSecurityRecommendations(summary, evidence = {}) {
    const recs = [];
    if (numberValue(summary.highSeverityAlerts) > 0) {
        recs.push({ priority: 'critical', title: 'Review high severity alerts', detail: `${summary.highSeverityAlerts} high or critical alert(s) need analyst review.` });
    }
    if (numberValue(summary.usersUnderAttack) > 0) {
        recs.push({ priority: 'high', title: 'Investigate repeated suspicious sign-ins', detail: `${summary.usersUnderAttack} user(s) show repeated failed or risky access attempts.` });
    }
    if (numberValue(summary.activeIncidents) > 0) {
        recs.push({ priority: 'high', title: 'Triage active incidents', detail: `${summary.activeIncidents} active incident(s) are still open.` });
    }
    if (numberValue(summary.threatIndicators) > 0) {
        recs.push({ priority: 'medium', title: 'Validate threat indicators', detail: `${summary.threatIndicators} threat indicator(s) are present in the tenant feed.` });
    }
    if (!recs.length) {
        recs.push({ priority: 'low', title: 'Maintain SOC monitoring baseline', detail: 'No urgent security alert recommendations from current evidence.' });
    }
    return recs;
}

function buildSecurityDashboardSource({
    alertsRows = [],
    incidentsRows = [],
    threatsRows = [],
    suspiciousSignInsRows = [],
    summary = {},
    recommendations: inputRecommendations = null
} = {}) {
    const alerts = Array.isArray(alertsRows) ? alertsRows : [];
    const incidents = Array.isArray(incidentsRows) ? incidentsRows : [];
    const threats = Array.isArray(threatsRows) ? threatsRows : [];
    const suspiciousSignIns = Array.isArray(suspiciousSignInsRows) ? suspiciousSignInsRows : [];
    const highSeverityAlerts = alerts.filter(alert => ['critical', 'high'].includes(String(alert.severity || '').toLowerCase())).length;
    const activeIncidents = incidents.filter(incident => ['active', 'inprogress', 'newalert'].includes(String(incident.status || '').toLowerCase())).length;
    const usersUnderAttack = numberValue(summary.usersUnderAttack, Array.isArray(summary.usersUnderAttack) ? summary.usersUnderAttack.length : 0);
    const recommendations = Array.isArray(inputRecommendations) && inputRecommendations.length
        ? inputRecommendations
        : buildSecurityRecommendations({
            highSeverityAlerts: numberValue(summary.highSeverityAlerts, highSeverityAlerts),
            usersUnderAttack,
            activeIncidents: numberValue(summary.activeIncidents, activeIncidents),
            threatIndicators: numberValue(summary.threatIndicators, threats.length)
        });
    const dashboardMetrics = {
        totalAlerts: numberValue(summary.totalAlerts, alerts.length),
        highSeverityAlerts: numberValue(summary.highSeverityAlerts, highSeverityAlerts),
        activeIncidents: numberValue(summary.activeIncidents, activeIncidents),
        threatIndicators: numberValue(summary.threatIndicators, threats.length),
        usersUnderAttack,
        securityScore: numberValue(summary.securityScore),
        suspiciousSignIns: numberValue(summary.suspiciousSignIns, suspiciousSignIns.length),
        recommendationsCount: recommendations.length
    };
    return { alerts, incidents, threats, suspiciousSignIns, recommendations, dashboardMetrics };
}

module.exports = {
    buildSecurityDashboardSource,
    buildSecurityRecommendations
};
