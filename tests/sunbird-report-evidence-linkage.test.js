const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {
    ensureItemEvidence,
    ENTERPRISE_DOMAINS,
    compactBackupEvidenceRows,
    compactGovernanceEvidenceRows,
    compactComplianceEvidenceRows
} = require('../services/enterprise-intelligence');

function loadServerBuilder() {
    const source = fs.readFileSync('server.js', 'utf8');
    const start = source.indexOf('function buildSunbirdDomainBreakdownFromPayload(payload = {}) {');
    const end = source.indexOf('function buildSunbirdLatestReportSnapshot', start);
    return vm.runInNewContext(`${source.slice(start, end)}; buildSunbirdDomainBreakdownFromPayload;`, {
        SUNBIRD_DASHBOARD_MAX_STRING_LENGTH: 1200,
        clampReportScore: Number,
        shortText: (value, maximum) => String(value || '').slice(0, maximum)
    });
}

function serializeFinding(domainKey, finding, categories) {
    return loadServerBuilder()({ domainInsights: { domains: [{ domainKey, intelligenceOutput: {
        risks: [finding], evidenceCatalog: { categories }
    } }] } })[0].findings[0];
}

const category = (key, sourceMetric, entities) => ({ key, sourceMetric, count: entities.length, entities });

test('screenshot multiple-role wording resolves exactly five real privileged users', () => {
    const users = [
        ['Gary Norton', ['Global Administrator', 'Security Administrator']],
        ['Ken Ross', ['Global Administrator', 'User Administrator']],
        ['Alex Morgan', ['Security Administrator', 'Compliance Administrator']],
        ['Sam Lee', ['Exchange Administrator', 'Teams Administrator']],
        ['Priya Shah', ['Application Administrator', 'Cloud Application Administrator']],
        ['Break Glass', ['Global Administrator']]
    ].map(([displayName, roles]) => ({ displayName, roles }));
    const finding = serializeFinding('identity', {
        title: "Five users with multiple privileged roles including 'Gary Norton' and 'Ken Ross'.",
        sourceMetric: 'users'
    }, [category('privilegedUsers', 'privilegedUsers', users), category('allUsers', 'totalUsers', users)]);
    assert.equal(finding.evidenceCount, 5);
    assert.deepEqual(Array.from(finding.evidence, row => row.name).sort(), ['Alex Morgan', 'Gary Norton', 'Ken Ross', 'Priya Shah', 'Sam Lee']);
    assert.ok(!finding.evidence.some(row => row.name === 'Break Glass'));
});

