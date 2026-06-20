const { asArray, buildContext, numberFrom, payloadFromSource } = require('./common');

function activityAge(row) {
    const value = row?.lastActivity || row?.lastActivityDate || row?.lastSeen;
    const date = value ? new Date(value) : null;
    return !date || Number.isNaN(date.getTime()) ? 999 : Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function buildBackupDashboardContext(source) {
    const payload = payloadFromSource(source);
    const summary = payload.summary || source.metrics || {};
    const storage = payload.storage || {};
    const byService = storage.byService || {};
    const users = asArray(storage.users);
    const sites = asArray(storage.sites);
    const inactiveUsers = asArray(storage.inactiveUsers).length
        ? asArray(storage.inactiveUsers)
        : users.filter(user => activityAge(user) > 30);
    const staleRows = [...users, ...sites].filter(row => activityAge(row) > 90);
    const servicesCovered = numberFrom(summary, ['servicesCovered'], 3);

    return buildContext(source, {
        dashboardMetrics: {
            totalStorageGB: numberFrom(summary, ['totalStorageGB'], Number(byService.onedrive || 0) + Number(byService.sharepoint || 0) + Number(byService.exchange || 0)),
            oneDriveStorageGB: numberFrom(summary, ['oneDriveStorageGB'], byService.onedrive || 0),
            sharePointStorageGB: numberFrom(summary, ['sharePointStorageGB'], byService.sharepoint || 0),
            exchangeStorageGB: numberFrom(summary, ['exchangeStorageGB'], byService.exchange || 0),
            activeUsers: numberFrom(summary, ['activeUsersCount'], users.filter(user => activityAge(user) <= 30).length),
            inactiveUsers: numberFrom(summary, ['inactiveUsersCount'], inactiveUsers.length),
            servicesCovered,
            backupConfigured: Boolean(summary.backupConfigured)
        },
        calculatedIndicators: {
            backupCoverageScore: Math.min(100, Math.round((servicesCovered / 3) * 100)),
            staleBackupEvidence: staleRows.length,
            recoveryEvidenceAvailable: asArray(payload.insights).length > 0 || Boolean(summary.backupConfigured)
        },
        evidenceLists: {
            users,
            sites,
            inactiveUsers,
            staleRows,
            insights: asArray(payload.insights),
            recommendations: asArray(payload.recommendations)
        },
        chartsData: {
            storageByService: {
                oneDrive: Number(byService.onedrive || summary.oneDriveStorageGB || 0),
                sharePoint: Number(byService.sharepoint || summary.sharePointStorageGB || 0),
                exchange: Number(byService.exchange || summary.exchangeStorageGB || 0)
            }
        }
    });
}

module.exports = buildBackupDashboardContext;
