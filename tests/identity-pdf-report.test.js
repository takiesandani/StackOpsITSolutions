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
  assert.deepEqual(viewModel.findings[0].evidence.columns, ['Name', 'Email', 'MFA', 'Risk', 'Last Sign In', 'Days Inactive', 'Device', 'Location']);
});

test('buildIdentityPdfViewModel reuses processed identity dashboard metrics when provided', () => {
  const viewModel = buildIdentityPdfViewModel({
    domainKey: 'identity',
    domainName: 'Identity Protection',
    identityModel: {
      metrics: {
        totalUsers: 120,
        mfaCoverage: 79,
        highRiskUsers: 12,
        privilegedUsersWithoutMFA: 4,
        missingMfaUsers: 25,
        unknownDevices: 8,
        signInIssues: 10
      },
      evidence: {
        mfaMissingUsers: [{ displayName: 'Nina Grey', userPrincipalName: 'nina@company.com', mfaEnabled: false, riskLevel: 'High' }],
        highRiskUsers: [{ displayName: 'Owen Price', userPrincipalName: 'owen@company.com', mfaEnabled: false, riskLevel: 'High' }],
        adminsWithoutMfa: [{ displayName: 'Riley Chen', userPrincipalName: 'riley@company.com', mfaEnabled: false, riskLevel: 'High' }],
        unknownDeviceUsers: [{ displayName: 'Mina Park', userPrincipalName: 'mina@company.com', lastSignIn: { device: 'Unknown' } }],
        failedSignInUsers: [{ displayName: 'Jules Ford', userPrincipalName: 'jules@company.com', lastSignIn: { status: 'Failed' } }]
      },
      summary: {
        title: 'Identity Protection',
        executiveSummary: 'Identity hygiene remains a priority for privileged and dormant accounts.'
      }
    }
  });

  assert.equal(viewModel.summary.metrics.mfaCoverage, 79);
  assert.equal(viewModel.summary.metrics.highRiskUsers, 12);
  assert.equal(viewModel.summary.metrics.privilegedUsersWithoutMFA, 4);
  assert.ok(viewModel.findings.some(finding => finding.title.includes('Missing MFA')));
  assert.ok(viewModel.findings.some(finding => finding.title.includes('High Risk')));
});

test('buildIdentityPdfViewModel filters evidence per finding and uses domain-level recommendations and business impact', () => {
  const viewModel = buildIdentityPdfViewModel({
    domainKey: 'identity',
    domainName: 'Identity Protection',
    intelligenceOutput: {
      domainExecutiveSummary: 'Privileged accounts and inactive sign-ins need urgent remediation.',
      businessImpact: 'The organisation faces increased risk of credential misuse and operational disruption.',
      recommendations: [{ title: 'Enforce phishing-resistant MFA for all privileged accounts.' }],
      keyFindings: [{
        title: 'Missing MFA',
        severity: 'High',
        businessImpact: 'Unprotected users increase the likelihood of account takeover.',
        affectedEntities: [{ displayName: 'Alicia Jones', userPrincipalName: 'alicia@company.com', mfaEnabled: false }],
        evidenceRows: [{ displayName: 'Alicia Jones', userPrincipalName: 'alicia@company.com', mfaEnabled: false }]
      }]
    },
    identityModel: {
      metrics: {
        totalUsers: 100,
        mfaCoverage: 79,
        highRiskUsers: 12,
        privilegedUsersWithoutMFA: 4,
        missingMfaUsers: 20,
        unknownDevices: 47,
        signInIssues: 58
      },
      evidence: {
        mfaMissingUsers: [{ displayName: 'Nina Grey', userPrincipalName: 'nina@company.com', mfaEnabled: false }],
        highRiskUsers: [{ displayName: 'Owen Price', userPrincipalName: 'owen@company.com', riskLevel: 'High' }],
        unknownDeviceUsers: [{ displayName: 'Mina Park', userPrincipalName: 'mina@company.com', lastSignIn: { device: 'Unknown' } }],
        failedSignInUsers: [{ displayName: 'Jules Ford', userPrincipalName: 'jules@company.com', lastSignIn: { status: 'Failed' } }],
        privilegedUsers: [{ displayName: 'Riley Chen', userPrincipalName: 'riley@company.com', roles: ['Global Administrator'] }]
      },
      summary: {
        title: 'Identity Protection',
        executiveSummary: 'Identity hygiene remains a priority for privileged and dormant accounts.'
      }
    }
  });

  assert.equal(viewModel.summary.executiveSummary, 'Privileged accounts and inactive sign-ins need urgent remediation.');
  assert.equal(viewModel.summary.businessImpact, 'The organisation faces increased risk of credential misuse and operational disruption.');
  assert.equal(viewModel.findings[0].businessImpact, 'Unprotected users increase the likelihood of account takeover.');
  assert.ok(viewModel.findings[0].recommendations.includes('Enforce phishing-resistant MFA for all privileged accounts.'));
  assert.equal(viewModel.findings[0].evidence.rows[0]['Name'], 'Alicia Jones');
  assert.equal(viewModel.findings[0].evidence.rows.length, 1);
});