test('portable nine-domain fixtures resolve exact relevant rows and exclude unrelated rows', () => {
    const cases = [
        ['identity', { title: 'External users require review', sourceMetric: 'users' }, [category('externalUsers', 'externalUsers', [{ displayName: 'Guest One' }, { displayName: 'Guest Two' }]), category('allUsers', 'totalUsers', [{ displayName: 'Employee' }])], ['Guest One', 'Guest Two']],
        ['devices', { title: 'Non-compliant devices require action', sourceMetric: 'devices' }, [category('nonCompliantDevices', 'nonCompliantDevices', [{ deviceName: 'BAD-1', complianceState: 'nonCompliant' }, { deviceName: 'BAD-2', complianceState: 'nonCompliant' }]), category('allDevices', 'totalDevices', [{ deviceName: 'GOOD', complianceState: 'compliant' }])], ['BAD-1', 'BAD-2']],
        ['email_security', { title: 'Active phishing threats', sourceMetric: 'activeThreats' }, [category('alerts', 'alerts', [{ title: 'Phish A', status: 'active' }, { title: 'Phish B', status: 'resolved' }])], ['Phish A']],
        ['security_alerts', { title: 'Ongoing low-severity email threats', sourceMetric: 'activeThreats' }, [category('alerts', 'totalAlerts', [{ title: 'Low open', severity: 'low', status: 'active' }, { title: 'Low closed', severity: 'low', status: 'resolved' }, { title: 'High open', severity: 'high', status: 'active' }])], ['Low open']],
        ['cloudflare_network_security', { title: 'Gateway policies block threats', sourceMetric: 'protectedApps' }, [category('gatewayRules', 'gatewayPolicies', [{ name: 'Block malware' }, { name: 'Block private traffic' }]), category('accessApps', 'protectedApps', [{ name: 'SSO App' }])], ['Block malware', 'Block private traffic']],
        ['applications', { title: 'External applications from unknown publishers with no assigned users', sourceMetric: 'externalApps' }, [category('applications', 'applications', [{ displayName: 'Shadow App', publisherName: 'Unknown', isExternal: true, userCount: 0 }, { displayName: 'Known App', publisherName: 'Contoso', isExternal: true, userCount: 0 }])], ['Shadow App']],
        ['backup', { title: 'High exposure from large data holders', sourceMetric: 'backupCoverageGaps' }, [category('users', 'activeUsersCount', Array.from({ length: 6 }, (_, index) => ({ displayName: `User ${index + 1}`, storage: index + 1 })))], ['User 6', 'User 5', 'User 4', 'User 3', 'User 2']],
        ['governance', { title: 'Missing ownership on critical governance items', sourceMetric: 'governanceScore' }, [category('governanceRows', 'governanceRows', [{ title: 'Unowned review', ownerStatus: 'Missing' }, { title: 'Owned review', ownerStatus: 'Assigned' }])], ['Unowned review']],
        ['compliance', { title: 'Critical identity control failures', sourceMetric: 'complianceScore' }, [category('controls', 'totalControls', [{ controlName: 'Identity MFA', area: 'Identity', complianceStatus: 'Failed' }, { controlName: 'Identity Success', area: 'Identity', complianceStatus: 'Passed' }, { controlName: 'Device Failure', area: 'Devices', complianceStatus: 'Failed' }])], ['Identity MFA']]
    ];
    for (const [domain, finding, categories, expected] of cases) {
        const result = serializeFinding(domain, finding, categories);
        assert.deepEqual(Array.from(result.evidence, row => row.name), expected, domain);
        assert.equal(result.evidenceCount, expected.length, domain);
    }
});

test('strong catalog categories override capped or wrongly linked embedded arrays', () => {
    const rows = (prefix, count, extra = () => ({})) => Array.from({ length: count }, (_, index) => ({
        displayName: `${prefix} ${index + 1}`,
        ...extra(index)
    }));
    const cases = [
        ['devices', { title: '4 non-compliant devices are stale and assigned to users', sourceMetric: 'devices', evidenceRows: rows('Wrong device', 21, () => ({ complianceState: 'compliant' })) }, [category('nonCompliantDevices', 'nonCompliantDevices', rows('Device', 4, () => ({ complianceState: 'noncompliant' })))], 4],
        ['identity', { title: '16 external users, many without MFA and no recent sign-in', sourceMetric: 'users', evidenceRows: rows('Capped guest', 5) }, [category('usersWithoutMfa', 'mfaMissing', rows('MFA gap', 24)), category('externalUsers', 'externalUsers', rows('Guest', 16))], 16],
        ['identity', { title: '55 inactive users, many without MFA and unknown sign-in details', sourceMetric: 'users', evidenceRows: rows('Capped inactive', 5) }, [category('usersWithoutMfa', 'mfaMissing', rows('MFA gap', 24)), category('inactiveUsers', 'inactiveUsers', rows('Inactive', 55))], 55],
        ['identity', { title: '66 users have unknown device or location information', sourceMetric: 'users', evidenceRows: rows('Capped unknown', 5) }, [category('allUsers', 'totalUsers', rows('All user', 77)), category('unknownDeviceUsers', 'unknownDevices', rows('Unknown device user', 66))], 66],
        ['email_security', { title: '37 active mailboxes with normal mailflow volume', sourceMetric: 'activeThreats', evidenceRows: rows('Wrong alert', 5) }, [category('mailActivityUsers', 'activeMailboxes', rows('Mailbox', 37, index => ({ readCount: index < 2 ? 0 : 1, sendCount: 0, receiveCount: 0 })))], 37],
        ['email_security', { title: '2 inactive mailboxes identified for cleanup', sourceMetric: 'activeThreats', evidenceRows: rows('Wrong alert', 5) }, [category('mailActivityUsers', 'activeMailboxes', rows('Mailbox', 37, index => ({ readCount: index < 2 ? 0 : 1, sendCount: 0, receiveCount: 0 })))], 2],
        ['cloudflare_network_security', { title: 'Seven enrolled devices are active and registered with WARP profiles', sourceMetric: 'enrolledDevices', evidenceRows: rows('Capped device', 5) }, [category('devices', 'enrolledDevices', rows('WARP device', 7, () => ({ status: 'active' })))], 7],
        ['governance', { title: 'Governance summary shows 12 owner missing counts', sourceMetric: 'governanceScore', evidenceRows: rows('Capped review', 4) }, [category('governanceRows', 'governanceRows', rows('Review', 12, () => ({ ownerStatus: 'missing_or_not_supplied' })))], 12]
    ];
    for (const [domain, finding, categories, count] of cases) {
        const result = serializeFinding(domain, finding, categories);
        assert.equal(result.evidenceCount, count, domain);
        assert.equal(result.evidence.length, count, domain);
        assert.ok(result.evidence.every(row => !row.name.startsWith('Wrong') && !row.name.startsWith('Capped')), domain);
    }
});

