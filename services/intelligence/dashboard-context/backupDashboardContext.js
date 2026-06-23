const { asArray, buildContext, numberFrom, payloadFromSource } = require('./common');

function buildBackupDashboardContext(source) {
    const payload = payloadFromSource(source);
    const storedMetrics = source.dashboardMetrics || source.dashboardSourceMetrics || {};
    const summary = { ...(payload.summary || {}), ...storedMetrics };
    const storage = payload.storage || {};
    const byService = storage.byService || {};
    const users = asArray(storage.users);
    return buildContext(source, {
        dashboardMetrics: {
            totalStorageGB: numberFrom(summary, ['totalStorageGB']),
            oneDriveStorageGB: numberFrom(summary, ['oneDriveStorageGB'], byService.onedrive),
            sharePointStorageGB: numberFrom(summary, ['sharePointStorageGB'], byService.sharepoint),
            exchangeStorageGB: numberFrom(summary, ['exchangeStorageGB'], byService.exchange),
            activeUsersCount: numberFrom(summary, ['activeUsersCount']),
            inactiveUsersCount: numberFrom(summary, ['inactiveUsersCount']),
            servicesCovered: numberFrom(summary, ['servicesCovered'], 3),
            inactiveUserStorageGB: numberFrom(summary, ['inactiveUserStorageGB'], storage.inactiveUserStorageGB),
            backupCoverageScore: numberFrom(summary, ['backupCoverageScore']),
            dataExposureRiskScore: numberFrom(summary, ['dataExposureRiskScore']),
            recommendationsCount: numberFrom(summary, ['recommendationsCount'], asArray(payload.recommendations).length)
        },
        calculatedIndicators: {
            backupCoverageScore: numberFrom(summary, ['backupCoverageScore'], Math.min(100, Math.round((numberFrom(summary, ['servicesCovered'], 3) / 3) * 100))),
            staleBackupEvidence: numberFrom(summary, ['staleRowCount']),
            recoveryEvidenceAvailable: Boolean(summary.backupConfigured) || asArray(payload.insights).length > 0
        },
        evidenceLists: { users, sites: asArray(storage.sites), inactiveUsers: asArray(storage.inactiveUsers), insights: asArray(payload.insights), recommendations: asArray(payload.recommendations) },
        chartsData: { storageByService: { oneDrive: numberFrom(summary, ['oneDriveStorageGB'], byService.onedrive), sharePoint: numberFrom(summary, ['sharePointStorageGB'], byService.sharepoint), exchange: numberFrom(summary, ['exchangeStorageGB'], byService.exchange) } }
    });
}

module.exports = buildBackupDashboardContext;
