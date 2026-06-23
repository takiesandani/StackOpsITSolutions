function numberValue(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function calculateNetworkSecurityScore(overview = {}, sectionValues = []) {
    let networkSecurityScore = 54;
    if (numberValue(overview.protectedApps) > 0) networkSecurityScore += 10;
    if (numberValue(overview.enrolledDevices) > 0) networkSecurityScore += 10;
    if (numberValue(overview.activeGatewayPolicies) > 0) networkSecurityScore += 10;
    if (/azure/i.test(String(overview.identityProvider || ''))) networkSecurityScore += 7;
    if (overview.gatewayProxyEnabled) networkSecurityScore += 5;
    if (numberValue(overview.dlpProfiles) > 0) networkSecurityScore += 4;
    const sectionErrors = sectionValues.filter(section => section?.status === 'error').length;
    const permissionGaps = sectionValues.filter(section => section?.status === 'permission_unavailable').length;
    networkSecurityScore -= sectionErrors * 4;
    networkSecurityScore -= permissionGaps * 2;
    return Math.min(100, Math.max(0, networkSecurityScore));
}

function buildNetworkDashboardSource({
    overview = {},
    accessLogs = [],
    sections = {},
    apps = [],
    devices = [],
    gatewayRules = [],
    dlpProfiles = [],
    warpProfiles = [],
    virtualNetworks = []
} = {}) {
    const sectionValues = Object.values(sections || {});
    const deniedAccessEvents = accessLogs.filter(event => /block|deny|fail/i.test(String(event.action || event.status || ''))).length;
    const networkSecurityScore = calculateNetworkSecurityScore(overview, sectionValues);
    const dashboardMetrics = {
        ...overview,
        deniedAccessEvents,
        sectionErrors: sectionValues.filter(section => section?.status === 'error').length,
        permissionGaps: sectionValues.filter(section => section?.status === 'permission_unavailable').length,
        accessLogCount: accessLogs.length,
        networkSecurityScore,
        protectedApps: numberValue(overview.protectedApps, apps.length),
        enrolledDevices: numberValue(overview.enrolledDevices, devices.length),
        gatewayPolicies: numberValue(overview.gatewayPolicies, gatewayRules.length),
        activeGatewayPolicies: numberValue(overview.activeGatewayPolicies, gatewayRules.filter(rule => rule.enabled !== false).length),
        recentAccessEvents: numberValue(overview.recentAccessEvents, accessLogs.length),
        dlpProfiles: numberValue(overview.dlpProfiles, dlpProfiles.length),
        warpProfiles: numberValue(overview.warpProfiles, warpProfiles.length),
        virtualNetworks: numberValue(overview.virtualNetworks, virtualNetworks.length)
    };

    return {
        dashboardMetrics,
        serviceCoverage: {
            applications: apps.length,
            devices: devices.length,
            gatewayRules: gatewayRules.length,
            dlpProfiles: dlpProfiles.length,
            warpProfiles: warpProfiles.length,
            virtualNetworks: virtualNetworks.length
        },
        accessActivity: {
            total: accessLogs.length,
            denied: deniedAccessEvents
        }
    };
}

module.exports = {
    buildNetworkDashboardSource,
    calculateNetworkSecurityScore
};