test('specific embedded subcategory evidence survives when no catalog category matches', () => {
    const email = serializeFinding('email_security', {
        title: "8 users affected, with 'dave' receiving the most threat alerts",
        sourceMetric: 'activeThreats',
        evidenceRows: ['dave', 'ryan', 'marta', 'ken', 'gary'].map(entityId => ({ entityId, status: 'targeted' }))
    }, [category('alerts', 'alerts', Array.from({ length: 6 }, (_, index) => ({ title: `Alert ${index + 1}` })))]);
    assert.deepEqual(Array.from(email.evidence, row => row.name), ['dave', 'ryan', 'marta', 'ken', 'gary']);

    const repeated = serializeFinding('security_alerts', {
        title: 'Repeated alert patterns indicate persistent risks',
        sourceMetric: 'repeatedAlertPatterns',
        evidenceRows: ['Pattern A', 'Pattern B', 'Pattern C'].map(title => ({ title }))
    }, [category('alerts', 'totalAlerts', Array.from({ length: 15 }, (_, index) => ({ title: `Alert ${index + 1}` })))]);
    assert.deepEqual(Array.from(repeated.evidence, row => row.name), ['Pattern A', 'Pattern B', 'Pattern C']);
});
test('population evidence supports absence and coverage claims without fabricated rows', () => {
    const devices = [
        { deviceName: 'MDM-1', isEncrypted: true, encryptionStatus: 'Encrypted', managementAgent: 'mdm', complianceState: 'compliant' },
        { deviceName: 'MDM-2', isEncrypted: true, encryptionStatus: 'Encrypted', managementAgent: 'mdm', complianceState: 'noncompliant' },
        { deviceName: 'MDM-3', isEncrypted: false, encryptionStatus: 'Not encrypted', managementAgent: 'mdm', complianceState: 'compliant' },
        { deviceName: 'UNKNOWN', isEncrypted: true, encryptionStatus: 'Encrypted', managementAgent: 'unknown', complianceState: 'unknown' }
    ];
    const alerts = [
        { title: 'Low active', severity: 'low', status: 'active' },
        { title: 'Medium resolved', severity: 'medium', status: 'resolved' },
        { title: 'High active', severity: 'high', status: 'active' }
    ];
    const apps = [
        { displayName: 'No access 1', roleCount: 0, scopeCount: 0 },
        { displayName: 'No access 2', roleCount: 0, scopeCount: 0 },
        { displayName: 'Role app', roleCount: 1, scopeCount: 0 },
        { displayName: 'Unknown fields' }
    ];
    const cases = [
        ['devices', 'All 4 devices are encrypted and managed via MDM', 'devices', [category('allDevices', 'totalDevices', devices)], 2, 'totalDevices'],
        ['devices', 'No unmanaged or unknown compliance devices detected', 'devices', [category('allDevices', 'totalDevices', devices)], 3, 'totalDevices'],
        ['email_security', 'No high-severity alerts or active incidents detected', 'activeThreats', [category('alerts', 'alerts', alerts)], 2, 'alerts'],
        ['applications', 'No excessive permission or high-access applications detected', 'excessivePermissionApps', [category('applications', 'applications', apps)], 2, 'excessivePermissionApps']
    ];
    for (const [domainKey, title, sourceMetric, categories, expectedCount, pipelineMetric] of cases) {
        const readFinding = serializeFinding(domainKey, { title, sourceMetric }, categories);
        assert.equal(readFinding.evidenceCount, expectedCount, `${domainKey} read`);
        const domain = ENTERPRISE_DOMAINS.find(item => item.key === domainKey);
        const population = categories[0].entities.map((data, index) => ({ evidenceType: pipelineMetric, sourceMetric: pipelineMetric, data: { entityId: `${domainKey}-${index}`, ...data } }));
        const storedFinding = ensureItemEvidence({ title, sourceMetric }, domain, 1, population);
        assert.equal(storedFinding.affectedEntities.length, expectedCount, `${domainKey} pipeline`);
    }
});

