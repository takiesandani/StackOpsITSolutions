const { asArray, buildContext, numberFrom, payloadFromSource } = require('./common');

function buildEmailSecurityDashboardContext(source) {
    const payload = payloadFromSource(source);
    const storedMetrics = source.dashboardMetrics || source.dashboardSourceMetrics || {};
    const summary = { ...(payload.summary || {}), ...storedMetrics };
    const alerts = Array.isArray(payload.alerts)
        ? payload.alerts
        : Array.isArray(payload.alerts?.alerts) ? payload.alerts.alerts : [];
    const incidents = asArray(payload.incidents);
    const highSeverityAlerts = alerts.filter(alert => ['critical', 'high'].includes(String(alert.severity || '').toLowerCase()));
    const activeIncidents = incidents.filter(incident => ['active', 'inprogress', 'newalert'].includes(String(incident.status || '').toLowerCase()));
    const phishingAlerts = alerts.filter(alert => /phish/i.test(String(alert.category || alert.title || '')));
    const malwareAlerts = alerts.filter(alert => /malware|virus|ransom/i.test(String(alert.category || alert.title || '')));

    return buildContext(source, {
        dashboardMetrics: {
            activeThreats: numberFrom(summary, ['activeThreats', 'ActiveThreats'], alerts.filter(a => ['newalert', 'inprogress'].includes(String(a.status || '').toLowerCase())).length),
            highSeverityAlerts: numberFrom(summary, ['highSeverityAlerts', 'HighSeverity'], highSeverityAlerts.length),
            affectedUsersCount: numberFrom(summary, ['affectedUsersCount', 'usersTargeted', 'UsersTargeted']),
            activeIncidents: numberFrom(summary, ['activeIncidents', 'OpenIncidents'], activeIncidents.length),
            securityScore: numberFrom(summary, ['securityScore']),
            threatResolutionRate: numberFrom(summary, ['threatResolutionRate']),
            phishingCount: numberFrom(summary, ['phishingCount'], phishingAlerts.length),
            malwareCount: numberFrom(summary, ['malwareCount'], malwareAlerts.length),
            spamCount: numberFrom(summary, ['spamCount']),
            becCount: numberFrom(summary, ['becCount']),
            activeMailboxes: numberFrom(summary, ['activeMailboxes']),
            totalMailActivity: numberFrom(summary, ['totalMailActivity']),
            sendCount: numberFrom(summary, ['sendCount']),
            receiveCount: numberFrom(summary, ['receiveCount']),
            readCount: numberFrom(summary, ['readCount']),
            recommendationsCount: numberFrom(summary, ['recommendationsCount'], asArray(payload.recommendations).length),
            threatTypeDistribution: summary.threatTypeDistribution || payload.threats?.byType || {},
            severityDistribution: summary.severityDistribution || payload.threats?.bySeverity || {},
            mostTargetedUsers: asArray(summary.mostTargetedUsers || payload.affectedUsers?.mostTargeted)
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
            mailActivityUsers: asArray(payload.mailActivity?.users),
            recommendations: asArray(payload.recommendations)
        },
        chartsData: {
            categoryDistribution: summary.threatTypeDistribution || payload.categoryDistribution || payload.threats?.byType || {},
            severityDistribution: summary.severityDistribution || payload.severityDistribution || payload.threats?.bySeverity || {},
            timeline: asArray(payload.timeline || payload.activityFeed)
        }
    });
}

module.exports = buildEmailSecurityDashboardContext;
