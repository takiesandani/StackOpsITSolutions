const { asArray, buildContext, numberFrom, payloadFromSource } = require('./common');

function buildEmailSecurityDashboardContext(source) {
    const payload = payloadFromSource(source);
    const summary = payload.summary || source.metrics || {};
    const alerts = asArray(payload.alerts);
    const incidents = asArray(payload.incidents);
    const highSeverityAlerts = alerts.filter(alert => ['critical', 'high'].includes(String(alert.severity || '').toLowerCase()));
    const activeIncidents = incidents.filter(incident => ['active', 'inprogress', 'newalert'].includes(String(incident.status || '').toLowerCase()));
    const phishingAlerts = alerts.filter(alert => /phish/i.test(String(alert.category || alert.title || '')));
    const malwareAlerts = alerts.filter(alert => /malware|virus|ransom/i.test(String(alert.category || alert.title || '')));

    return buildContext(source, {
        dashboardMetrics: {
            activeThreats: numberFrom(summary, ['activeThreats', 'ActiveThreats'], alerts.length),
            highSeverityAlerts: numberFrom(summary, ['highSeverityAlerts', 'HighSeverity'], highSeverityAlerts.length),
            affectedUsers: numberFrom(summary, ['affectedUsersCount', 'usersTargeted', 'UsersTargeted']),
            activeIncidents: numberFrom(summary, ['activeIncidents', 'OpenIncidents'], activeIncidents.length),
            phishingAlerts: phishingAlerts.length,
            malwareAlerts: malwareAlerts.length
        },
        calculatedIndicators: {
            emailThreatExposure: highSeverityAlerts.length + activeIncidents.length,
            emailResponseRequired: highSeverityAlerts.length > 0 || activeIncidents.length > 0
        },
        evidenceLists: {
            allAlerts: alerts,
            highSeverityAlerts,
            activeIncidents,
            phishingAlerts,
            malwareAlerts,
            affectedUsers: asArray(payload.affectedUsers),
            recommendations: asArray(payload.recommendations)
        },
        chartsData: {
            categoryDistribution: payload.categoryDistribution || {},
            severityDistribution: payload.severityDistribution || {},
            timeline: asArray(payload.timeline || payload.activityFeed)
        }
    });
}

module.exports = buildEmailSecurityDashboardContext;