test('compact and report generators expose real metric names and no validation entities', () => {
    const backup = compactBackupEvidenceRows([], { metrics: { backupCoverageScore: 88, servicesCovered: 3 } });
    const governance = compactGovernanceEvidenceRows([
        { evidenceType: 'governanceRows', data: { entityId: 'gov-1', entityName: 'Access review', area: 'Access review', activity: 'Review users', status: 'Attention Required' } }
    ], { metrics: { governanceScore: 72, totalRows: 1, attentionRequiredRows: 1 } });
    const compliance = compactComplianceEvidenceRows([
        { evidenceType: 'controls', data: { entityId: 'ctl-1', entityName: 'MFA control', area: 'Identity', title: 'MFA control', status: 'Failed' } }
    ], { metrics: { complianceScore: 64, totalControls: 1, failingControls: 1 } });
    assert.ok(backup.some(row => row.data?.entityName === 'Backup coverage score' && row.data?.entityType === 'SourceMetric'));
    assert.ok(governance.some(row => row.data?.entityName === 'Governance score' && row.data?.entityType === 'SourceMetric'));
    assert.ok(compliance.some(row => row.data?.entityName === 'Compliance score' && row.data?.entityType === 'SourceMetric'));
    const serviceSource = fs.readFileSync('services/enterprise-intelligence.js', 'utf8');
    const serverSource = fs.readFileSync('server.js', 'utf8');
    const generated = JSON.stringify([backup, governance, compliance]);
    assert.doesNotMatch(`${generated}\n${serviceSource}\n${serverSource}`, /Governance Validation Summary|Compliance Validation Summary|Backup Coverage Validation|0 readable StackCTRL|Evidence item|Current enterprise evidence record/i);
    assert.match(serverSource, /owner missing counts\|governance summary[\s\S]{0,220}catalogEntities\.filter/);
});
test('compact metric generators require explicit finite values and honest readiness counts', () => {
    const sourceMetrics = rows => rows.filter(row => row.data?.entityType === 'SourceMetric');
    assert.deepEqual(compactBackupEvidenceRows([], {}), []);
    assert.deepEqual(compactGovernanceEvidenceRows([], {}), []);
    assert.deepEqual(compactComplianceEvidenceRows([], {}), []);
    assert.deepEqual(compactBackupEvidenceRows([], { metrics: { backupCoverageScore: Infinity } }), []);
    assert.deepEqual(compactGovernanceEvidenceRows([], { metrics: { governanceScore: 'not-a-number' } }), []);
    assert.deepEqual(compactComplianceEvidenceRows([], { metrics: { complianceScore: NaN } }), []);

    const [backupPartial] = sourceMetrics(compactBackupEvidenceRows([], { metrics: { servicesCovered: 3 } }));
    assert.equal(backupPartial.data.metricName, 'servicesCovered');
    assert.equal(backupPartial.data.value, 3);
    assert.equal(backupPartial.data.entityName, 'Services covered');

    const [governancePartial] = sourceMetrics(compactGovernanceEvidenceRows([], { metrics: { attentionRequiredRows: 2 } }));
    assert.equal(governancePartial.data.metricName, 'attentionRequiredRows');
    assert.equal(governancePartial.data.value, 2);
    assert.equal(governancePartial.data.entityName, 'Attention-required rows');

    const [compliancePartial] = sourceMetrics(compactComplianceEvidenceRows([], { metrics: { failingControls: 1 } }));
    assert.equal(compliancePartial.data.metricName, 'failingControls');
    assert.equal(compliancePartial.data.value, 1);
    assert.equal(compliancePartial.data.auditReadinessStatus, 'not_ready');

    const [scoreWithoutCounts] = sourceMetrics(compactComplianceEvidenceRows([], { metrics: { complianceScore: 64 } }));
    assert.equal(scoreWithoutCounts.data.metricName, 'complianceScore');
    assert.equal(Object.hasOwn(scoreWithoutCounts.data, 'auditReadinessStatus'), false);

    const [readyWithCounts] = sourceMetrics(compactComplianceEvidenceRows([], {
        metrics: { totalControls: 4, failingControls: 0, partialControls: 0, manualReviewControls: 0, passingControls: 4 }
    }));
    assert.equal(readyWithCounts.data.auditReadinessStatus, 'ready');
});
test('applicable narrow filter yielding no rows stays honest zero', () => {
    const finding = serializeFinding('applications', { title: 'Unknown publisher applications', sourceMetric: 'externalApps', evidenceRows: [{ displayName: 'Wrong embedded app' }] }, [
        category('applications', 'applications', [{ displayName: 'Known App', publisherName: 'Contoso' }])
    ]);
    assert.equal(finding.evidenceCount, 0);
    assert.deepEqual(Array.from(finding.evidence), []);
    const emptyCategory = serializeFinding('email_security', { title: 'No critical alerts detected', sourceMetric: 'alerts' }, [category('alerts', 'alerts', [])]);
    assert.equal(emptyCategory.evidenceCount, 0);
    const legacyLabel = ['Backup', 'Coverage', 'Validation'].join(' ');
    const legacyBackup = serializeFinding('backup', { title: 'Full backup coverage achieved', sourceMetric: 'backupCoverageGaps', evidenceRows: [{ entityName: legacyLabel, entityType: 'CoverageSummary' }] }, []);
    assert.equal(legacyBackup.evidenceCount, 0);
    const backupDomain = ENTERPRISE_DOMAINS.find(item => item.key === 'backup');
    const normalizedLegacy = ensureItemEvidence({ title: 'Full backup coverage achieved', affectedEntities: [{ entityName: legacyLabel }], evidenceRows: [{ entityName: legacyLabel }] }, backupDomain, 1, []);
    assert.equal(normalizedLegacy.affectedEntities.length, 0);
    assert.equal(normalizedLegacy.evidenceRows.length, 0);
    assert.doesNotMatch(JSON.stringify([finding, emptyCategory]), /validation summary|0 readable StackCTRL|Evidence item|Current enterprise evidence record/i);
});

