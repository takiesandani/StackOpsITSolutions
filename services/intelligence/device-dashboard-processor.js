const { buildDeviceDashboardSource, normalizeCompliance, getDeviceRiskLevel } = require('./device-dashboard-source');

function buildDeviceDashboardPayload({
    tenantKey = 'sunbird',
    devices = [],
    alerts = [],
    policies = [],
    fetchedAt,
    success = true,
    now = () => new Date()
} = {}) {
    const collectedAt = fetchedAt || now().toISOString();
    const processedDevices = devices.map(device => ({
        id: device.id,
        deviceName: device.deviceName || 'Unknown Device',
        userPrincipalName: device.userPrincipalName || 'N/A',
        operatingSystem: device.operatingSystem || 'Unknown',
        osVersion: device.osVersion || 'N/A',
        complianceState: normalizeCompliance(device),
        isEncrypted: Boolean(device.isEncrypted),
        encryptionStatus: device.isEncrypted ? 'Encrypted' : 'Not Encrypted',
        managementAgent: device.managementAgent || 'Unknown',
        lastSyncDateTime: device.lastSyncDateTime ? new Date(device.lastSyncDateTime) : null,
        azureADRegistered: Boolean(device.azureADRegistered),
        deviceEnrollmentType: device.deviceEnrollmentType || 'Unknown',
        deviceType: device.deviceType || 'Unknown',
        activationLockEnabled: Boolean(device.activationLockEnabled),
        serialNumber: device.serialNumber || 'N/A',
        physicalIds: device.physicalIds || [],
        hasPendingActions: Boolean(device.hasPendingActions),
        complianceGracePeriodExpirationDateTime: device.complianceGracePeriodExpirationDateTime || null
    }));
    const processedAlerts = alerts.slice(0, 50).map(alert => ({
        id: alert.id,
        title: alert.title || 'Unknown Alert',
        description: alert.description || '',
        severity: alert.severity || 'medium',
        status: alert.status || 'newAlert',
        createdDateTime: alert.createdDateTime || collectedAt,
        eventDateTime: alert.eventDateTime || collectedAt,
        sourceMaterials: alert.sourceMaterials || [],
        vendorInformation: alert.vendorInformation?.provider || 'Unknown'
    }));
    const dashboardSource = buildDeviceDashboardSource({
        devicesRows: processedDevices,
        alertsRows: processedAlerts
    });
    const osDistribution = processedDevices.reduce((counts, device) => {
        const key = device.operatingSystem || 'Unknown';
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});
    const managementStatus = {
        managed: processedDevices.filter(device => device.managementAgent && !/unknown/i.test(String(device.managementAgent))).length,
        unmanaged: dashboardSource.dashboardMetrics.unmanagedDevices,
        aadRegistered: processedDevices.filter(device => device.azureADRegistered).length
    };

    return {
        success,
        tenant: tenantKey,
        fetchedAt: collectedAt,
        summary: {
            totalDevices: dashboardSource.dashboardMetrics.totalDevices,
            compliantDevices: dashboardSource.dashboardMetrics.compliantDevices,
            encryptedDevices: dashboardSource.dashboardMetrics.encryptedDevices,
            registeredDevices: managementStatus.aadRegistered,
            staleDevices: dashboardSource.dashboardMetrics.staleDevices,
            highRiskDevices: dashboardSource.dashboardMetrics.highRiskDevices,
            compliancePercentage: dashboardSource.dashboardMetrics.complianceRate,
            encryptionPercentage: dashboardSource.dashboardMetrics.encryptionRate,
            deviceSecurityScore: dashboardSource.dashboardMetrics.deviceSecurityScore,
            securityAlerts: dashboardSource.dashboardMetrics.securityAlerts
        },
        devices: processedDevices,
        alerts: processedAlerts,
        policies: Array.isArray(policies) ? policies.slice(0, 10) : [],
        compliance: dashboardSource.complianceBreakdown,
        osDistribution,
        managementStatus,
        activityBreakdown: dashboardSource.activityBreakdown,
        highRiskDevices: processedDevices.filter(device => getDeviceRiskLevel(device) === 'high').slice(0, 10)
    };
}

module.exports = {
    buildDeviceDashboardPayload
};
