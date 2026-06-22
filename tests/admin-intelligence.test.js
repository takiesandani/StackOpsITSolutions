const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const { createAdminIntelligenceService } = require('../services/admin-intelligence');
const { createAdminIntelligenceRouter } = require('../routes/admin-intelligence');
const { createEnterpriseIntelligenceService } = require('../services/enterprise-intelligence');

test('admin intelligence status returns safe Azure visibility and daily usage', async () => {
    const pool = {
        async query(sql) {
            if (sql.includes('TotalRunsToday')) return [[{
                TotalRunsToday: 5,
                CompletedRunsToday: 4,
                FailedRunsToday: 1,
                RateLimitedRunsToday: 2,
                InputTokensToday: 1200,
                OutputTokensToday: 400,
                TotalTokensToday: 1600,
                AverageRequestSize: 2400,
                AverageResponseSize: 1800
            }], []];
            if (sql.includes('CurrentRateLimitedRuns')) return [[{ CurrentRateLimitedRuns: 1 }], []];
            if (sql.includes("Status = 'completed'")) return [[{ ID: 8, Status: 'completed' }], []];
            if (sql.includes("Status = 'failed'")) return [[{ ID: 7, Status: 'failed', ErrorMessage: 'Rate limit exhausted' }], []];
            if (sql.includes('ORDER BY ID DESC LIMIT 1')) return [[{ ID: 8, Status: 'completed', RetryCount: 2 }], []];
            return [[], []];
        }
    };
    const service = createAdminIntelligenceService({
        pool,
        azureOpenAI: {
            async getSafeConfiguration() {
                return { endpointConfigured: true, deployment: 'gpt-4.1-mini', apiVersion: 'v1', authenticationMode: 'api_key' };
            }
        },
        intelligenceService: {},
        schedulerService: {},
        automationService: { getStatus: () => ({ enabled: true, running: false }) }
    });

    const status = await service.getSystemStatus();
    assert.equal(status.azure.endpointConfigured, true);
    assert.equal(status.azure.deployment, 'gpt-4.1-mini');
    assert.equal(status.latestErrorMessage, 'Rate limit exhausted');
    assert.equal(status.lastRetryCount, 2);
    assert.equal(status.usage.TotalTokensToday, 1600);
    assert.equal(status.usage.CurrentRateLimitedRuns, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(status.azure, 'apiKey'), false);
});

test('admin intelligence action passes the selected tenant and admin audit identity', async () => {
    const calls = [];
    const service = createAdminIntelligenceService({
        pool: { query: async () => [[{ SnapshotID: 27 }], []] },
        azureOpenAI: { getSafeConfiguration: async () => ({}) },
        intelligenceService: {
            async bootstrap(options) { calls.push({ action: 'snapshot', options }); return { snapshotId: 28 }; },
            async runPeriodIntelligence(options) {
                calls.push({ action: 'analysis', options });
                return { analysis: { runId: 9 }, period: { ID: 4 }, compactContext: { compactContextSizeBytes: 280000 } };
            }
        },
        schedulerService: {
            async getHistoricalSnapshotContext() { return { comparisons: {} }; },
            async runNow(options) { calls.push({ action: 'full-test', options }); return { runId: 10 }; }
        },
        defaultOutputTypes: ['executive_summary'],
        logger: { log() {} }
    });
    const user = { id: 3, email: 'admin@example.com', role: 'admin' };

    await service.createSnapshot(1, user);
    await service.runAnalysis(1, { snapshotId: 27 }, user);
    await service.runFullTest(1, { includeAnalysis: true }, user);

    assert.equal(calls[0].options.companyId, 1);
    assert.equal(calls[0].options.user.email, 'admin@example.com');
    assert.equal(calls[1].options.snapshotId, 27);
    assert.equal(calls[1].options.periodType, 'daily');
    assert.deepEqual(calls[1].options.outputTypes, ['executive_summary']);
    assert.equal(calls[2].options.includeAnalysis, true);
});

