const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const {
    POWERBI_DATASETS,
    createPowerBIReportingService
} = require('../services/powerbi-reporting');
const { createPowerBIReportingRouter } = require('../routes/powerbi-reporting');

const logger = { log() {}, warn() {}, error() {} };

async function startApi({ apiKey = 'correct-reporting-key', query, testLogger = logger } = {}) {
    const calls = [];
    const pool = {
        async query(sql, params = []) {
            calls.push({ sql, params });
            if (query) return query(sql, params);
            if (sql.includes('LIMIT 0')) return [[], []];
            return [[{
                CompanyID: 1,
                CompanyName: 'Sunbird',
                ContextJson: { secret: true },
                CompactContextJson: { secret: true }
            }], []];
        }
    };
    const service = createPowerBIReportingService({
        pool,
        getSecret: async () => apiKey,
        logger: testLogger,
        secretCacheMs: 60000
    });
    const app = express();
    app.use('/api/powerbi', createPowerBIReportingRouter({ reportingService: service, logger: testLogger }));
    const server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/powerbi`;
    return {
        calls,
        service,
        baseUrl,
        close: () => new Promise(resolve => server.close(resolve))
    };
}

test('missing and wrong API keys return 401', async () => {
    const api = await startApi();
    try {
        const missing = await fetch(`${api.baseUrl}/companies`);
        const wrong = await fetch(`${api.baseUrl}/companies`, {
            headers: { 'X-PowerBI-API-Key': 'wrong-key' }
        });
        assert.equal(missing.status, 401);
        assert.equal(wrong.status, 401);
        assert.deepEqual(await missing.json(), { success: false, error: 'Unauthorized' });
    } finally {
        await api.close();
    }
});

test('a missing configured secret returns a safe 500 error', async () => {
    const api = await startApi({ apiKey: null });
    try {
        const response = await fetch(`${api.baseUrl}/companies`, {
            headers: { 'X-PowerBI-API-Key': 'anything' }
        });
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), {
            success: false,
            error: 'Power BI Reporting API is not configured'
        });
    } finally {
        await api.close();
    }
});

test('correct API key returns a sanitized standard response', async () => {
    const api = await startApi();
    try {
        const response = await fetch(`${api.baseUrl}/companies`, {
            headers: { 'X-PowerBI-API-Key': 'correct-reporting-key' }
        });
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.equal(body.dataset, 'companies');
        assert.equal(body.limit, 500);
        assert.equal(body.offset, 0);
        assert.equal(body.count, 1);
        assert.equal(Object.prototype.hasOwnProperty.call(body.data[0], 'ContextJson'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(body.data[0], 'CompactContextJson'), false);
    } finally {
        await api.close();
    }
});

test('correct query-string API key succeeds and a wrong query key returns 401', async () => {
    const api = await startApi();
    try {
        const correct = await fetch(`${api.baseUrl}/companies?apiKey=correct-reporting-key`);
        const wrong = await fetch(`${api.baseUrl}/companies?apiKey=wrong-key`);
        assert.equal(correct.status, 200);
        assert.equal((await correct.json()).success, true);
        assert.equal(wrong.status, 401);
        assert.deepEqual(await wrong.json(), { success: false, error: 'Unauthorized' });
    } finally {
        await api.close();
    }
});

test('either credential may authenticate when both are provided', async () => {
    const api = await startApi();
    try {
        const validHeader = await fetch(`${api.baseUrl}/companies?apiKey=wrong-key`, {
            headers: { 'X-PowerBI-API-Key': 'correct-reporting-key' }
        });
        const validQuery = await fetch(`${api.baseUrl}/companies?apiKey=correct-reporting-key`, {
            headers: { 'X-PowerBI-API-Key': 'wrong-key' }
        });
        assert.equal(validHeader.status, 200);
        assert.equal(validQuery.status, 200);
    } finally {
        await api.close();
    }
});

test('metadata lists every fixed endpoint', async () => {
    const api = await startApi();
    try {
        const response = await fetch(api.baseUrl, {
            headers: { 'X-PowerBI-API-Key': 'correct-reporting-key' }
        });
        const body = await response.json();
        assert.equal(body.service, 'StackCTRL Power BI Reporting API');
        assert.deepEqual(body.authentication, {
            methods: ['X-PowerBI-API-Key header', 'apiKey query parameter']
        });
        assert.equal(body.endpoints.length, 20);
        assert.deepEqual(body.endpoints[0], {
            name: 'Companies',
            path: '/api/powerbi/companies',
            view: 'vw_PowerBI_Companies'
        });
    } finally {
        await api.close();
    }
});

test('health endpoint checks all 20 reporting views', async () => {
    const api = await startApi();
    try {
        const response = await fetch(`${api.baseUrl}/health`, {
            headers: { 'X-PowerBI-API-Key': 'correct-reporting-key' }
        });
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body.status, 'available');
        assert.equal(body.database, 'connected');
        assert.equal(body.viewsChecked, 20);
        assert.equal(api.calls.filter(call => call.sql.includes('LIMIT 0')).length, 20);
    } finally {
        await api.close();
    }
});

test('every dataset endpoint maps only to its approved SQL view', async () => {
    const api = await startApi();
    try {
        for (const definition of POWERBI_DATASETS) {
            api.calls.length = 0;
            await api.service.readDataset(definition.path, { limit: 1 });
            assert.match(api.calls[0].sql, new RegExp('FROM `' + definition.view + '`'));
        }
        await assert.rejects(
            () => api.service.readDataset('StackCTRLTenantEvidenceSnapshots'),
            error => error.statusCode === 404
        );
    } finally {
        await api.close();
    }
});

test('pagination and supported filters use SQL parameters', async () => {
    const api = await startApi();
    try {
        await api.service.readDataset('risk-register', {
            companyId: '1',
            tenantId: 'tenant-sunbird',
            snapshotId: '76',
            runId: '21',
            periodType: 'daily',
            fromDate: '2026-06-01',
            toDate: '2026-06-22',
            limit: '100',
            offset: '200'
        });
        const call = api.calls.at(-1);
        assert.match(call.sql, /`CompanyID` = \?/);
        assert.match(call.sql, /`ReportDate` >= \?/);
        assert.match(call.sql, /LIMIT \? OFFSET \?/);
        assert.doesNotMatch(call.sql, /tenant-sunbird|2026-06-22/);
        assert.deepEqual(call.params, [1, 'tenant-sunbird', 76, 21, 'daily', '2026-06-01', '2026-06-22', 100, 200]);
    } finally {
        await api.close();
    }
});

test('limit is capped and invalid parameters return 400', async () => {
    const api = await startApi();
    try {
        const capped = api.service.buildQuery(POWERBI_DATASETS[0], { limit: '9000' });
        assert.equal(capped.limit, 5000);
        const response = await fetch(`${api.baseUrl}/risk-register?limit=invalid`, {
            headers: { 'X-PowerBI-API-Key': 'correct-reporting-key' }
        });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { success: false, error: 'limit must be a whole number' });
    } finally {
        await api.close();
    }
});

test('arbitrary datasets cannot be queried', async () => {
    const api = await startApi();
    try {
        const response = await fetch(`${api.baseUrl}/StackCTRLTenantEvidenceSnapshots`, {
            headers: { 'X-PowerBI-API-Key': 'correct-reporting-key' }
        });
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { success: false, error: 'Dataset not found' });
        assert.equal(api.calls.length, 0);
    } finally {
        await api.close();
    }
});

test('reporting logs redact query-string API keys', async () => {
    const messages = [];
    const testLogger = {
        error(...values) { messages.push(JSON.stringify(values)); },
        log() {},
        warn() {}
    };
    const secret = 'fabric-secret-that-must-not-be-logged';
    const api = await startApi({ apiKey: secret, testLogger });
    try {
        const response = await fetch(`${api.baseUrl}/not-a-dataset?apiKey=${secret}`);
        assert.equal(response.status, 404);
        const logged = messages.join('\n');
        assert.doesNotMatch(logged, new RegExp(secret));
        assert.match(decodeURIComponent(logged), /apiKey=<redacted>/);
    } finally {
        await api.close();
    }
});

test('OpenAPI JSON and Swagger documentation are available', async () => {
    const api = await startApi();
    try {
        const unauthorizedOpenApi = await fetch(`${api.baseUrl}/openapi.json`);
        const openApiResponse = await fetch(`${api.baseUrl}/openapi.json?apiKey=correct-reporting-key`);
        const document = await openApiResponse.json();
        const docsResponse = await fetch(`${api.baseUrl}/docs?apiKey=correct-reporting-key`);
        assert.equal(unauthorizedOpenApi.status, 401);
        assert.equal(openApiResponse.status, 200);
        assert.equal(document.openapi, '3.0.3');
        assert.equal(document.info.version, '1.1');
        assert.equal(document.components.securitySchemes.PowerBIHeaderAPIKey.name, 'X-PowerBI-API-Key');
        assert.equal(document.components.securitySchemes.PowerBIHeaderAPIKey.in, 'header');
        assert.equal(document.components.securitySchemes.PowerBIQueryAPIKey.name, 'apiKey');
        assert.equal(document.components.securitySchemes.PowerBIQueryAPIKey.in, 'query');
        assert.deepEqual(document.paths['/risk-register'].get.security, [
            { PowerBIHeaderAPIKey: [] },
            { PowerBIQueryAPIKey: [] }
        ]);
        assert.equal(Object.keys(document.paths).length, 22);
        assert.equal(document.paths['/risk-register'].get.responses[200].content['application/json'].example.data.length, 1);
        assert.equal(docsResponse.status, 200);
        const docs = await docsResponse.text();
        assert.match(docs, /SwaggerUIBundle/);
        assert.match(docs, /Fabric Dataflow Gen2/);
        assert.match(docs, /apiKey=&lt;POWERBI_KEY&gt;/);
        assert.doesNotMatch(JSON.stringify(document), /correct-reporting-key/);
    } finally {
        await api.close();
    }
});
