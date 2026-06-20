const test = require('node:test');
const assert = require('node:assert/strict');

const { cloudflareNetworkSecurityAdapter } = require('../services/intelligence/source-adapters');
const buildIdentityDashboardContext = require('../services/intelligence/dashboard-context/identityDashboardContext');
const buildDevicesDashboardContext = require('../services/intelligence/dashboard-context/devicesDashboardContext');
const buildCloudflareDashboardContext = require('../services/intelligence/dashboard-context/cloudflareDashboardContext');

function source(overrides = {}) {
    return {
        sourceKey: 'identity',
        displayName: 'Identity Protection',
        status: 'available',
        isExpected: true,
        freshness: { lastUpdated: new Date().toISOString(), ageMinutes: 0 },
        metrics: {},
        evidence: [],
        warnings: [],
        rawReference: { table: 'test', recordId: 1 },
        ...overrides
    };
}

test('Cloudflare adapter refreshes the dashboard service when backend evidence is missing', async () => {
    let refreshCalls = 0;
    const result = await cloudflareNetworkSecurityAdapter({
        pool: { query: async () => [[], []] },
        companyId: 1,
        refresh: false,
        capability: {
            sourceKey: 'cloudflare_network_security',
            displayName: 'Cloudflare Network Security',
            isExpected: true,
            isEnabled: true,
            refreshMode: 'refresh_if_stale',
            freshnessThresholdMinutes: 60,
            configuration: {}
        },
        async refreshSource(sourceKey, companyId) {
            refreshCalls += 1;
            assert.equal(sourceKey, 'cloudflare_network_security');
            assert.equal(companyId, 1);
            return {
                success: true,
                fetchedAt: new Date().toISOString(),
                overview: { securityStatus: 'Active', protectedApps: 4, enrolledDevices: 12 },
                accessLogs: [{ action: 'block' }, { action: 'allow' }],
                apps: [{ id: 'app-1' }],
                devices: [{ id: 'device-1' }],
                sections: {}
            };
        }
    });

    assert.equal(refreshCalls, 1);
    assert.equal(result.status, 'available');
    assert.equal(result.evidence.length, 1);
    assert.equal(result.metrics.protectedApps, 4);
    assert.equal(result.metrics.deniedAccessEvents, 1);
});

test('dashboard context builders include StackCTRL calculated metrics and evidence lists', () => {
    const identity = buildIdentityDashboardContext(source({
        evidence: [{
            evidenceType: 'users',
            data: [
                { id: 1, mfaEnabled: true, riskLevel: 'SAFE', roles: ['User'], lastSignIn: { device: 'Laptop', status: 'Success', dateTime: new Date().toISOString() } },
                { id: 2, mfaEnabled: false, riskLevel: 'HIGH', roles: ['Global Administrator'], isExternal: true, lastSignIn: { device: 'Unknown', status: 'Failed' } }
            ]
        }]
    }));
    assert.equal(identity.dashboardMetrics.mfaCoverage, 50);
    assert.equal(identity.dashboardMetrics.adminsWithoutMfa, 1);
    assert.equal(identity.dashboardMetrics.signInIssues, 1);
    assert.equal(identity.chartsData.riskDistribution.high, 1);

    const devices = buildDevicesDashboardContext(source({
        sourceKey: 'devices',
        displayName: 'Device Security',
        evidence: [
            { deviceName: 'Managed', complianceState: 'compliant', isEncrypted: true, managementAgent: 'mdm', lastSyncDateTime: new Date().toISOString() },
            { deviceName: 'At risk', complianceState: 'noncompliant', isEncrypted: false, managementAgent: 'unknown', lastSyncDateTime: '2025-01-01T00:00:00.000Z' }
        ]
    }));
    assert.equal(devices.dashboardMetrics.complianceRate, 50);
    assert.equal(devices.dashboardMetrics.encryptionRate, 50);
    assert.equal(devices.dashboardMetrics.dead30Days, 1);
    assert.equal(devices.dashboardMetrics.unmanagedDevices, 1);
});

test('Cloudflare dashboard context exposes network metrics, evidence, and chart-ready values', () => {
    const result = buildCloudflareDashboardContext(source({
        sourceKey: 'cloudflare_network_security',
        displayName: 'Cloudflare Network Security',
        evidence: [{
            overview: {
                protectedApps: 3,
                enrolledDevices: 8,
                activeGatewayPolicies: 2,
                identityProvider: 'Azure AD',
                gatewayProxyEnabled: true,
                dlpProfiles: 1
            },
            apps: [{ id: 1 }],
            devices: [{ id: 1 }],
            gatewayRules: [{ id: 1 }],
            accessLogs: [{ action: 'block' }, { action: 'allow' }],
            sections: { apps: { label: 'Applications', status: 'ok' } }
        }]
    }));

    assert.equal(result.status, 'available');
    assert.equal(result.dashboardMetrics.deniedAccessEvents, 1);
    assert.equal(result.calculatedIndicators.networkSecurityScore, 100);
    assert.equal(result.chartsData.accessActivity.total, 2);
    assert.ok(result.evidence.length > 1);
});

test('not-expected sources do not gain artificial evidence from a dashboard builder', () => {
    const result = buildCloudflareDashboardContext(source({
        sourceKey: 'cloudflare_network_security',
        displayName: 'Cloudflare Network Security',
        status: 'not_expected',
        isExpected: false,
        evidence: []
    }));
    assert.equal(result.evidence.length, 0);
});
