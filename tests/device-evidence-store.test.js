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

const NOW = new Date('2026-06-23T08:00:00.000Z');

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
