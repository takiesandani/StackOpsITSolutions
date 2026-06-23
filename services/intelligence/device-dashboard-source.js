function numberValue(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    return ['1', 'true', 'yes', 'enabled'].includes(String(value || '').trim().toLowerCase());
}

function normalizeCompliance(device) {
    const value = String(device?.complianceState || 'unknown').toLowerCase().replace(/[_\s-]/g, '');
    if (value === 'noncompliant') return 'noncompliant';
    if (value === 'compliant') return 'compliant';
    return 'unknown';
}

function lastSyncTime(device) {
    const raw = device?.lastSyncDateTime || device?.lastSync || device?.lastSeenDateTime;
    const time = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
}

function daysSinceLastSync(device) {
    const time = lastSyncTime(device);
    if (!time) return 999;
    return Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
}

function normalizeDeviceRow(row = {}) {
    return {
        id: row.id || row.ID || null,
        deviceName: row.deviceName || row.device_name || 'Unknown Device',
        userPrincipalName: row.userPrincipalName || row.user_principal_name || 'N/A',
        operatingSystem: row.operatingSystem || row.operating_system || 'Unknown',
        osVersion: row.osVersion || row.os_version || 'N/A',
        complianceState: normalizeCompliance(row),
        isEncrypted: booleanValue(row.isEncrypted ?? row.is_encrypted),
        encryptionStatus: booleanValue(row.isEncrypted ?? row.is_encrypted) ? 'Encrypted' : 'Not Encrypted',
        managementAgent: row.managementAgent || row.management_agent || 'Unknown',
        lastSyncDateTime: row.lastSyncDateTime || row.last_sync_datetime || null,
        azureADRegistered: booleanValue(row.azureADRegistered ?? row.azure_ad_registered),
        deviceEnrollmentType: row.deviceEnrollmentType || row.device_enrollment_type || 'Unknown',
        deviceType: row.deviceType || row.device_type || 'Unknown',
        activationLockEnabled: booleanValue(row.activationLockEnabled ?? row.activation_lock_enabled),
        serialNumber: row.serialNumber || row.serial_number || 'N/A',
        hasPendingActions: booleanValue(row.hasPendingActions ?? row.has_pending_actions)
    };
}

function getDeviceIssueReasons(device) {
    const reasons = [];
    const compliance = normalizeCompliance(device);
    const days = daysSinceLastSync(device);
    if (compliance !== 'compliant') reasons.push(compliance === 'unknown' ? 'Unknown compliance' : 'Non-compliant');
    if (!device.isEncrypted) reasons.push('Not encrypted');
    if (days > 30) reasons.push('Dead 30+ days');
    else if (days > 7) reasons.push('Stale 7+ days');
    if (!String(device.managementAgent || '').trim() || /unknown|none/i.test(String(device.managementAgent || ''))) {
        reasons.push('Unmanaged');
    }
    if (device.hasPendingActions) reasons.push('Pending actions');
    return reasons;
}

function getDeviceRiskLevel(device) {
    const reasons = getDeviceIssueReasons(device);
    if ((!device.isEncrypted && normalizeCompliance(device) !== 'compliant') || reasons.includes('Dead 30+ days')) {
        return 'high';
    }
    if (reasons.length > 0) return 'medium';
    return 'safe';
}

function calculateDeviceSecurityScore(totalDevices, compliantDevices, encryptedDevices, active24h) {
    if (!totalDevices) return 0;
    const compliance = compliantDevices / totalDevices;
    const encryption = encryptedDevices / totalDevices;
    const activity = active24h / totalDevices;
    return Math.round(((compliance + encryption + activity) / 3) * 100);
}

