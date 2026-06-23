const { isApiConnectedGovernanceRow, isApiSourcedComplianceControl, isApiSourcedOperationsTask } = require('../services/intelligence/api-evidence-filters');
const { buildGovernanceDashboardPayload } = require('../services/intelligence/governance-dashboard-processor');
const { deriveGovernanceEvidence } = require('../services/intelligence/governance-evidence-store');
const { buildComplianceDashboardPayload } = require('../services/intelligence/compliance-dashboard-processor');
const { deriveComplianceEvidence } = require('../services/intelligence/compliance-evidence-store');
const { buildOperationsDashboardPayload } = require('../services/intelligence/operations-dashboard-processor');
const { deriveOperationsEvidence } = require('../services/intelligence/operations-evidence-store');

const test = require('node:test');
const assert = require('node:assert/strict');

test('governance evidence excludes manual attestation rows from Azure input', () => {
    const payload = buildGovernanceDashboardPayload({
        payload: {
            success: true,
            rows: [
                { area: 'Access review', activity: 'Review users', dataSource: 'Microsoft Graph users', connected: true, status: 'Connected' },
                { area: 'AI review', activity: 'AI policy', dataSource: 'Manual attestation', connected: false, status: 'Manual Review Required' },
                { area: 'MFA audit', activity: 'Identity check', dataSource: 'Microsoft Graph authentication methods', connected: true, status: 'Attention Required' }
            ]
        }
    });
    const evidence = deriveGovernanceEvidence(payload);
    assert.equal(evidence.evidenceRows.length, 2);
    assert.equal(evidence.dashboardMetrics.apiConnectedRows, 2);
    assert.equal(evidence.dashboardMetrics.manualRowsExcluded, 1);
    assert.equal(evidence.omittedRecordCount, 1);
    assert.equal(evidence.isComplete, true);
});

test('compliance evidence excludes manual attestation controls from Azure input', () => {
    const payload = buildComplianceDashboardPayload({
        payload: {
            success: true,
            controls: [
                { name: 'MFA on all accounts', area: 'Identity', insight: '🟢 MFA fully enforced', evidenceData: { total_users: 10 } },
                { name: 'Password manager enforced', area: 'Credentials', insight: '🔴 Credential sprawl risk', evidenceData: { data_source: 'Manual Attestation / Configuration' } }
            ]
        }
    });
    const evidence = deriveComplianceEvidence(payload);
    assert.equal(evidence.evidenceRows.length, 1);
    assert.equal(evidence.dashboardMetrics.apiControls, 1);
    assert.equal(evidence.dashboardMetrics.manualControlsExcluded, 1);
    assert.equal(evidence.isComplete, true);
});

test('operations evidence excludes manual configuration tasks such as 1Password from Azure input', () => {
    const payload = buildOperationsDashboardPayload({
        payload: {
            success: true,
            tasks: [
                { task: 'Complete MFA rollout', area: 'Identity', priority: 'High', dataSource: 'Microsoft Graph authentication methods' },
                { task: 'Deploy 1Password', area: 'Credentials', priority: 'High', dataSource: 'Manual configuration review' },
                { task: 'Enable DNS filtering', area: 'Network', priority: 'High', dataSource: 'Manual configuration review' }
            ]
        }
    });
    const evidence = deriveOperationsEvidence(payload);
    assert.equal(evidence.evidenceRows.length, 1);
    assert.equal(evidence.dashboardMetrics.apiTasks, 1);
    assert.equal(evidence.dashboardMetrics.manualTasksExcluded, 2);
    assert.equal(evidence.isComplete, true);
});

test('api evidence filters identify manual-only records', () => {
    assert.equal(isApiConnectedGovernanceRow({ connected: true, dataSource: 'Microsoft Graph users' }), true);
    assert.equal(isApiConnectedGovernanceRow({ connected: false, dataSource: 'Manual attestation' }), false);
    assert.equal(isApiSourcedComplianceControl({ evidenceData: { data_source: 'Manual Attestation / Configuration' } }), false);
    assert.equal(isApiSourcedOperationsTask({ dataSource: 'Manual configuration review' }), false);
    assert.equal(isApiSourcedOperationsTask({ dataSource: 'Microsoft Graph sign-in logs' }), true);
});
