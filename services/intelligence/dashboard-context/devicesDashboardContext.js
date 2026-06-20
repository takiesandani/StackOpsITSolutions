const { asArray, booleanFrom, buildContext, daysSince, numberFrom } = require('./common');

function isDevice(item) {
    return item && typeof item === 'object' && Boolean(item.deviceName || item.operatingSystem || item.complianceState || item.lastSyncDateTime);
}

function compliance(device) {
    return String(device?.complianceState || 'unknown').toLowerCase().replace(/[_\s-]/g, '');
}

function lastSyncDays(device) {
    return daysSince(device?.lastSyncDateTime || device?.lastSync || device?.lastSeenDateTime);
}

function buildDevicesDashboardContext(source) {
    const devices = asArray(source.evidence).filter(isDevice);
    const stored = source.metrics || {};
    const totalDevices = devices.length || numberFrom(stored, ['TotalDevices', 'totalDevices']);
    const nonCompliantDevices = devices.filter(device => compliance(device) === 'noncompliant');
    const unknownDevices = devices.filter(device => compliance(device) === 'unknown');
    const notEncryptedDevices = devices.filter(device => !booleanFrom(device.isEncrypted));
    const staleDevices = devices.filter(device => lastSyncDays(device) > 7 && lastSyncDays(device) <= 30);
    const deadDevices = devices.filter(device => lastSyncDays(device) > 30);
    const unmanagedDevices = devices.filter(device => !device.managementAgent || String(device.managementAgent).toLowerCase() === 'unknown');
    const compliant = devices.length ? devices.filter(device => compliance(device) === 'compliant').length :
        Math.max(0, totalDevices - numberFrom(stored, ['NonCompliant', 'nonCompliant']));
    const encrypted = devices.length ? devices.length - notEncryptedDevices.length :
        Math.max(0, totalDevices - numberFrom(stored, ['NotEncrypted', 'notEncrypted']));
    const nonCompliant = devices.length ? nonCompliantDevices.length : numberFrom(stored, ['NonCompliant', 'nonCompliant']);
    const notEncrypted = devices.length ? notEncryptedDevices.length : numberFrom(stored, ['NotEncrypted', 'notEncrypted']);
    const stale = devices.length ? staleDevices.length : numberFrom(stored, ['StaleDevices', 'staleDevices']);
    const complianceRate = totalDevices ? Math.round((compliant / totalDevices) * 100) : 0;
    const encryptionRate = totalDevices ? Math.round((encrypted / totalDevices) * 100) : 0;

    const osDistribution = devices.reduce((counts, device) => {
        const key = device.operatingSystem || 'Unknown';
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});

    return buildContext(source, {
        dashboardMetrics: {
            totalDevices,
            compliantDevices: compliant,
            nonCompliantDevices: nonCompliant,
            encryptedDevices: encrypted,
            notEncryptedDevices: notEncrypted,
            complianceRate,
            encryptionRate,
            staleDevices: stale,
            dead30Days: deadDevices.length,
            unmanagedDevices: unmanagedDevices.length,
            unknownDevices: unknownDevices.length
        },
        calculatedIndicators: {
            deviceSecurityScore: totalDevices ? Math.round((complianceRate + encryptionRate) / 2) : 0,
            deviceComplianceStatus: complianceRate >= 90 ? 'healthy' : complianceRate >= 70 ? 'attention' : 'high_risk',
            deviceExposureCount: nonCompliant + notEncrypted + stale + deadDevices.length
        },
        evidenceLists: {
            allDevices: devices,
            nonCompliantDevices,
            notEncryptedDevices,
            staleDevices,
            deadDevices,
            unmanagedDevices,
            unknownDevices
        },
        chartsData: {
            compliance: { compliant, nonCompliant, unknown: unknownDevices.length },
            encryption: { encrypted, notEncrypted },
            activity: {
                active24Hours: devices.filter(device => lastSyncDays(device) <= 1).length,
                stale7To30Days: staleDevices.length,
                dead30Days: deadDevices.length
            },
            osDistribution
        }
    });
}

module.exports = buildDevicesDashboardContext;
