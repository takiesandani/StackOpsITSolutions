const test = require('node:test');
const assert = require('node:assert/strict');

const {
    NETWORK_EVIDENCE_SCHEMA,
    createNetworkEvidenceStore,
    deriveNetworkEvidence
} = require('../services/intelligence/network-evidence-store');
const {
    DEFAULT_NETWORK_EVIDENCE_INTERVAL_MS,
    createNetworkEvidenceAutomation
} = require('../services/intelligence/network-evidence-automation');
const { buildNetworkDashboardPayload } = require('../services/intelligence/network-dashboard-processor');

const NOW = new Date('2026-06-23T08:00:00.000Z');

function networkDashboardPayload() {
    return buildNetworkDashboardPayload({
        tenantKey: 'sunbird',
        payload: {
            success: true,
            fetchedAt: NOW.toISOString(),
            overview: {
                protectedApps: 4,
                enrolledDevices: 12,
                gatewayPolicies: 8,
                activeGatewayPolicies: 7,
                identityProviders: 1,
                identityProvider: 'Azure AD',
                gatewayProxyEnabled: true,
                dlpProfiles: 2
            },
            sections: {
                apps: { status: 'ok' },
                devices: { status: 'ok' }
            },
            apps: Array.from({ length: 4 }, (_, index) => ({ id: `app-${index + 1}`, name: `App ${index + 1}` })),
            devices: Array.from({ length: 12 }, (_, index) => ({ id: `device-${index + 1}`, name: `Device ${index + 1}`, status: 'active' })),
            deviceRegistrations: Array.from({ length: 2 }, (_, index) => ({ id: `registration-${index + 1}`, name: `Registration ${index + 1}` })),
            devicePosture: [{ id: 'posture-1', name: 'Firewall enabled' }],
            gatewayRules: Array.from({ length: 8 }, (_, index) => ({ id: `rule-${index + 1}`, name: `Rule ${index + 1}`, enabled: index < 7 })),
            policies: Array.from({ length: 2 }, (_, index) => ({ id: `policy-${index + 1}`, name: `Access Policy ${index + 1}` })),
            accessLogs: Array.from({ length: 15 }, (_, index) => ({
                id: `log-${index + 1}`,
                action: index === 0 ? 'block' : 'allow',
                status: index === 0 ? 'deny' : 'ok'
            })),
            dlpProfiles: [{ id: 'dlp-1', name: 'Default DLP' }, { id: 'dlp-2', name: 'Finance DLP' }],
            warpProfiles: [{ id: 'warp-1', name: 'Default WARP' }],
            virtualNetworks: [{ id: 'vnet-1', name: 'Default virtual network' }],
            gatewayAppTypes: Array.from({ length: 5 }, (_, index) => ({ id: `category-${index + 1}`, name: `Gateway category ${index + 1}` })),
            permissionMatrix: Array.from({ length: 3 }, (_, index) => ({ id: `family-${index + 1}`, name: `API family ${index + 1}`, status: index === 2 ? 'permission_unavailable' : 'available' })),
            auditLogs: Array.from({ length: 6 }, (_, index) => ({ id: `audit-${index + 1}`, action: 'update', userEmail: `admin${index + 1}@example.com` })),
            accountLogs: Array.from({ length: 2 }, (_, index) => ({ id: `account-log-${index + 1}`, action: 'account_event' })),
            securityInsights: [{ id: 'insight-1', name: 'Security insight' }],
            tunnels: Array.from({ length: 2 }, (_, index) => ({ id: `tunnel-${index + 1}`, name: `Tunnel ${index + 1}` }))
        },
        now: () => NOW
    });
}

test('saved Network evidence metrics match the visible dashboard network model', () => {
    const payload = networkDashboardPayload();
    const evidence = deriveNetworkEvidence(payload);
    assert.equal(evidence.dashboardMetrics.protectedApps, 4);
    assert.equal(evidence.dashboardMetrics.enrolledDevices, 12);
    assert.equal(evidence.dashboardMetrics.gatewayPolicies, 8);
    assert.equal(evidence.dashboardMetrics.activeGatewayPolicies, 7);
    assert.equal(evidence.dashboardMetrics.deniedAccessEvents, 1);
    assert.equal(evidence.dashboardMetrics.dlpProfiles, 2);
    assert.equal(evidence.dashboardMetrics.appCategories, 5);
    assert.equal(evidence.dashboardMetrics.endpointFamilies, 3);
    assert.equal(evidence.dashboardMetrics.auditLogs, 6);
    assert.equal(evidence.dashboardMetrics.accountLogs, 2);
    assert.equal(evidence.dashboardMetrics.tunnels, 2);
    assert.equal(evidence.evidenceRows.length, 67);
    assert.equal(evidence.isComplete, true);
});

test('Network evidence storage writes one readable row per Cloudflare evidence item', async () => {
    const calls = [];
    const connection = {
        async beginTransaction() { calls.push({ sql: 'BEGIN', params: [] }); },
        async commit() { calls.push({ sql: 'COMMIT', params: [] }); },
        async rollback() { calls.push({ sql: 'ROLLBACK', params: [] }); },
        release() {},
        async query(sql, params = []) {
            calls.push({ sql, params });
            if (sql.includes('INSERT INTO StackCTRLNetworkEvidenceSnapshots')) return [{ insertId: 1001 }, []];
            return [{ affectedRows: 1 }, []];
        }
    };
    const pool = {
        async query() { return [{ affectedRows: 0 }, []]; },
        async getConnection() { return connection; }
    };
    const store = createNetworkEvidenceStore({
        pool,
        logger: { log() {} },
        now: () => NOW
    });
    const payload = networkDashboardPayload();
    const result = await store.persistProcessedEvidence({
        companyId: 1,
        tenantKey: 'sunbird',
        payload,
        collectionTrigger: 'scheduled_hourly'
    });
    const snapshotWrite = calls.find(call => call.sql.includes('INSERT INTO StackCTRLNetworkEvidenceSnapshots'));
    const evidenceWrites = calls.filter(call => /INSERT INTO StackCTRLNetworkEvidence\s*\(/i.test(call.sql));
    assert.equal(result.snapshotId, 1001);
    assert.equal(result.recordCount, 67);
    assert.equal(evidenceWrites.length, 67);
    assert.equal(snapshotWrite.params[8], 67);
    assert.equal(snapshotWrite.params[12], 4);
    assert.equal(snapshotWrite.params[13], 12);
    assert.equal(snapshotWrite.params[16], 1);
    assert.equal(JSON.parse(snapshotWrite.params[27]).auditLogs, 6);
    assert.equal(JSON.parse(snapshotWrite.params[27]).appCategories, 5);
    assert.equal(JSON.parse(snapshotWrite.params[27]).endpointFamilies, 3);
});

test('Network evidence schema uses explicit snapshot and evidence fields', () => {
    const schema = NETWORK_EVIDENCE_SCHEMA.join('\n');
    assert.match(schema, /StackCTRLNetworkEvidenceSnapshots/);
    assert.match(schema, /StackCTRLNetworkEvidence/);
    assert.match(schema, /NetworkSecurityScore/);
    assert.match(schema, /ProcessedEvidenceJson/);
});

test('Network evidence automation runs on a 60-minute interval by default', async () => {
    let runs = 0;
    const automation = createNetworkEvidenceAutomation({
        collectAll: async () => { runs += 1; return { ok: true }; },
        intervalMs: DEFAULT_NETWORK_EVIDENCE_INTERVAL_MS,
        startupDelayMs: 0
    });
    automation.start();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(runs, 1);
    automation.stop();
});
