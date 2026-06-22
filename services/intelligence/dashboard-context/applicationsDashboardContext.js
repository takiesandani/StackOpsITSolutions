const { asArray, buildContext, numberFrom, payloadFromSource } = require('./common');

function normalizeApp(app) {
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
        scopeCount: Number(app.scopeCount || app.scopes || 0),
        roleCount: Number(app.roleCount || app.roles || 0),
        userCount: Number(app.userCount || app.users || app.assignmentCount || 0)
    };
}

function buildApplicationsDashboardContext(source) {
    const payload = payloadFromSource(source);
    const apps = asArray(payload.applications).map(normalizeApp);
    const summary = payload.summary || source.metrics || {};
    const externalApps = apps.filter(app => app.isExternal);
    const highAccessApps = apps.filter(app => app.userCount >= 20 || app.assignedGroups.length >= 3);
    const excessivePermissionApps = apps.filter(app => app.scopeCount + app.roleCount > 10);
    const highRiskApps = apps.filter(app => app.isExternal || app.scopeCount + app.roleCount > 10 || app.userCount > 50);
    const totalApplications = apps.length || numberFrom(summary, ['totalApplications', 'TotalApps', 'totalApps']);
    const externalApplicationCount = apps.length ? externalApps.length : numberFrom(summary, ['externalApplications', 'ExternalApps', 'externalApps']);
    const highRiskApplicationCount = apps.length ? highRiskApps.length : numberFrom(summary, ['highRiskApps', 'HighRiskApps']);
    const highAccessApplicationCount = apps.length ? highAccessApps.length : numberFrom(summary, ['highAccessApps', 'HighAccessApps']);
    const excessivePermissionCount = apps.length
        ? excessivePermissionApps.length
        : numberFrom(summary, ['excessivePermissionApps', 'broadPermissionApps', 'HighAccessApps']);
    const riskyPublisherCount = numberFrom(summary, ['riskyPublisherApps', 'riskyPublishers']);
    const unreviewedPermissionCount = numberFrom(summary, ['unreviewedPermissionApps', 'unreviewedPermissions']);
    const shadowITCount = numberFrom(summary, ['shadowITApps', 'shadowITIndicators']);
    const governanceScore = totalApplications ? Math.max(0, Math.round(100 - (
        (externalApplicationCount / totalApplications * 10) +
        (highRiskApplicationCount / totalApplications * 30) +
        (excessivePermissionCount / totalApplications * 25) +
        (riskyPublisherCount / totalApplications * 15) +
        (unreviewedPermissionCount / totalApplications * 10) +
        (shadowITCount / totalApplications * 10)
    ))) : 100;

    return buildContext(source, {
        dashboardMetrics: {
            totalApplications,
            externalApplications: externalApplicationCount,
            highRiskApps: highRiskApplicationCount,
            highAccessApps: highAccessApplicationCount,
            excessivePermissionApps: excessivePermissionCount,
            riskyPublisherApps: riskyPublisherCount,
            unreviewedPermissionApps: unreviewedPermissionCount,
            shadowITApps: shadowITCount,
            groupAssignedApps: apps.filter(app => app.assignedGroups.length).length
        },
        calculatedIndicators: {
            applicationGovernanceScore: governanceScore,
            applicationReviewRequired: highRiskApps.length > 0 || excessivePermissionApps.length > 0
        },
        evidenceLists: {
            allApplications: apps,
            externalApps,
            highRiskApps,
            highAccessApps,
            excessivePermissionApps,
            groupAssignedApps: apps.filter(app => app.assignedGroups.length)
        },
        chartsData: {
            permissionBuckets: apps.reduce((buckets, app) => {
                const permissions = app.scopeCount + app.roleCount;
                if (permissions > 10) buckets.high += 1;
                else if (permissions >= 4) buckets.medium += 1;
                else buckets.low += 1;
                return buckets;
            }, { low: 0, medium: 0, high: 0 }),
            publisherTypes: { external: externalApps.length, microsoft: Math.max(0, apps.length - externalApps.length) }
        }
    });
}

module.exports = buildApplicationsDashboardContext;
