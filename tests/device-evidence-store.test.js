const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DEVICE_EVIDENCE_SCHEMA,
    createDeviceEvidenceStore,
    deriveDeviceEvidence
} = require('../services/intelligence/device-evidence-store');
const {
    DEFAULT_DEVICE_EVIDENCE_INTERVAL_MS,
    createDeviceEvidenceAutomation
} = require('../services/intelligence/device-evidence-automation');
const { buildDeviceDashboardPayload } = require('../services/intelligence/device-dashboard-processor');
const { devicesAdapter } = require('../services/intelligence/source-adapters');

const NOW = new Date();

function daysAgo(days) {
    return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function deviceDashboardPayload() {
    const devices = [
        ...Array.from({ length: 8 }, (_, index) => ({
            id: `compliant-active-${index + 1}`,
            deviceName: `Compliant Active ${index + 1}`,
            complianceState: 'compliant',
            isEncrypted: true,
            managementAgent: 'mdm',
            lastSyncDateTime: daysAgo(0),
            operatingSystem: 'Windows',
            azureADRegistered: true
        })),
        ...Array.from({ length: 3 }, (_, index) => ({
            id: `noncompliant-${index + 1}`,
            deviceName: `Non-compliant Device ${index + 1}`,
            complianceState: 'noncompliant',
            isEncrypted: true,
            managementAgent: 'mdm',
            lastSyncDateTime: daysAgo(0),
            operatingSystem: 'Windows',
            azureADRegistered: true
        })),
        {
            id: 'unknown-1',
            deviceName: 'Unknown Compliance Device',
            complianceState: 'unknown',
            isEncrypted: true,
            managementAgent: 'mdm',
            lastSyncDateTime: daysAgo(0),
            operatingSystem: 'Windows',
            azureADRegistered: true
        },
        {
            id: 'stale-1',
            deviceName: 'Stale Device',
            complianceState: 'compliant',
            isEncrypted: true,
            managementAgent: 'mdm',
            lastSyncDateTime: daysAgo(15),
            operatingSystem: 'Windows',
            azureADRegistered: true
        },
        ...Array.from({ length: 4 }, (_, index) => ({
            id: `dead-${index + 1}`,
            deviceName: `Dead Device ${index + 1}`,
            complianceState: 'compliant',
            isEncrypted: true,
            managementAgent: 'mdm',
            lastSyncDateTime: daysAgo(45 + index),
            operatingSystem: 'Windows',
            azureADRegistered: true
        }))
    ];
    const alerts = Array.from({ length: 19 }, (_, index) => ({
        id: `alert-${index + 1}`,
        title: `Alert ${index + 1}`,
        severity: 'medium'
    }));
    return buildDeviceDashboardPayload({
        tenantKey: 'sunbird',
        devices,
        alerts,
        policies: [],
        now: () => NOW
    });
}

const EXPECTED_METRICS = {
    totalDevices: 17,
    compliantDevices: 13,
    nonCompliantDevices: 3,
    unknownDevices: 1,
    complianceRate: 76,
    encryptedDevices: 17,
    encryptionRate: 100,
    activeDevices24h: 12,
    staleDevices: 1,
    dead30Days: 4,
    highRiskDevices: 4,
    unmanagedDevices: 0,
    securityAlerts: 19
};

test('saved Device evidence metrics match the visible dashboard device model', () => {
    const payload = deviceDashboardPayload();
    const evidence = deriveDeviceEvidence(payload);
    for (const [metric, expected] of Object.entries(EXPECTED_METRICS)) {
        assert.equal(evidence.dashboardMetrics[metric], expected, metric);
    }
    assert.equal(evidence.devices.length, 17);
    assert.equal(evidence.expectedRecordCount, 17);
    assert.equal(evidence.omittedRecordCount, 0);
    assert.equal(evidence.completenessPercent, 100);
    assert.equal(evidence.isComplete, true);
    assert.equal(evidence.dashboardMetrics.deviceSecurityScore, 82);
});

test('Device dashboard payload normalizes supported alert shapes without breaking device rows', () => {
    const device = {
        id: 'device-1',
        deviceName: 'LAPTOP2023',
        complianceState: 'compliant',
        isEncrypted: true,
        managementAgent: 'mdm',
        lastSyncDateTime: daysAgo(0),
        operatingSystem: 'Windows'
    };
    const alert = { id: 'alert-1', title: 'Endpoint alert', severity: 'high' };
    const cases = [
        { name: 'array', alerts: [alert], expectedAlerts: 1, expectedWarning: false },
        { name: 'value', alerts: { value: [alert] }, expectedAlerts: 1, expectedWarning: false },
        { name: 'data', alerts: { data: [alert] }, expectedAlerts: 1, expectedWarning: false },
        { name: 'alerts', alerts: { alerts: [alert] }, expectedAlerts: 1, expectedWarning: false },
        { name: 'null', alerts: null, expectedAlerts: 0, expectedWarning: true },
        { name: 'error object', alerts: { error: 'forbidden', message: 'Denied' }, expectedAlerts: 0, expectedWarning: true }
    ];

    for (const item of cases) {
        const logs = [];
        const payload = buildDeviceDashboardPayload({
            devices: [device],
            alerts: item.alerts,
            now: () => NOW,
            logger: { warn(message) { logs.push(message); } }
        });
        assert.equal(payload.devices.length, 1, item.name);
        assert.equal(payload.alerts.length, item.expectedAlerts, item.name);
        assert.equal(payload.summary.securityAlerts, item.expectedAlerts, item.name);
        assert.equal(payload.warnings.includes('device_security_alerts_unavailable'), item.expectedWarning, item.name);
        if (!Array.isArray(item.alerts)) {
            assert.equal(logs.length, 1, item.name);
            assert.match(logs[0], /Device alerts payload was not an array/);
            assert.match(logs[0], /Type:/);
            assert.match(logs[0], /Keys:/);
            assert.doesNotMatch(logs[0], /Denied/);
        } else {
            assert.equal(logs.length, 0, item.name);
        }
    }
});

test('Device evidence storage saves fresh device evidence when alerts are invalid', async () => {
    const calls = [];
    const connection = {
        async beginTransaction() { calls.push({ sql: 'BEGIN', params: [] }); },
        async commit() { calls.push({ sql: 'COMMIT', params: [] }); },
        async rollback() { calls.push({ sql: 'ROLLBACK', params: [] }); },
        release() {},
        async query(sql, params = []) {
            calls.push({ sql, params });
            assert.equal((sql.match(/\?/g) || []).length, params.length, `Placeholder mismatch in ${sql}`);
            if (sql.includes('INSERT INTO StackCTRLDeviceEvidenceSnapshots')) return [{ insertId: 901 }, []];
            return [{ affectedRows: 1 }, []];
        }
    };
    const pool = {
        async query() { return [{ affectedRows: 0 }, []]; },
        async getConnection() { return connection; }
    };
    const store = createDeviceEvidenceStore({
        pool,
        logger: { log() {} },
        now: () => NOW
    });
    const payload = buildDeviceDashboardPayload({
        devices: [{
            id: 'device-1',
            deviceName: 'LAPTOP2023',
            complianceState: 'compliant',
            isEncrypted: true,
            managementAgent: 'mdm',
            lastSyncDateTime: daysAgo(0),
            operatingSystem: 'Windows',
            serialNumber: 'SN-1'
        }],
        alerts: { error: 'bad_shape' },
        now: () => NOW,
        logger: { warn() {} }
    });
    const result = await store.persistProcessedEvidence({
        companyId: 1,
        tenantKey: 'sunbird',
        payload,
        collectionTrigger: 'scheduled_30_minute'
    });
    const snapshotWrite = calls.find(call => call.sql.includes('INSERT INTO StackCTRLDeviceEvidenceSnapshots'));
    const deviceWrites = calls.filter(call => /INSERT INTO StackCTRLDeviceEvidence\s*\(/i.test(call.sql));

    assert.equal(result.snapshotId, 901);
    assert.equal(result.recordCount, 1);
    assert.equal(result.status, 'completed_with_warnings');
    assert.deepEqual(result.warnings, ['device_security_alerts_unavailable']);
    assert.equal(snapshotWrite.params[4], 'completed_with_warnings');
    assert.equal(snapshotWrite.params[5], 1);
    assert.equal(snapshotWrite.params[8], 1);
    assert.equal(snapshotWrite.params[25], 0);
    assert.deepEqual(JSON.parse(snapshotWrite.params[33]).warnings, ['device_security_alerts_unavailable']);
    assert.equal(deviceWrites.length, 1);
    assert.equal(deviceWrites[0].params[4], 'LAPTOP2023');
    assert.equal(deviceWrites[0].params[6], 'compliant');
});

test('Device evidence storage writes one readable device row per displayed record', async () => {
    const calls = [];
    const connection = {
        async beginTransaction() { calls.push({ sql: 'BEGIN', params: [] }); },
        async commit() { calls.push({ sql: 'COMMIT', params: [] }); },
        async rollback() { calls.push({ sql: 'ROLLBACK', params: [] }); },
        release() {},
        async query(sql, params = []) {
            calls.push({ sql, params });
            assert.equal((sql.match(/\?/g) || []).length, params.length, `Placeholder mismatch in ${sql}`);
            if (sql.includes('INSERT INTO StackCTRLDeviceEvidenceSnapshots')) return [{ insertId: 801 }, []];
            return [{ affectedRows: 1 }, []];
        }
    };
    const pool = {
        async query() { return [{ affectedRows: 0 }, []]; },
        async getConnection() { return connection; }
    };
    const store = createDeviceEvidenceStore({
        pool,
        logger: { log() {} },
        now: () => NOW
    });
    const result = await store.persistProcessedEvidence({
        companyId: 1,
        tenantKey: 'sunbird',
        payload: deviceDashboardPayload(),
        collectionTrigger: 'scheduled_30_minute'
    });
    const snapshotWrite = calls.find(call => call.sql.includes('INSERT INTO StackCTRLDeviceEvidenceSnapshots'));
    const deviceWrites = calls.filter(call => /INSERT INTO StackCTRLDeviceEvidence\s*\(/i.test(call.sql));
    assert.equal(result.snapshotId, 801);
    assert.equal(result.recordCount, 17);
    assert.equal(result.omittedCount, 0);
    assert.equal(deviceWrites.length, 17);
    assert.equal(snapshotWrite.params[8], 17);
    assert.equal(snapshotWrite.params[12], 17);
    assert.equal(snapshotWrite.params[13], 13);
    assert.equal(snapshotWrite.params[14], 3);
    assert.equal(snapshotWrite.params[21], 1);
    assert.equal(snapshotWrite.params[22], 4);
    assert.equal(snapshotWrite.params[25], 19);
    assert.equal(deviceWrites[0].params[4], 'Compliant Active 1');
    assert.equal(deviceWrites[0].params[6], 'compliant');
    assert.equal(deviceWrites[0].params[7], 1);
});

test('Device evidence schema uses explicit human-readable snapshot and device fields', () => {
    const schema = DEVICE_EVIDENCE_SCHEMA.join('\n');
    assert.match(schema, /StackCTRLDeviceEvidenceSnapshots/);
    assert.match(schema, /StackCTRLDeviceEvidence/);
    assert.match(schema, /ComplianceRatePercent/);
    assert.match(schema, /DeviceSecurityScore/);
    assert.match(schema, /ProcessedEvidenceJson/);
});

test('Device source refresh returns fresh completed_with_warnings evidence when only alerts are unavailable', async () => {
    const queries = [];
    const pool = {
        async query(sql, params = []) {
            queries.push({ sql, params });
            if (sql.includes('FROM CompanyMicrosoftMapping')) {
                return [[{ ID: 1, MicrosoftTenantID: 1, TenantName: 'Sunbird', TenantID: 'tenant-1' }], []];
            }
            if (sql.includes('FROM StackCTRLDeviceEvidenceSnapshots')) return [[], []];
            if (sql.includes('FROM StackCTRLDeviceEvidence')) return [[], []];
            return [[], []];
        }
    };
    let refreshCalls = 0;
    const result = await devicesAdapter({
        pool,
        companyId: 1,
        refresh: true,
        refreshSource: async sourceKey => {
            refreshCalls += 1;
            assert.equal(sourceKey, 'devices');
            return {
                snapshotId: 902,
                collectedAt: new Date().toISOString(),
                status: 'completed_with_warnings',
                warnings: ['device_security_alerts_unavailable'],
                dashboardMetrics: { totalDevices: 1, securityAlerts: 0 },
                devices: [{ id: 'device-1', deviceName: 'LAPTOP2023', complianceState: 'compliant' }]
            };
        },
        capability: {
            sourceKey: 'devices',
            displayName: 'Device Protection',
            isExpected: true,
            isEnabled: true,
            profileKey: 'sunbird',
            freshnessThresholdMinutes: 60,
            refreshMode: 'automatic'
        }
    });

    assert.equal(refreshCalls, 1);
    assert.equal(result.status, 'available');
    assert.equal(result.refreshFailed, false);
    assert.equal(result.freshness.stale, undefined);
    assert.ok(result.freshness.ageMinutes <= 1);
    assert.deepEqual(result.warnings, ['device_security_alerts_unavailable']);
    assert.equal(result.warnings.some(warning => /stale/i.test(warning)), false);
    assert.equal(result.metrics.totalDevices, 1);
    assert.equal(result.evidence[0].data[0].deviceName, 'LAPTOP2023');
});

test('Device evidence automation runs on a 30-minute interval by default', async () => {
    let runs = 0;
    const automation = createDeviceEvidenceAutomation({
        collectAll: async () => { runs += 1; return { ok: true }; },
        intervalMs: DEFAULT_DEVICE_EVIDENCE_INTERVAL_MS,
        startupDelayMs: 0
    });
    automation.start();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(runs, 1);
    automation.stop();
});