test('admin intelligence router blocks client users and allows admins', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/admin/intelligence', createAdminIntelligenceRouter({
        authenticateToken(req, _res, next) {
            req.user = { role: req.get('X-Test-Role'), email: 'test@example.com' };
            next();
        },
        adminIntelligenceService: {
            async getSystemStatus() { return { azure: { endpointConfigured: true } }; }
        }
    }));
    const server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}/api/admin/intelligence/status`;

    try {
        const clientResponse = await fetch(url, { headers: { 'X-Test-Role': 'client' } });
        const adminResponse = await fetch(url, { headers: { 'X-Test-Role': 'admin' } });
        assert.equal(clientResponse.status, 403);
        assert.equal(adminResponse.status, 200);
        assert.equal((await adminResponse.json()).azure.endpointConfigured, true);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});

test('tenant intelligence still loads when an optional dashboard dataset fails', async () => {
    const pool = {
        async query(sql) {
            if (sql.includes('FROM Companies WHERE ID')) return [[{ ID: 1, CompanyName: 'Sunbird' }], []];
            if (sql.includes('FROM StackCTRLTenantEvidenceSnapshots') && sql.includes('OCTET_LENGTH')) {
                return [[{
                    ID: 76,
                    CompanyID: 1,
                    TenantKey: 'tenant-1',
                    SnapshotType: 'manual_test',
                    DataCompletenessScore: 100,
                    ContextSizeBytes: 1000000,
                    CreatedAt: new Date()
                }], []];
            }
            throw new Error('Optional dashboard query failed');
        }
    };
    const service = createAdminIntelligenceService({
        pool,
        azureOpenAI: { getSafeConfiguration: async () => ({}) },
        intelligenceService: {},
        schedulerService: {},
        logger: { log() {}, error() {} }
    });

    const tenant = await service.getTenant(1);
    assert.equal(tenant.company.companyName, 'Sunbird');
    assert.equal(tenant.latestSnapshot.ID, 76);
    assert.deepEqual(tenant.outputs, []);
    assert.deepEqual(tenant.historicalAvailability, {});
});

test('enterprise domain list contains all 10 expected domain keys', async () => {
    const pool = {
        async query() {
            return [[], []];
        }
    };
    const service = createEnterpriseIntelligenceService({
        pool,
        azureOpenAI: { getSafeConfiguration: async () => ({}) },
        intelligenceService: {},
        schedulerService: {},
        logger: { log() {}, error() {} }
    });

    const adminData = await service.getAdminData(1);
    const domains = adminData.domains;
    
    assert.equal(domains.length, 10);
    
    const expectedKeys = ['identity', 'devices', 'email_security', 'cloudflare_network_security', 'governance', 'compliance', 'security_alerts', 'operations', 'backup', 'applications'];
    const actualKeys = domains.map(d => d.key);
    assert.deepEqual(actualKeys, expectedKeys);
});

test('enterprise domain list contains all 10 expected labels', async () => {
    const pool = {
        async query() {
            return [[], []];
        }
    };
    const service = createEnterpriseIntelligenceService({
        pool,
        azureOpenAI: { getSafeConfiguration: async () => ({}) },
        intelligenceService: {},
        schedulerService: {},
        logger: { log() {}, error() {} }
    });

    const adminData = await service.getAdminData(1);
    const domains = adminData.domains;
    
    const expectedLabels = [
        'Identity Protection',
        'Device Protection',
        'Email Security',
        'Network Security / Cloudflare',
        'Governance',
        'Compliance Validation',
        'Security Alerts',
        'Operations',
        'Backup and Recovery',
        'Applications'
    ];
    const actualLabels = domains.map(d => d.name);
    assert.deepEqual(actualLabels, expectedLabels);
});

test('sunbird tenant receives all 10 domains not just identity protection', async () => {
    const pool = {
        async query() {
            return [[], []];
        }
    };
    const service = createEnterpriseIntelligenceService({
        pool,
        azureOpenAI: { getSafeConfiguration: async () => ({}) },
        intelligenceService: {},
        schedulerService: {},
        logger: { log() {}, error() {} }
    });

    const adminData = await service.getAdminData(1);
    const domains = adminData.domains;
    
    // Verify we have more than just identity
    assert(domains.length > 1, 'Should have more than 1 domain');
    
    // Verify identity is present but so are others
    const hasIdentity = domains.some(d => d.key === 'identity');
    const hasDevices = domains.some(d => d.key === 'devices');
    const hasEmailSecurity = domains.some(d => d.key === 'email_security');
    const hasCompliance = domains.some(d => d.key === 'compliance');
    const hasBackup = domains.some(d => d.key === 'backup');
    
    assert(hasIdentity, 'Should have identity domain');
    assert(hasDevices, 'Should have devices domain');
    assert(hasEmailSecurity, 'Should have email_security domain');
    assert(hasCompliance, 'Should have compliance domain');
    assert(hasBackup, 'Should have backup domain');
});
