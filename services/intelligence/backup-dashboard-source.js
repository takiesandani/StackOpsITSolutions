function numberValue(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function activityAge(row) {
    const value = row?.lastActivity || row?.lastActivityDate || row?.lastSeen;
    const date = value ? new Date(value) : null;
    return !date || Number.isNaN(date.getTime()) ? 999 : Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function mergeBackupUserRecords(users = [], inactiveUsers = []) {
    const records = new Map();
    [...users, ...inactiveUsers].forEach(user => {
        const service = user.items !== undefined ? 'Exchange' : 'OneDrive';
        const key = `${service}:${String(user.user || user.displayName || '').toLowerCase()}`;
        if (!key.endsWith(':')) records.set(key, user);
    });
    return Array.from(records.values());
}

function buildBackupRows(payload = {}) {
    const storage = payload.storage || {};
    const rows = [];
    mergeBackupUserRecords(storage.users || [], storage.inactiveUsers || []).forEach((user, index) => {
        const service = user.items !== undefined ? 'Exchange' : 'OneDrive';
        const bytes = Number(user.storage || 0);
        const storageGB = Number((bytes / (1024 ** 3)).toFixed(2));
        const lastActivity = user.lastActivity || '';
        rows.push({
            kind: 'user',
            sourceId: `${service}-${String(user.user || index).slice(0, 200)}`,
            title: user.displayName || user.user || 'Unknown user',
            service,
            storageGB,
            lastActivity,
            activityAge: activityAge(user),
            processed: user
        });
    });
    (storage.sites || []).forEach((site, index) => {
        const bytes = Number(site.storage || 0);
        rows.push({
            kind: 'site',
            sourceId: `site-${String(site.url || site.owner || index).slice(0, 200)}`,
            title: site.owner || 'SharePoint site',
            service: 'SharePoint',
            storageGB: Number((bytes / (1024 ** 3)).toFixed(2)),
            lastActivity: site.lastActivity || '',
            activityAge: activityAge(site),
            processed: site
        });
    });
    return rows;
}

function buildBackupRecommendations(summary, evidence) {
    const recs = [];
    if (numberValue(summary.totalStorageGB) > 1000) {
        recs.push({ priority: 'medium', title: 'Review large storage footprint', detail: `${summary.totalStorageGB} GB across Microsoft 365 services.` });
    }
    if (numberValue(summary.inactiveUsersCount) > 0) {
        recs.push({ priority: 'high', title: 'Review inactive user data', detail: `${summary.inactiveUsersCount} inactive user(s) still hold backup evidence.` });
    }
    if (evidence.staleRows > 0) {
        recs.push({ priority: 'warn', title: 'Stale backup activity detected', detail: `${evidence.staleRows} row(s) have not been active in 90+ days.` });
    }
    if (!summary.backupConfigured) {
        recs.push({ priority: 'critical', title: 'No external backup configured', detail: 'Only Microsoft-native retention policies are protecting tenant data.' });
    }
    if (!recs.length) {
        recs.push({ priority: 'low', title: 'Maintain backup monitoring baseline', detail: 'No urgent backup recommendations from current evidence.' });
    }
    return recs;
}

function buildBackupDashboardSource({ payload = {}, summary = {}, storage = {} } = {}) {
    const mergedSummary = { ...(payload.summary || {}), ...summary };
    const mergedStorage = { ...(payload.storage || {}), ...storage };
    const rows = buildBackupRows({ storage: mergedStorage });
    const userRows = rows.filter(row => row.service !== 'SharePoint');
    const inactiveRows = userRows.filter(row => row.activityAge > 30 || !row.lastActivity);
    const staleRows = rows.filter(row => row.activityAge > 90 || !row.lastActivity);
    const highStorageRows = rows.filter(row => row.storageGB >= 20);
    const backupCoverageScore = Math.round((numberValue(mergedSummary.servicesCovered, 3) / 3) * 100);
    const dataExposureRiskScore = Math.min(100, Math.round((inactiveRows.length * 3) + (highStorageRows.length * 5) + numberValue(mergedStorage.inactiveUserStorageGB) / 10));
    const recommendations = buildBackupRecommendations(mergedSummary, { inactiveRows: inactiveRows.length, staleRows: staleRows.length });
    const dashboardMetrics = {
        totalStorageGB: numberValue(mergedSummary.totalStorageGB),
        oneDriveStorageGB: numberValue(mergedSummary.oneDriveStorageGB, mergedStorage.byService?.onedrive),
        sharePointStorageGB: numberValue(mergedSummary.sharePointStorageGB, mergedStorage.byService?.sharepoint),
        exchangeStorageGB: numberValue(mergedSummary.exchangeStorageGB, mergedStorage.byService?.exchange),
        activeUsersCount: numberValue(mergedSummary.activeUsersCount),
        inactiveUsersCount: numberValue(mergedSummary.inactiveUsersCount, inactiveRows.length),
        servicesCovered: numberValue(mergedSummary.servicesCovered, 3),
        inactiveUserStorageGB: numberValue(mergedStorage.inactiveUserStorageGB),
        backupConfigured: Boolean(mergedSummary.backupConfigured),
        backupCoverageScore,
        dataExposureRiskScore,
        staleRowCount: staleRows.length,
        highStorageRowCount: highStorageRows.length,
        recommendationsCount: recommendations.length
    };
    return { rows, recommendations, dashboardMetrics, userRows, inactiveRows, staleRows, highStorageRows };
}

module.exports = {
    buildBackupDashboardSource,
    buildBackupRows,
    activityAge
};
