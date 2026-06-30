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
    deviceRegistrations = [],
    devicePosture = [],
    gatewayRules = [],
    accessPolicies = [],
    dlpProfiles = [],
    warpProfiles = [],
    virtualNetworks = [],
    gatewayAppTypes = [],
    permissionMatrix = [],
    auditLogs = [],
    accountLogs = [],
    securityInsights = [],
    applicationSecurityReports = [],
    apiGatewayOperations = [],
    casbFindings = [],
    tunnels = [],
    cloudforceRequests = [],
    intelFeeds = [],
    dnsFirewallRules = [],
    loadBalancerPools = [],
    loadBalancerMonitors = [],
    magicWanSites = [],
    magicWanRoutes = [],
    mtlsCertificates = [],
    accessGroups = [],
    accessOrganizations = [],
    accessCertificates = [],
    warpConnectors = [],
    teamnetRoutes = [],
    teamsDexTests = []
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
        virtualNetworks: numberValue(overview.virtualNetworks, virtualNetworks.length),
        registeredWarpDevices: numberValue(overview.registeredWarpDevices, deviceRegistrations.length),
        devicePostureChecks: numberValue(overview.devicePostureChecks, devicePosture.length),
        accessPolicies: numberValue(overview.accessPolicies, accessPolicies.length),
        appCategories: numberValue(overview.appCategories, gatewayAppTypes.length),
        endpointFamilies: numberValue(overview.endpointFamilies, permissionMatrix.length),
        auditLogs: numberValue(overview.auditLogs, auditLogs.length),
        accountLogs: numberValue(overview.accountLogs, accountLogs.length),
        securityInsights: numberValue(overview.securityInsights, securityInsights.length),
        applicationSecurityReports: numberValue(overview.applicationSecurityReports, applicationSecurityReports.length),
        apiGatewayOperations: numberValue(overview.apiGatewayOperations, apiGatewayOperations.length),
        casbFindings: numberValue(overview.casbFindings, casbFindings.length),
        tunnels: numberValue(overview.tunnels, tunnels.length),
        cloudforceRequests: numberValue(overview.cloudforceRequests, cloudforceRequests.length),
        intelFeeds: numberValue(overview.intelFeeds, intelFeeds.length),
        dnsFirewallRules: numberValue(overview.dnsFirewallRules, dnsFirewallRules.length),
        loadBalancerPools: numberValue(overview.loadBalancerPools, loadBalancerPools.length),
        loadBalancerMonitors: numberValue(overview.loadBalancerMonitors, loadBalancerMonitors.length),
        magicWanSites: numberValue(overview.magicWanSites, magicWanSites.length),
        magicWanRoutes: numberValue(overview.magicWanRoutes, magicWanRoutes.length),
        mtlsCertificates: numberValue(overview.mtlsCertificates, mtlsCertificates.length),
        accessGroups: numberValue(overview.accessGroups, accessGroups.length),
        accessOrganizations: numberValue(overview.accessOrganizations, accessOrganizations.length),
        accessCertificates: numberValue(overview.accessCertificates, accessCertificates.length),
        warpConnectors: numberValue(overview.warpConnectors, warpConnectors.length),
        teamnetRoutes: numberValue(overview.teamnetRoutes, teamnetRoutes.length),
        teamsDexTests: numberValue(overview.teamsDexTests, teamsDexTests.length)
    };

    return {
        dashboardMetrics,
        serviceCoverage: {
            applications: apps.length,
            devices: devices.length,
            deviceRegistrations: deviceRegistrations.length,
            devicePosture: devicePosture.length,
            gatewayRules: gatewayRules.length,
            accessPolicies: accessPolicies.length,
            dlpProfiles: dlpProfiles.length,
            warpProfiles: warpProfiles.length,
            virtualNetworks: virtualNetworks.length,
            gatewayAppTypes: gatewayAppTypes.length,
            permissionMatrix: permissionMatrix.length,
            auditLogs: auditLogs.length,
            accountLogs: accountLogs.length,
            securityInsights: securityInsights.length,
            applicationSecurityReports: applicationSecurityReports.length,
            apiGatewayOperations: apiGatewayOperations.length,
            casbFindings: casbFindings.length,
            tunnels: tunnels.length,
            cloudforceRequests: cloudforceRequests.length,
            intelFeeds: intelFeeds.length,
            dnsFirewallRules: dnsFirewallRules.length,
            loadBalancers: loadBalancerPools.length + loadBalancerMonitors.length,
            magicWan: magicWanSites.length + magicWanRoutes.length,
            certificates: mtlsCertificates.length + accessCertificates.length,
            accessGroups: accessGroups.length,
            accessOrganizations: accessOrganizations.length,
            warpConnectors: warpConnectors.length,
            teamnetRoutes: teamnetRoutes.length,
            teamsDexTests: teamsDexTests.length
        },
        accessActivity: {
            total: accessLogs.length + auditLogs.length + accountLogs.length,
            denied: deniedAccessEvents
        }
    };
}

module.exports = {
    buildNetworkDashboardSource,
    calculateNetworkSecurityScore
};
