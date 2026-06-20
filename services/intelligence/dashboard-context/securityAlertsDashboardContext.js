const { asArray, buildContext, numberFrom, payloadFromSource } = require('./common');

function buildSecurityAlertsDashboardContext(source) {
    const payload = payloadFromSource(source);
    const summary = payload.summary || source.metrics || {};
    const alerts = asArray(payload.alerts);
    const incidents = asArray(payload.incidents);
    const suspiciousSignIns = asArray(payload.signIns?.suspicious);
    const highSeverityAlerts = alerts.filter(alert => ['critical', 'high'].includes(String(alert.severity || '').toLowerCase()));
    const activeIncidents = incidents.filter(incident => ['active', 'inprogress', 'newalert'].includes(String(incident.status || '').toLowerCase()));
    const criticalAlerts = alerts.filter(alert => String(alert.severity || '').toLowerCase() === 'critical');

    return buildContext(source, {
        dashboardMetrics: {
            totalAlerts: numberFrom(summary, ['totalAlerts'], alerts.length),
            highSeverityAlerts: numberFrom(summary, ['highSeverityAlerts'], highSeverityAlerts.length),
            criticalAlerts: criticalAlerts.length,
            activeIncidents: numberFrom(summary, ['activeIncidents'], activeIncidents.length),
            suspiciousSignIns: suspiciousSignIns.length,
            threatIndicators: numberFrom(summary, ['threatIndicators'], asArray(payload.threats).length),
            usersUnderAttack: numberFrom(summary, ['usersUnderAttack'], asArray(payload.signIns?.usersUnderAttack).length),
            securityScore: numberFrom(summary, ['securityScore'])
        },
        calculatedIndicators: {
            highRiskSignalCount: highSeverityAlerts.length + activeIncidents.length + suspiciousSignIns.length,
            incidentResponseRequired: activeIncidents.length > 0,
            attackTechniqueCount: asArray(payload.mitre).length,
            attackRegionCount: asArray(payload.regionDistribution).length
        },
        evidenceLists: {
            allAlerts: alerts,
            highSeverityAlerts,
            activeIncidents,
            suspiciousSignIns,
            threats: asArray(payload.threats),
            usersUnderAttack: asArray(payload.signIns?.usersUnderAttack),
            mitreTechniques: asArray(payload.mitre),
            attackRegions: asArray(payload.regionDistribution),
            topTargetedUsers: asArray(payload.topTargetedUsers),
            attackTimeline: asArray(payload.attackTimeline)
        },
        chartsData: {
            sourceDistribution: asArray(payload.sourceDistribution),
            categoryDistribution: asArray(payload.categoryDistribution),
            regionDistribution: asArray(payload.regionDistribution),
            mitre: asArray(payload.mitre),
            attackTimeline: asArray(payload.attackTimeline)
        }
    });
}

module.exports = buildSecurityAlertsDashboardContext;
