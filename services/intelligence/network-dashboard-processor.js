const { buildNetworkDashboardSource } = require('./network-dashboard-source');

function buildNetworkDashboardPayload({
    tenantKey = 'sunbird',
    payload = {},
    fetchedAt,
    success = true,
    now = () => new Date()
} = {}) {
    const collectedAt = fetchedAt || payload.fetchedAt || now().toISOString();
    const dashboardSource = buildNetworkDashboardSource({
        overview: payload.overview || {},
        accessLogs: payload.accessLogs || [],
        sections: payload.sections || {},
        apps: payload.apps || [],
        devices: payload.devices || [],
        gatewayRules: payload.gatewayRules || [],
        dlpProfiles: payload.dlpProfiles || [],
        warpProfiles: payload.warpProfiles || [],
        virtualNetworks: payload.virtualNetworks || []
    });

    return {
        success,
        tenant: tenantKey,
        fetchedAt: collectedAt,
        account: payload.account || {},
        overview: dashboardSource.dashboardMetrics,
        sections: payload.sections || {},
        apps: payload.apps || [],
        devices: payload.devices || [],
        deviceRegistrations: payload.deviceRegistrations || [],
        devicePosture: payload.devicePosture || [],
        gatewayRules: payload.gatewayRules || [],
        gatewayConfig: payload.gatewayConfig || {},
        warpProfiles: payload.warpProfiles || [],
        gatewayAppTypes: payload.gatewayAppTypes || [],
        virtualNetworks: payload.virtualNetworks || [],
        accessLogs: payload.accessLogs || [],
        dlpProfiles: payload.dlpProfiles || [],
        zones: payload.zones || [],
        dashboardMetrics: dashboardSource.dashboardMetrics,
        serviceCoverage: dashboardSource.serviceCoverage,
        accessActivity: dashboardSource.accessActivity
    };
}

module.exports = {
    buildNetworkDashboardPayload
};
