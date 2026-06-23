const { asArray, asObject, buildContext, numberFrom, payloadFromSource } = require('./common');

function buildCloudflareDashboardContext(source) {
    const payload = payloadFromSource(source);
    const storedMetrics = source.dashboardMetrics || source.dashboardSourceMetrics || {};
    const overview = Object.keys(asObject(storedMetrics)).length
        ? asObject(storedMetrics)
        : Object.keys(asObject(payload.overview)).length
        ? asObject(payload.overview)
        : asObject(source.metrics);
    const accessLogs = asArray(payload.accessLogs);
    const deniedAccessEvents = accessLogs.filter(event => /block|deny|fail/i.test(String(event.action || event.status || ''))).length;
    const sections = asObject(payload.sections);
    const sectionValues = Object.values(sections);
    const sectionErrors = sectionValues.filter(section => section?.status === 'error');
    const permissionGaps = sectionValues.filter(section => section?.status === 'permission_unavailable');
    let networkSecurityScore = 54;
    if (numberFrom(overview, ['protectedApps']) > 0) networkSecurityScore += 10;
    if (numberFrom(overview, ['enrolledDevices']) > 0) networkSecurityScore += 10;
    if (numberFrom(overview, ['activeGatewayPolicies']) > 0) networkSecurityScore += 10;
    if (/azure/i.test(String(overview.identityProvider || ''))) networkSecurityScore += 7;
    if (overview.gatewayProxyEnabled) networkSecurityScore += 5;
    if (numberFrom(overview, ['dlpProfiles']) > 0) networkSecurityScore += 4;
    networkSecurityScore = Math.min(100, networkSecurityScore);

    const partialWarnings = [
        ...sectionErrors.map(section => `Cloudflare section failed: ${section.label || section.key || 'unknown section'}.`),
        ...permissionGaps.map(section => `Cloudflare permission is unavailable for ${section.label || section.key || 'a section'}.`)
    ];

    return buildContext(source, {
        dashboardMetrics: {
            ...overview,
            deniedAccessEvents,
            sectionErrors: sectionErrors.length,
            permissionGaps: permissionGaps.length,
            accessLogCount: accessLogs.length
        },
        calculatedIndicators: {
            networkSecurityScore,
            cloudflareConfigured: source.status === 'available' || source.status === 'stale',
            cloudflarePartial: sectionErrors.length > 0 || permissionGaps.length > 0,
            networkReviewRequired: deniedAccessEvents > 0 || sectionErrors.length > 0
        },
        evidenceLists: {
            applications: asArray(payload.apps),
            devices: asArray(payload.devices),
            deviceRegistrations: asArray(payload.deviceRegistrations),
            accessPolicies: asArray(payload.policies),
            gatewayRules: asArray(payload.gatewayRules),
            accessLogs,
            dlpProfiles: asArray(payload.dlpProfiles),
            warpProfiles: asArray(payload.warpProfiles),
            virtualNetworks: asArray(payload.virtualNetworks),
            sectionStatus: sectionValues
        },
        chartsData: {
            serviceCoverage: {
                applications: asArray(payload.apps).length,
                devices: asArray(payload.devices).length,
                gatewayRules: asArray(payload.gatewayRules).length,
                dlpProfiles: asArray(payload.dlpProfiles).length,
                warpProfiles: asArray(payload.warpProfiles).length,
                virtualNetworks: asArray(payload.virtualNetworks).length
            },
            accessActivity: { total: accessLogs.length, denied: deniedAccessEvents }
        },
        warnings: partialWarnings
    });
}

module.exports = buildCloudflareDashboardContext;
