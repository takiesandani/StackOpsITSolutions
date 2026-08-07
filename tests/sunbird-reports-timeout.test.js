const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadReportTimeoutHelper() {
    const source = fs.readFileSync('server.js', 'utf8');
    const start = source.indexOf('function withSunbirdReportTimeout(task, timeoutMs, label) {');
    const end = source.indexOf('async function fetchSunbirdPowerBIIntelligence', start);
    assert.ok(start >= 0 && end > start, 'report timeout helper must be present');
    return vm.runInNewContext(`${source.slice(start, end)}; withSunbirdReportTimeout;`, { setTimeout, clearTimeout, Promise, Error });
}

test('live report timeout rejects a stalled optional read with a classified error', async () => {
    const withSunbirdReportTimeout = loadReportTimeoutHelper();
    await assert.rejects(
        () => withSunbirdReportTimeout(() => new Promise(resolve => setTimeout(resolve, 50)), 10, 'Test live read'),
        error => error.code === 'SUNBIRD_REPORT_TIMEOUT' && /Test live read exceeded 10ms/.test(error.message)
    );
});

test('reports endpoint keeps live enrichment bounded and treats the view audit as optional', () => {
    const source = fs.readFileSync('server.js', 'utf8');
    const start = source.indexOf("app.get('/api/sunbird/reports'");
    const end = source.indexOf("app.get('/api/sunbird/reports/live-evidence'", start);
    const route = source.slice(start, end);
    assert.match(route, /domainTimeoutMs: SUNBIRD_REPORT_LIVE_DOMAIN_TIMEOUT_MS/);
    assert.match(route, /SUNBIRD_REPORT_LIVE_FINAL_TIMEOUT_MS/);
    assert.match(route, /SUNBIRD_REPORT_LIVE_IDENTITY_TIMEOUT_MS/);
    assert.match(route, /'Report view audit'/);
    assert.match(route, /saved_report_fallback/);
    const serviceSource = fs.readFileSync('services/enterprise-intelligence.js', 'utf8');
    assert.match(serviceSource, /queryTimeoutMs > 0 \? \{ sql, timeout:/);
    const schema = fs.readFileSync('sql/stackctrl-enterprise-intelligence.sql', 'utf8');
    assert.match(schema, /ix_domain_intelligence_latest_lookup/);
    assert.match(schema, /ix_enterprise_synthesis_latest_lookup/);
});