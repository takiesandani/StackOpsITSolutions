function numberValue(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function normalizeApp(app = {}) {
    const assignedGroups = Array.isArray(app.assignedGroups)
        ? app.assignedGroups.filter(Boolean)
        : String(app.assignedGroups || '').split(',').map(value => value.trim()).filter(Boolean);
    const explicitType = String(app.type || '').toLowerCase();
    const publisherName = String(app.publisherName || '').toLowerCase();
    const isExternal = explicitType ? explicitType === 'external' : Boolean(app.isExternal || (publisherName && !publisherName.includes('microsoft')));
    return {
        ...app,
        assignedGroups,
        isExternal,
        scopeCount: numberValue(app.scopeCount ?? app.scopes),
        roleCount: numberValue(app.roleCount ?? app.roles),
        userCount: numberValue(app.userCount ?? app.users ?? app.assignmentCount)
    };
}

function calculateAppRisk(app) {
    const permissions = (app.scopeCount || 0) + (app.roleCount || 0);
    if (app.isExternal && (permissions > 10 || (app.userCount || 0) > 50)) return 'high';
    if (app.isExternal || permissions > 10 || (app.userCount || 0) >= 20) return 'medium';
    return 'safe';
}

function calculateApplicationsGovernanceScore(apps = []) {
    if (!apps.length) return 100;
    const total = apps.length;
    const externalApps = apps.filter(app => app.isExternal).length;
    const highRiskApps = apps.filter(app => calculateAppRisk(app) === 'high').length;
    const excessivePermissionApps = apps.filter(app => (app.scopeCount + app.roleCount) > 10).length;
    const highAccessApps = apps.filter(app => (app.userCount || 0) >= 20 || (app.assignedGroups || []).length >= 3).length;
    return Math.max(0, Math.round(100 - (
        (externalApps / total * 10) +
        (highRiskApps / total * 30) +
        (excessivePermissionApps / total * 25) +
        (highAccessApps / total * 15)
    )));
}

function buildApplicationsRecommendations(apps, governanceScore) {
    const externalApps = apps.filter(app => app.isExternal);
    const highRiskApps = apps.filter(app => calculateAppRisk(app) === 'high');
    const recs = [];
    if (highRiskApps.length) recs.push({ priority: 'critical', title: 'Review high-risk applications', detail: `${highRiskApps.length} application(s) require governance review.` });
    if (externalApps.length) recs.push({ priority: 'high', title: 'Validate external publishers', detail: `${externalApps.length} non-Microsoft application(s) are registered.` });
    if (governanceScore < 70) recs.push({ priority: 'medium', title: 'Improve application governance score', detail: `Current governance score is ${governanceScore}%.` });
    if (!recs.length) recs.push({ priority: 'low', title: 'Maintain application inventory baseline', detail: 'No urgent application governance recommendations from current evidence.' });
    return recs;
}

function buildApplicationsDashboardSource({ applicationsRows = [], summary = {}, userCount = 0, groupCount = 0 } = {}) {
    const apps = applicationsRows.map(normalizeApp);
    const externalApps = apps.filter(app => app.isExternal);
    const highRiskApps = apps.filter(app => calculateAppRisk(app) === 'high');
    const highAccessApps = apps.filter(app => (app.userCount || 0) >= 20 || (app.assignedGroups || []).length >= 3);
    const excessivePermissionApps = apps.filter(app => (app.scopeCount + app.roleCount) > 10);
    const groupAssignedApps = apps.filter(app => (app.assignedGroups || []).length > 0);
    const governanceScore = calculateApplicationsGovernanceScore(apps);
    const recommendations = buildApplicationsRecommendations(apps, governanceScore);
    const dashboardMetrics = {
        totalApplications: apps.length || numberValue(summary.totalApplications),
        externalApplications: apps.length ? externalApps.length : numberValue(summary.externalApplications),
        highRiskApps: apps.length ? highRiskApps.length : numberValue(summary.highRiskApps),
        highAccessApps: apps.length ? highAccessApps.length : numberValue(summary.highAccessApps),
        excessivePermissionApps: apps.length ? excessivePermissionApps.length : numberValue(summary.excessivePermissionApps),
        groupAssignedApps: groupAssignedApps.length,
        applicationGovernanceScore: governanceScore,
        userCount: numberValue(summary.userCount, userCount),
        groupCount: numberValue(summary.groupCount, groupCount),
        recommendationsCount: recommendations.length
    };
    return { apps, recommendations, dashboardMetrics };
}

module.exports = {
    buildApplicationsDashboardSource,
    normalizeApp,
    calculateAppRisk,
    calculateApplicationsGovernanceScore
};