test('frontend rejects blank and opaque rows but accepts readable username IDs', () => {
    const source = fs.readFileSync('js/clientportal.js', 'utf8');
    const start = source.indexOf('function unwrapSunbirdEvidenceRow(item) {');
    const end = source.indexOf('function getSunbirdDomainFindingEvidenceRows(finding = {}) {', start);
    const helpers = vm.runInNewContext(`${source.slice(start, end)}; ({ normalizeSunbirdLiveEvidenceRows, applySunbirdDomainEvidenceState });`, {
        isSunbirdTechnicalNoiseText: () => false,
        formatSunbirdReportDate: String,
        Intl
    });
    const opaque = helpers.normalizeSunbirdLiveEvidenceRows([{}, { id: 42 }, { entityId: '9f6c0fb1-81cc-4e4d-a62d-75e624f45544' }, { internalSourcePath: 'identity.evidence[0]' }]);
    assert.equal(opaque.length, 0);
    const readable = helpers.normalizeSunbirdLiveEvidenceRows([{ entityId: 'dave', status: 'active' }, { entityId: 'ryan', status: 'active' }]);
    assert.deepEqual(Array.from(readable, row => row.title), ['dave', 'ryan']);
    assert.equal(helpers.applySunbirdDomainEvidenceState(readable, []).count, 2);
    assert.deepEqual(helpers.applySunbirdDomainEvidenceState(readable, [], true).rows, readable);
});

