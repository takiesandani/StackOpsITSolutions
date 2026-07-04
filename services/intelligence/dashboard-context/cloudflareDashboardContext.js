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
    const permissionMatrix = asArray(payload.permissionMatrix);
    const endpointGroups = asObject(payload.endpointGroups);
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
            accessLogCount: accessLogs.length,
            endpointFamilies: numberFrom(overview, ['endpointFamilies'], permissionMatrix.length),
            endpointFamiliesAvailable: numberFrom(overview, ['endpointFamiliesAvailable'], permissionMatrix.filter(item => ['available', 'empty'].includes(String(item.status || ''))).length),
            endpointFamiliesWithGaps: numberFrom(overview, ['endpointFamiliesWithGaps'], permissionMatrix.filter(item => ['permission_unavailable', 'error', 'not_requested'].includes(String(item.status || ''))).length),
            tunnels: numberFrom(overview, ['tunnels'], asArray(payload.tunnels).length),
            casbFindings: numberFrom(overview, ['casbFindings'], asArray(payload.casbFindings).length),
            auditLogs: numberFrom(overview, ['auditLogs'], asArray(payload.auditLogs).length),
            securityInsights: numberFrom(overview, ['securityInsights'], asArray(payload.securityInsights).length),
            loadBalancerPools: numberFrom(overview, ['loadBalancerPools'], asArray(payload.loadBalancerPools).length),
            loadBalancerMonitors: numberFrom(overview, ['loadBalancerMonitors'], asArray(payload.loadBalancerMonitors).length),
            magicWanSites: numberFrom(overview, ['magicWanSites'], asArray(payload.magicWanSites).length),
            magicWanRoutes: numberFrom(overview, ['magicWanRoutes'], asArray(payload.magicWanRoutes).length),
            mtlsCertificates: numberFrom(overview, ['mtlsCertificates'], asArray(payload.mtlsCertificates).length),
            teamsDexTests: numberFrom(overview, ['teamsDexTests'], asArray(payload.teamsDexTests).length)
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
            tunnels: asArray(payload.tunnels),
            auditLogs: asArray(payload.auditLogs),
            accountLogs: asArray(payload.accountLogs),
            securityInsights: asArray(payload.securityInsights),
            applicationSecurityReports: asArray(payload.applicationSecurityReports),
            apiGatewayOperations: asArray(payload.apiGatewayOperations),
            casbFindings: asArray(payload.casbFindings),
            cloudforceRequests: asArray(payload.cloudforceRequests),
            intelFeeds: asArray(payload.intelFeeds),
            dnsFirewallRules: asArray(payload.dnsFirewallRules),
            loadBalancerPools: asArray(payload.loadBalancerPools),
            loadBalancerMonitors: asArray(payload.loadBalancerMonitors),
            magicWanSites: asArray(payload.magicWanSites),
            magicWanRoutes: asArray(payload.magicWanRoutes),
            mtlsCertificates: asArray(payload.mtlsCertificates),
            accessGroups: asArray(payload.accessGroups),
            accessOrganizations: asArray(payload.accessOrganizations),
            accessCertificates: asArray(payload.accessCertificates),
            warpConnectors: asArray(payload.warpConnectors),
            teamnetRoutes: asArray(payload.teamnetRoutes),
            teamsDexTests: asArray(payload.teamsDexTests),
            permissionMatrix,
            endpointGroups: Object.entries(endpointGroups).map(([moduleName, families]) => ({ moduleName, families: asArray(families) })),
            sectionStatus: sectionValues
        },
        chartsData: {
            serviceCoverage: {
                applications: asArray(payload.apps).length,
                devices: asArray(payload.devices).length,
                gatewayRules: asArray(payload.gatewayRules).length,
                dlpProfiles: asArray(payload.dlpProfiles).length,
                warpProfiles: asArray(payload.warpProfiles).length,
                virtualNetworks: asArray(payload.virtualNetworks).length,
                tunnels: asArray(payload.tunnels).length,
                casbFindings: asArray(payload.casbFindings).length,
                auditLogs: asArray(payload.auditLogs).length,
                magicWan: asArray(payload.magicWanSites).length + asArray(payload.magicWanRoutes).length,
                loadBalancers: asArray(payload.loadBalancerPools).length + asArray(payload.loadBalancerMonitors).length,
                certificates: asArray(payload.mtlsCertificates).length + asArray(payload.accessCertificates).length
            },
            accessActivity: { total: accessLogs.length, denied: deniedAccessEvents }
        },
        warnings: partialWarnings
    });
}

module.exports = buildCloudflareDashboardContext;
