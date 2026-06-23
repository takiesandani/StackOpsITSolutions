const { asArray, buildContext, numberFrom, payloadFromSource } = require('./common');

function normalizeApp(app) {
    const assignedGroups = Array.isArray(app.assignedGroups) ? app.assignedGroups.filter(Boolean) : [];
    const explicitType = String(app.type || '').toLowerCase();
    const publisherName = String(app.publisherName || '').toLowerCase();
    const isExternal = explicitType ? explicitType === 'external' : Boolean(app.isExternal || (publisherName && !publisherName.includes('microsoft')));
    return { ...app, assignedGroups, isExternal, scopeCount: Number(app.scopeCount || 0), roleCount: Number(app.roleCount || 0), userCount: Number(app.userCount || 0) };
}

function buildApplicationsDashboardContext(source) {
    const payload = payloadFromSource(source);
    const storedMetrics = source.dashboardMetrics || source.dashboardSourceMetrics || {};
    const summary = { ...(payload.summary || {}), ...storedMetrics };
    const apps = asArray(payload.applications).map(normalizeApp);
    const externalApps = apps.filter(app => app.isExternal);
    const highAccessApps = apps.filter(app => app.userCount >= 20 || app.assignedGroups.length >= 3);
    const excessivePermissionApps = apps.filter(app => app.scopeCount + app.roleCount > 10);
    const highRiskApps = apps.filter(app => app.isExternal || app.scopeCount + app.roleCount > 10 || app.userCount > 50);
    const totalApplications = apps.length || numberFrom(summary, ['totalApplications', 'TotalApps']);
    const governanceScore = numberFrom(summary, ['applicationGovernanceScore'], 100);

    return buildContext(source, {
        dashboardMetrics: {
            totalApplications,
            externalApplications: apps.length ? externalApps.length : numberFrom(summary, ['externalApplications', 'ExternalApps']),
            highRiskApps: apps.length ? highRiskApps.length : numberFrom(summary, ['highRiskApps', 'HighRiskApps']),
            highAccessApps: apps.length ? highAccessApps.length : numberFrom(summary, ['highAccessApps', 'HighAccessApps']),
            excessivePermissionApps: apps.length ? excessivePermissionApps.length : numberFrom(summary, ['excessivePermissionApps']),
            groupAssignedApps: apps.filter(app => app.assignedGroups.length).length || numberFrom(summary, ['groupAssignedApps']),
            applicationGovernanceScore: governanceScore,
            userCount: numberFrom(summary, ['userCount']),
            groupCount: numberFrom(summary, ['groupCount']),
            recommendationsCount: numberFrom(summary, ['recommendationsCount'], asArray(payload.recommendations).length)
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