test('future pipeline uses semantic categories across all nine domains', () => {
    const cases = [
        ['identity', 'Five users with multiple privileged roles', 'users', 'privilegedUsers', [{ entityId: 'gary', displayName: 'Gary Norton', roles: ['Global Administrator', 'Security Administrator'] }, { entityId: 'break', displayName: 'Break Glass', roles: ['Global Administrator'] }], ['gary']],
        ['devices', 'Non-compliant devices', 'devices', 'nonCompliantDevices', [{ entityId: 'bad-1', deviceName: 'BAD-1', complianceState: 'nonCompliant' }], ['bad-1']],
        ['email_security', 'Active phishing alerts', 'activeThreats', 'alerts', [{ entityId: 'mail-1', title: 'Phish', status: 'active' }], ['mail-1']],
        ['security_alerts', 'Anonymous IP sign-in pattern', 'activeThreats', 'anonymousIpEvents', [{ entityId: 'ip-1', ipAddress: '203.0.113.1' }], ['ip-1']],
        ['cloudflare_network_security', 'Gateway policies block threats', 'protectedApps', 'gatewayPolicies', [{ entityId: 'rule-1', name: 'Block malware' }], ['rule-1']],
        ['applications', 'Excessive application permissions', 'externalApps', 'excessivePermissionApps', [{ entityId: 'app-1', displayName: 'Mail Exporter' }], ['app-1']],
        ['backup', 'Large data holders', 'backupCoverageGaps', 'topStorageUsers', [{ entityId: 'user-1', displayName: 'Large User', storage: 10 }], ['user-1']],
        ['governance', 'Missing ownership on governance items', 'governanceScore', 'governanceRows', [{ entityId: 'gov-1', title: 'Owner review', ownerStatus: 'Missing' }], ['gov-1']],
        ['compliance', 'Critical identity control failures', 'complianceScore', 'totalControls', [{ entityId: 'ctl-1', controlName: 'Identity MFA', area: 'Identity', complianceStatus: 'Failed' }], ['ctl-1']]
    ];
    for (const [key, title, sourceMetric, evidenceType, values, expectedIds] of cases) {
        const domain = ENTERPRISE_DOMAINS.find(item => item.key === key);
        const available = values.map(data => ({ evidenceType, sourceMetric: evidenceType, data }));
        const result = ensureItemEvidence({
            title,
            sourceMetric,
            affectedEntities: [{ entityId: 'wrong-link', entityName: 'Wrong linked row' }],
            evidenceRows: [{ entityId: 'wrong-link', entityName: 'Wrong linked row' }]
        }, domain, 1, available);
        assert.deepEqual(result.affectedEntities.map(row => row.entityId), expectedIds, key);
        assert.equal(result.sourceMetric, evidenceType, key);
    }
});