function buildDeviceDashboardSource({ devicesRows = [], alertsRows = [], metricsRow = {}, summary = {} } = {}) {
    const devices = devicesRows.map(normalizeDeviceRow);
    const alerts = Array.isArray(alertsRows) ? alertsRows : [];
    const hasDevices = devices.length > 0;
    const totalDevices = hasDevices ? devices.length : numberValue(summary.totalDevices ?? metricsRow.totalDevices ?? metricsRow.TotalDevices);
    const compliantDevices = hasDevices
        ? devices.filter(device => normalizeCompliance(device) === 'compliant').length
        : numberValue(summary.compliantDevices ?? metricsRow.compliantDevices);
    const nonCompliantDevices = hasDevices
        ? devices.filter(device => normalizeCompliance(device) === 'noncompliant').length
        : numberValue(summary.nonCompliantDevices ?? metricsRow.nonCompliant ?? metricsRow.NonCompliant);
    const unknownDevices = hasDevices
        ? devices.filter(device => normalizeCompliance(device) === 'unknown').length
        : numberValue(summary.unknownDevices ?? metricsRow.unknownDevices);
    const encryptedDevices = hasDevices
        ? devices.filter(device => device.isEncrypted).length
        : numberValue(summary.encryptedDevices ?? metricsRow.encryptedDevices);
    const notEncryptedDevices = hasDevices
        ? devices.filter(device => !device.isEncrypted).length
        : Math.max(0, totalDevices - encryptedDevices);
    const staleDevices = hasDevices
        ? devices.filter(device => daysSinceLastSync(device) > 7 && daysSinceLastSync(device) <= 30).length
        : numberValue(summary.staleDevices ?? metricsRow.staleDevices ?? metricsRow.StaleDevices);
    const dead30Days = hasDevices
        ? devices.filter(device => daysSinceLastSync(device) > 30).length
        : numberValue(summary.dead30Days ?? summary.dead30days ?? metricsRow.dead30Days);
    const activeDevices24h = hasDevices
        ? devices.filter(device => daysSinceLastSync(device) <= 1).length
        : numberValue(summary.active24h ?? summary.activeDevices24h ?? metricsRow.activeDevices24h);
    const highRiskDevices = hasDevices
        ? devices.filter(device => getDeviceRiskLevel(device) === 'high').length
        : numberValue(summary.highRiskDevices ?? metricsRow.highRiskDevices);
    const mediumRiskDevices = hasDevices
        ? devices.filter(device => getDeviceRiskLevel(device) === 'medium').length
        : 0;
    const unmanagedDevices = hasDevices
        ? devices.filter(device => !String(device.managementAgent || '').trim() || /unknown|none/i.test(String(device.managementAgent || ''))).length
        : numberValue(summary.unmanagedDevices ?? metricsRow.unmanagedDevices);
    const securityAlerts = alerts.length || numberValue(summary.securityAlerts ?? metricsRow.securityAlerts);
    const complianceRate = totalDevices ? Math.round((compliantDevices / totalDevices) * 100) : 0;
    const encryptionRate = totalDevices ? Math.round((encryptedDevices / totalDevices) * 100) : 0;
    const deviceSecurityScore = calculateDeviceSecurityScore(totalDevices, compliantDevices, encryptedDevices, activeDevices24h);
    const riskDistribution = {
        safe: Math.max(0, totalDevices - highRiskDevices - mediumRiskDevices),
        medium: mediumRiskDevices,
        high: highRiskDevices
    };
    const activityBreakdown = {
        active24h: activeDevices24h,
        stale7days: staleDevices,
        dead30days: dead30Days
    };
    const complianceBreakdown = {
        compliant: compliantDevices,
        nonCompliant: nonCompliantDevices,
        unknown: unknownDevices
    };
    const dashboardMetrics = {
        totalDevices,
        compliantDevices,
        nonCompliantDevices,
        unknownDevices,
        encryptedDevices,
        notEncryptedDevices,
        complianceRate,
        encryptionRate,
        activeDevices24h,
        staleDevices,
        dead30Days,
        highRiskDevices,
        mediumRiskDevices,
        unmanagedDevices,
        securityAlerts,
        deviceSecurityScore,
        riskDistribution,
        activityBreakdown,
        complianceBreakdown
    };
    return {
        devices,
        alerts,
        dashboardMetrics,
        activityBreakdown,
        complianceBreakdown,
        riskDistribution
    };
}

module.exports = {
    buildDeviceDashboardSource,
    normalizeDeviceRow,
    normalizeCompliance,
    daysSinceLastSync,
    getDeviceIssueReasons,
    getDeviceRiskLevel,
    calculateDeviceSecurityScore
};
