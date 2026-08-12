const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadServerBuilder() {
    const source = fs.readFileSync('server.js', 'utf8');
    const start = source.indexOf('function buildSunbirdDomainBreakdownFromPayload(payload = {}) {');
    const end = source.indexOf('function buildSunbirdLatestReportSnapshot', start);
    return vm.runInNewContext(`${source.slice(start, end)}; buildSunbirdDomainBreakdownFromPayload;`, {
        SUNBIRD_DASHBOARD_MAX_STRING_LENGTH: 1200,
        clampReportScore: value => Number(value),
        shortText: (value, maximum) => String(value || '').slice(0, maximum)
    });
}

function buildFinding(row) {
    return loadServerBuilder()({ domainInsights: { domains: [{ domainKey: 'sample', domainName: 'Sample', intelligenceOutput: {
        risks: [{ title: 'Readable proof', severity: 'high', sourceMetric: 'sampleMetric', evidenceIds: ['opaque-id'], evidenceRows: [row] }]
    } }] } })[0].findings[0];
}

test('embedded wrapped evidence serializes with a non-zero count before ID lookup', () => {
    const finding = buildFinding({ evidenceRow: { displayName: 'Ada Lovelace', userPrincipalName: 'ada@example.com', mfaEnabled: false } });
    assert.equal(finding.evidenceCount, 1);
    assert.equal(finding.evidence[0].name, 'Ada Lovelace');
    assert.match(finding.evidence[0].detail, /ada@example\.com.*MFA: Not enabled/);
    assert.doesNotMatch(JSON.stringify(finding.evidence), /opaque-id|Evidence item|Current enterprise evidence record/);
});

test('evidence normalization produces readable output for supported domains', () => {
    const samples = [
        [{ affectedEntity: { displayName: 'Grace Hopper', roles: ['Administrator'], riskLevel: 'high' } }, /Grace Hopper.*Roles: Administrator/s],
        [{ data: { deviceName: 'FIN-LAPTOP-07', operatingSystem: 'Windows', osVersion: '11', complianceState: 'nonCompliant' } }, /FIN-LAPTOP-07.*Operating system: Windows 11.*Compliance: nonCompliant/s],
        [{ evidenceRow: { title: 'Suspicious sign-in', sender: 'alerts@example.com', status: 'active', category: 'Identity' } }, /Suspicious sign-in.*Sender: alerts@example.com.*Status: active/s],
        [{ displayName: 'Finance Portal', publisherName: 'Contoso', type: 'Enterprise', isExternal: true }, /Finance Portal.*Publisher: Contoso.*External application: Yes/s],
        [{ displayName: 'Backup User', files: 42, storage: '8 GB', lastActivity: '2026-08-10' }, /Backup User.*Files: 42.*Storage: 8 GB/s],
        [{ name: 'Gateway policy', domain: 'example.com', policies: ['Block malware'], enabled: true }, /Gateway policy.*Policies: Block malware.*Enabled: Yes/s],
        [{ title: 'Access review', area: 'Governance', ownerStatus: 'Assigned', complianceStatus: 'Failed', validationReason: 'Control needs review' }, /Access review.*Compliance: Failed.*Area: Governance.*Owner: Assigned/s]
    ];
    samples.forEach(([row, pattern]) => {
        const evidence = buildFinding(row).evidence[0];
        assert.match(`${evidence.name} ${evidence.detail}`, pattern);
    });
});

test('a readable validation summary is supplied when a future finding has no row evidence', () => {
    const builder = loadServerBuilder();
    const finding = builder({ domainInsights: { domains: [{ domainKey: 'governance', intelligenceOutput: { risks: [{ title: 'Ownership gap', evidenceSummary: 'Governance output shows an unassigned control.', sourceMetric: 'ownerStatus' }] } }] } })[0].findings[0];
    assert.equal(finding.evidenceCount, 1);
    assert.match(finding.evidence[0].name, /Ownership gap.*validation summary/);
    assert.match(finding.evidence[0].detail, /Governance output shows an unassigned control/);
});

test('frontend renders embedded evidence immediately and preserves it on empty or failed live lookup', () => {
    const source = fs.readFileSync('js/clientportal.js', 'utf8');
    const helperStart = source.indexOf('function mergeSunbirdDomainEvidenceRows(embedded = [], live = []) {');
    const helperEnd = source.indexOf('function getSunbirdDomainFindingEvidenceRows', helperStart);
    const getState = vm.runInNewContext(source.slice(helperStart, helperEnd) + '; applySunbirdDomainEvidenceState;');
    const saved = [{ _identity: 'saved-1', title: 'Saved evidence', detail: 'Persisted report output' }];
    const emptyLookup = getState(saved, []);
    const failedLookup = getState(saved, [], true);
    const enrichedLookup = getState(saved, [{ _identity: 'live-2', title: 'Live evidence', detail: 'Current source output' }]);

    assert.deepEqual(JSON.parse(JSON.stringify(emptyLookup.rows)), saved);
    assert.equal(emptyLookup.status, 'saved');
    assert.deepEqual(JSON.parse(JSON.stringify(failedLookup.rows)), saved);
    assert.equal(failedLookup.status, 'saved');
    assert.equal(enrichedLookup.rows.length, 2);
    assert.equal(enrichedLookup.status, 'enriched');

    const openStart = source.indexOf('function openSunbirdDomainFindingEvidence(evidenceKey) {');
    const openEnd = source.indexOf('function renderSunbirdReportDomainBreakdown', openStart);
    const block = source.slice(openStart, openEnd);
    assert.match(block, /let rows = getSunbirdDomainFindingEvidenceRows\(payload\.finding\)/);
    assert.match(block, /applySunbirdDomainEvidenceState\(rows, liveRows\)/);
    assert.match(block, /applySunbirdDomainEvidenceState\(rows, \[\], true\)/);
    assert.doesNotMatch(block, /rows = explicitEvidenceIds\.length \? \[\]/);
    assert.doesNotMatch(block, /Evidence could not be loaded/);
    assert.match(source, /getSunbirdDomainFindingEvidenceRows\(finding\)\.length/);
});
