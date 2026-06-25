function numberValue(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function getEmailThreatType(alert = {}) {
    const text = `${alert.title || ''} ${alert.description || ''} ${alert.category || ''}`.toLowerCase();
    if (/business email|bec|impersonation|spoof/.test(text)) return text.includes('spoof') ? 'spoofing' : 'bec';
    if (text.includes('phish')) return 'phishing';
    if (text.includes('malware') || text.includes('attachment') || text.includes('ransomware')) return 'malware';
    if (text.includes('spam')) return 'spam';
    return 'other';
}

function getEmailThreatLabel(alert = {}) {
    return {
        phishing: 'Phishing',
        malware: 'Malware',
        spam: 'Spam',
        bec: 'BEC',
        spoofing: 'Spoofing',
        other: 'Other'
    }[getEmailThreatType(alert)] || 'Other';
}

function normalizeEmailAlertsPayload(alerts) {
    if (Array.isArray(alerts)) return alerts;
    if (Array.isArray(alerts?.alerts)) return alerts.alerts;
    return [];
}

function buildEmailThreatBreakdown(alerts = []) {
    alerts = normalizeEmailAlertsPayload(alerts);
    const byType = {};
    const bySeverity = { high: 0, medium: 0, low: 0 };
    alerts.forEach(alert => {
        const label = getEmailThreatLabel(alert);
        byType[label] = (byType[label] || 0) + 1;
        const severity = String(alert.severity || 'low').toLowerCase();
        if (severity === 'critical' || severity === 'high') bySeverity.high += 1;
        else if (severity === 'medium') bySeverity.medium += 1;
        else bySeverity.low += 1;
    });
    return { byType, bySeverity };
}

function calculateEmailResolutionRate(alerts = []) {
    alerts = normalizeEmailAlertsPayload(alerts);
    if (!alerts.length) return 100;
    const resolved = alerts.filter(alert => /resolved|dismissed|closed/i.test(String(alert.status || ''))).length;
    return Math.round((resolved / alerts.length) * 100);
}

function calculateEmailSecurityScore(alerts = [], summaryScore) {
    alerts = normalizeEmailAlertsPayload(alerts);
    if (summaryScore != null && Number.isFinite(Number(summaryScore))) return Number(summaryScore);
    let score = 100;
    alerts.slice(0, 30).forEach(alert => {
        const severity = String(alert.severity || 'low').toLowerCase();
        score -= severity === 'critical' ? 18 : severity === 'high' ? 12 : severity === 'medium' ? 5 : 2;
    });
    return Math.max(0, Math.min(100, score));
}

function buildEmailRecommendations({ alerts = [], incidents = [], mailSummary = {}, affectedUsersCount = 0 } = {}) {
    alerts = normalizeEmailAlertsPayload(alerts);
    const highSeverityAlerts = alerts.filter(alert => ['critical', 'high'].includes(String(alert.severity || '').toLowerCase()));
    const phishingAlerts = alerts.filter(alert => getEmailThreatType(alert) === 'phishing');
    const malwareAlerts = alerts.filter(alert => getEmailThreatType(alert) === 'malware');
    const recs = [];
    if (highSeverityAlerts.length) {
        recs.push({ priority: 'critical', title: 'Review high severity email threats', detail: `${highSeverityAlerts.length} high severity alert(s) need investigation.` });
    }
    if (phishingAlerts.length) {
        recs.push({ priority: 'high', title: 'Strengthen phishing protection', detail: 'Review Safe Links, anti-phishing policy, and targeted user training.' });
    }
    if (malwareAlerts.length) {
        recs.push({ priority: 'high', title: 'Validate Safe Attachments coverage', detail: `${malwareAlerts.length} malware-related email alert(s) detected.` });
    }
    if (affectedUsersCount > 5) {
        recs.push({ priority: 'medium', title: 'Prioritize targeted mailbox review', detail: `${affectedUsersCount} users are represented in threat evidence.` });
    }
    if ((mailSummary.activeMailboxes || 0) > 0) {
        recs.push({
            priority: 'low',
            title: 'Review mailbox activity baseline',
            detail: `${mailSummary.activeMailboxes} active mailbox(es), ${mailSummary.totalMailActivity || 0} mail activity event(s) in the latest Exchange report.`
        });
    }
    if (!recs.length) {
        recs.push({ priority: 'low', title: 'Maintain monitoring baseline', detail: 'No urgent email-security recommendations from current evidence.' });
    }
    return recs;
}

function buildEmailDashboardSource({
    alertsRows = [],
    incidentsRows = [],
    mailActivity = {},
    summary = {},
    threats = null,
    affectedUsers = {}
} = {}) {
    const alerts = normalizeEmailAlertsPayload(alertsRows);
    const incidents = Array.isArray(incidentsRows) ? incidentsRows : [];
    const mailUsers = Array.isArray(mailActivity.users) ? mailActivity.users : [];
    const mailSummary = mailActivity.summary || summary.mailActivity || {};
    const threatBreakdown = threats || buildEmailThreatBreakdown(alerts);
    const activeThreats = numberValue(summary.activeThreats, alerts.filter(alert => ['newalert', 'inprogress'].includes(String(alert.status || '').toLowerCase())).length);
    const highSeverityAlerts = numberValue(
        summary.highSeverityAlerts,
        alerts.filter(alert => ['critical', 'high'].includes(String(alert.severity || '').toLowerCase())).length
    );
    const activeIncidents = numberValue(
        summary.activeIncidents,
        incidents.filter(incident => ['active', 'inprogress'].includes(String(incident.status || '').toLowerCase())).length
    );
    const affectedUsersCount = numberValue(
        summary.affectedUsersCount,
        Array.isArray(affectedUsers.all) ? affectedUsers.all.length : 0
    );
    const threatResolutionRate = numberValue(summary.threatResolutionRate, calculateEmailResolutionRate(alerts));
    const securityScore = calculateEmailSecurityScore(alerts, summary.securityScore);
    const phishingCount = alerts.filter(alert => getEmailThreatType(alert) === 'phishing').length;
    const malwareCount = alerts.filter(alert => getEmailThreatType(alert) === 'malware').length;
    const spamCount = alerts.filter(alert => getEmailThreatType(alert) === 'spam').length;
    const becCount = alerts.filter(alert => getEmailThreatType(alert) === 'bec').length;
    const recommendations = buildEmailRecommendations({
        alerts,
        incidents,
        mailSummary,
        affectedUsersCount
    });
    const mostTargetedUsers = Array.isArray(affectedUsers.mostTargeted)
        ? affectedUsers.mostTargeted
        : Object.entries(
            alerts.reduce((counts, alert) => {
                (alert.userStates || []).forEach(user => {
                    const name = user.accountName || user.userPrincipalName;
                    if (!name) return;
                    counts[name] = (counts[name] || 0) + 1;
                });
                return counts;
            }, {})
        )
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([user, threatCount]) => ({ user, threatCount }));

    const dashboardMetrics = {
        activeThreats,
        highSeverityAlerts,
        affectedUsersCount,
        activeIncidents,
        securityScore,
        threatResolutionRate,
        phishingCount,
        malwareCount,
        spamCount,
        becCount,
        activeMailboxes: numberValue(mailSummary.activeMailboxes, mailUsers.filter(user => user.lastActivityDate).length),
        totalMailActivity: numberValue(mailSummary.totalMailActivity, numberValue(mailSummary.sendCount) + numberValue(mailSummary.receiveCount) + numberValue(mailSummary.readCount)),
        sendCount: numberValue(mailSummary.sendCount),
        receiveCount: numberValue(mailSummary.receiveCount),
        readCount: numberValue(mailSummary.readCount),
        recommendationsCount: recommendations.length,
        threatTypeDistribution: threatBreakdown.byType,
        severityDistribution: threatBreakdown.bySeverity,
        mostTargetedUsers
    };

    return {
        alerts,
        incidents,
        mailUsers,
        recommendations,
        dashboardMetrics,
        threatBreakdown
    };
}

module.exports = {
    buildEmailDashboardSource,
    buildEmailThreatBreakdown,
    buildEmailRecommendations,
    calculateEmailResolutionRate,
    calculateEmailSecurityScore,
    getEmailThreatType,
    getEmailThreatLabel,
    normalizeEmailAlertsPayload
};
