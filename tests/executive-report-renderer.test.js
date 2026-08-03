const test = require('node:test');
const assert = require('node:assert/strict');
const { buildExecutiveReportSections } = require('../services/executive-report-renderer');

test('buildExecutiveReportSections creates standardized findings from intelligence output', () => {
    const report = {
        summary: {
            riskScore: 88,
            healthScore: 74,
            totalUsers: 420,
            protected: 310
        },
        trend: {
            mfaCoverage: 81,
            mfaCoverageDelta: 6,
            riskScore: 44,
            riskScoreDelta: -3
        },
        domainInsights: {
            domains: [{
                domainName: 'Identity',
                intelligenceOutput: {
                    risks: [{
                        title: 'Password-only auth remains available',
                        description: 'Privileged accounts can sign in without MFA and create a high-risk authentication path.',
                        impact: 'Attackers can exploit weak sign-in controls to reach sensitive systems quickly.',
                        affectedEntities: [{
                            entityEmail: 'admin@example.com',
                            displayName: 'Admin User',
                            roles: 'Global Administrator,Security Administrator',
                            mfaEnabled: false,
                            lastSignIn: {
                                device: 'Windows 11',
                                location: 'Johannesburg',
                                dateTime: '2026-08-01T09:25:00.000Z'
                            },
                            riskLevel: 'CRIT'
                        }],
                        recommendations: ['Require phishing-resistant MFA', 'Disable password-only authentication'],
                        severity: 'HIGH'
                    }],
                    keyFindings: [{
                        title: 'MFA adoption is improving',
                        description: 'The tenant has expanded MFA coverage over the reporting window.',
                        impact: 'Coverage improvement lowers the chance of account compromise from password-only access.',
                        affectedEntities: [],
                        recommendations: ['Monitor rollout progress'],
                        severity: 'LOW'
                    }]
                }
            }]
        }
    };

    const sections = buildExecutiveReportSections(report);

    assert.equal(sections.header.riskScore, 88);
    assert.equal(sections.header.healthScore, 74);
    assert.equal(sections.header.totalUsers, 420);
    assert.equal(sections.header.protected, 310);
    assert.equal(sections.trends.mfaCoverage, 81);
    assert.equal(sections.findings.length, 2);
    assert.equal(sections.findings[0].title, 'Password-only auth remains available');
    assert.equal(sections.findings[0].recommendations.length, 2);
    assert.equal(sections.findings[0].affectedAssets[0].who, 'admin@example.com');
    assert.equal(sections.findings[0].affectedAssets[0].status, '[ UNEQUIPPED ]');
    assert.equal(sections.findings[0].affectedAssets[0].risk, '[ CRIT ]');
    assert.match(sections.findings[0].evidenceSummary, /1 affected asset/i);
});
