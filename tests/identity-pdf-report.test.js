const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIdentityPdfViewModel } = require('../services/intelligence/identity-pdf-report');

test('buildIdentityPdfViewModel surfaces executive identity metrics and evidence-backed findings', () => {
  const viewModel = buildIdentityPdfViewModel({
    domainKey: 'identity',
    domainName: 'Identity Protection',
    intelligenceOutput: {
      domainExecutiveSummary: 'Privileged accounts need immediate remediation.',
      businessImpact: 'A compromised privileged account could disable tenant controls.',
      summary: {
        totalUsers: 42,
        mfaEnabledPercentage: 68,
        highRiskUsers: 7,
        privilegedUsersWithoutMFA: 3,
        activeUsers24h: 31,
        identityRiskScore: 82
      },
      keyFindings: [{
        title: 'Global Administrator account without MFA',
        severity: 'critical',
        businessImpact: 'This account has unrestricted administrative access.',
        recommendation: 'Enable MFA immediately.',
        affectedEntities: [{
          displayName: 'Alicia Jones',
          userPrincipalName: 'alicia@company.com',
          roles: ['Global Administrator'],
          mfaEnabled: false,
          riskLevel: 'High',
          accountStatus: 'Enabled',
          lastSignIn: { dateTime: '2026-06-24T09:00:00.000Z', daysSince: 31 },
          device: 'LAPTOP-1',
          location: 'Johannesburg, South Africa'
        }],
        evidenceRows: [{
          displayName: 'Alicia Jones',
          userPrincipalName: 'alicia@company.com',
          roles: ['Global Administrator'],
          mfaEnabled: false,
          riskLevel: 'High',
          accountStatus: 'Enabled',
          lastSignIn: { dateTime: '2026-06-24T09:00:00.000Z', daysSince: 31 },
          device: 'LAPTOP-1',
          location: 'Johannesburg, South Africa'
        }]
      }],
      recommendations: [{ title: 'Enable MFA immediately.' }]
    }
  });

  assert.equal(viewModel.summary.title, 'Identity Protection');
  assert.equal(viewModel.summary.metrics.mfaCoverage, 68);
  assert.equal(viewModel.summary.metrics.highRiskUsers, 7);
  assert.equal(viewModel.summary.metrics.privilegedUsersWithoutMFA, 3);
  assert.equal(viewModel.findings[0].title, 'Global Administrator account without MFA');
  assert.equal(viewModel.findings[0].severity, 'critical');
  assert.ok(viewModel.findings[0].recommendations.includes('Enable MFA immediately.'));
  assert.equal(viewModel.findings[0].evidence.rows.length, 1);
  assert.deepEqual(viewModel.findings[0].evidence.columns, ['Name', 'Email', 'Role(s)', 'MFA Enabled', 'Risk Level', 'Account Status', 'Last Sign In', 'Days Since Last Sign In', 'Device', 'Location']);
});
