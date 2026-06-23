const { asArray, booleanFrom, buildContext, daysSince, numberFrom } = require('./common');
const { calculateDeviceSecurityScore, getDeviceRiskLevel } = require('../device-dashboard-source');

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
    const storedDevices = asArray(source.evidence?.find(item => item?.evidenceType === 'devices')?.data);
    const devices = storedDevices.length ? storedDevices : asArray(source.evidence).filter(isDevice);
    const stored = source.metrics || {};
    const dashboardSource = source.dashboardSourceMetrics || {};
    const totalDevices = numberFrom(dashboardSource, ['totalDevices'], devices.length || numberFrom(stored, ['TotalDevices', 'totalDevices']));
    const nonCompliantDevices = devices.filter(device => compliance(device) === 'noncompliant');
    const unknownDevices = devices.filter(device => compliance(device) === 'unknown');
    const notEncryptedDevices = devices.filter(device => !booleanFrom(device.isEncrypted));
    const staleDevicesList = devices.filter(device => lastSyncDays(device) > 7 && lastSyncDays(device) <= 30);
    const deadDevices = devices.filter(device => lastSyncDays(device) > 30);
    const unmanagedDevices = devices.filter(device => !device.managementAgent || String(device.managementAgent).toLowerCase() === 'unknown');
    const compliant = numberFrom(dashboardSource, ['compliantDevices'], devices.length
        ? devices.filter(device => compliance(device) === 'compliant').length
        : Math.max(0, totalDevices - numberFrom(stored, ['NonCompliant', 'nonCompliant'])));
    const encrypted = numberFrom(dashboardSource, ['encryptedDevices'], devices.length
        ? devices.length - notEncryptedDevices.length
        : Math.max(0, totalDevices - numberFrom(stored, ['NotEncrypted', 'notEncrypted'])));
    const nonCompliant = numberFrom(dashboardSource, ['nonCompliantDevices'], devices.length ? nonCompliantDevices.length : numberFrom(stored, ['NonCompliant', 'nonCompliant']));
    const notEncrypted = numberFrom(dashboardSource, ['notEncryptedDevices'], devices.length ? notEncryptedDevices.length : numberFrom(stored, ['NotEncrypted', 'notEncrypted']));
    const stale = numberFrom(dashboardSource, ['staleDevices'], devices.length ? staleDevicesList.length : numberFrom(stored, ['StaleDevices', 'staleDevices']));
    const dead30Days = numberFrom(dashboardSource, ['dead30Days'], deadDevices.length);
    const activeDevices24h = numberFrom(dashboardSource, ['activeDevices24h'], devices.filter(device => lastSyncDays(device) <= 1).length);
    const highRiskDevices = numberFrom(dashboardSource, ['highRiskDevices'], devices.length
        ? devices.filter(device => getDeviceRiskLevel(device) === 'high').length
        : numberFrom(stored, ['HighRiskDevices', 'highRiskDevices']));
    const unmanagedCount = numberFrom(dashboardSource, ['unmanagedDevices'], unmanagedDevices.length);
    const securityAlerts = numberFrom(dashboardSource, ['securityAlerts'], 0);
    const complianceRate = totalDevices ? Math.round((compliant / totalDevices) * 100) : numberFrom(dashboardSource, ['complianceRate'], 0);
    const encryptionRate = totalDevices ? Math.round((encrypted / totalDevices) * 100) : numberFrom(dashboardSource, ['encryptionRate'], 0);
    const deviceSecurityScore = numberFrom(
        dashboardSource,
        ['deviceSecurityScore'],
        totalDevices ? calculateDeviceSecurityScore(totalDevices, compliant, encrypted, activeDevices24h) : 0
    );

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
            activeDevices24h,
            staleDevices: stale,
            dead30Days,
            highRiskDevices,
            unmanagedDevices: unmanagedCount,
            unknownDevices: unknownDevices.length,
            securityAlerts,
            deviceSecurityScore
        },
        calculatedIndicators: {
            deviceSecurityScore,
            deviceComplianceStatus: complianceRate >= 90 ? 'healthy' : complianceRate >= 70 ? 'attention' : 'high_risk',
            deviceExposureCount: nonCompliant + notEncrypted + stale + dead30Days
        },
        evidenceLists: {
            allDevices: devices,
            nonCompliantDevices,
            notEncryptedDevices,
            staleDevices: staleDevicesList,
            deadDevices,
            unmanagedDevices,
            unknownDevices
        },
        chartsData: {
            compliance: { compliant, nonCompliant, unknown: unknownDevices.length },
            encryption: { encrypted, notEncrypted },
            activity: {
                active24Hours: activeDevices24h,
                stale7To30Days: stale,
                dead30Days
            },
            osDistribution
        }
    });
}

module.exports = buildDevicesDashboardContext;
