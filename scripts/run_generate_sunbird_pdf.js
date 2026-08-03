const fs = require('fs');
const path = require('path');

// Require server.js as a module (server startup is guarded by require.main)
const { generateSunbirdReportPdf } = require('../server');

async function run() {
    const report = {
        companyName: 'Example Co',
        period: { start: new Date(Date.now() - 7 * 24 * 3600 * 1000), end: new Date() },
        summary: { healthScore: 72, failures: 3, successes: 8, totalEvents: 24, activeIncidents: 1, highSeverityAlerts: 0 },
        analysis: { executiveSummary: 'This is a generated sample executive summary for testing evidence rendering.' },
        domainInsights: {
            domains: [
                {
                    domainKey: 'identity',
                    domainName: 'Identity Protection',
                    intelligenceOutput: {
                        authoritativeScores: { healthScore: 72, riskScore: 28, riskLevel: 'moderate' },
                        domainExecutiveSummary: 'Most identities have healthy access controls, with MFA enrollment and privileged-account remediation still required.',
                        businessImpact: 'A compromised privileged identity could allow broad access to the tenant and interrupt business operations before the activity is detected.',
                        risks: [{
                            title: 'Break-glass account is missing MFA',
                            severity: 'High',
                            description: 'A privileged emergency access account is not protected by multi-factor authentication.',
                            firstAction: 'Require MFA for the break-glass account and validate the recovery process.'
                        }],
                        keyFindings: [{
                            title: 'Privileged users have multiple roles and MFA gaps',
                            severity: 'High',
                            description: 'Five privileged users have multiple privileged roles, increasing risk exposure. One privileged user lacks MFA.',
                            impact: 'Compromise of these accounts could lead to broad access and control.',
                            whyItMatters: 'Privileged roles can change tenant-wide settings and expose sensitive business data.',
                            firstAction: 'Require MFA for every privileged account, review each privileged role assignment, and remove roles that are not required.'
                        }],
                        evidenceCatalog: {
                            categories: [
                                {
                                    key: 'allUsers',
                                    label: 'All users',
                                    sourceMetric: 'totalUsers',
                                    count: 58,
                                    entities: [{
                                        entityName: 'Break-glass account',
                                        entityEmail: 'admin@example.com',
                                        roles: ['Global Administrator'],
                                        mfaEnabled: false,
                                        riskLevel: 'HIGH',
                                        lastSignIn: { daysSince: 999, location: 'Unknown', device: 'Unknown', status: 'inactive' }
                                    }]
                                },
                                {
                                    key: 'usersWithoutMfa',
                                    label: 'Users without MFA',
                                    sourceMetric: 'mfaMissing',
                                    count: 12,
                                    entities: [{ entityName: 'Break-glass account', entityEmail: 'admin@example.com', roles: ['Global Administrator'], mfaEnabled: false, riskLevel: 'HIGH' }]
                                },
                                {
                                    key: 'privilegedUsers',
                                    label: 'Privileged users',
                                    sourceMetric: 'privilegedUsers',
                                    count: 6,
                                    entities: [
                                        { entityName: 'Brandon Cunningham', entityEmail: 'brandon@example.com', roles: ['SharePoint Administrator', 'Teams Administrator'], mfaEnabled: true, riskLevel: 'SAFE' },
                                        { entityName: 'Dave Colley', entityEmail: 'dave@example.com', roles: ['Global Administrator', 'Security Administrator'], mfaEnabled: true, riskLevel: 'SAFE' },
                                        { entityName: 'Gary Norton', entityEmail: 'gary@example.com', roles: ['User Administrator', 'Exchange Administrator'], mfaEnabled: true, riskLevel: 'SAFE' },
                                        { entityName: 'Ken Ross', entityEmail: 'ken@example.com', roles: ['Global Administrator', 'Fabric Administrator'], mfaEnabled: true, riskLevel: 'SAFE' },
                                        { entityName: 'StackOpsIT - Ndamulelo Sandani', entityEmail: 'stackopsit@example.com', roles: ['Global Administrator', 'Billing Administrator'], mfaEnabled: true, riskLevel: 'SAFE' },
                                        { entityName: 'Extra privileged account', entityEmail: 'extra@example.com', roles: ['Security Administrator'], mfaEnabled: true, riskLevel: 'SAFE' }
                                    ]
                                },
                                { key: 'adminsWithoutMfa', label: 'Administrators without MFA', sourceMetric: 'adminsWithoutMfa', count: 1 },
                                { key: 'highRiskUsers', label: 'High-risk users', sourceMetric: 'highRiskUsers', count: 1 },
                                { key: 'inactiveUsers', label: 'Inactive users', sourceMetric: 'inactiveUsers', count: 36 }
                            ]
                        }
                    }
                },
                {
                    domainKey: 'devices',
                    domainName: 'Device Protection',
                    intelligenceOutput: {
                        authoritativeScores: { healthScore: 83, riskScore: 17, riskLevel: 'low' },
                        domainExecutiveSummary: 'The Device Protection domain manages 17 devices with 76% compliance and full encryption coverage. Three non-compliant devices require immediate remediation.',
                        businessImpact: 'Failure to remediate non-compliant stale devices increases the risk of data breaches, regulatory non-compliance, and operational disruption.',
                        risks: [{
                            title: 'Non-compliant devices stale or dead over 30 days with assigned users',
                            severity: 'critical',
                            impact: 'High',
                            description: 'Three devices are non-compliant and have not synced for over 30 days with active user assignments.',
                            whyItMatters: 'Non-compliance combined with stale sync means security controls may not be applied.',
                            firstAction: 'Initiate remediation or device retirement for non-compliant stale devices'
                        }, {
                            title: 'Device with unknown compliance and stale sync',
                            severity: 'high',
                            impact: 'Medium',
                            description: 'LAPTOP-HNCQT3U1 has unknown compliance state and last synced 234 days ago.',
                            whyItMatters: 'Potential policy gaps and security exposure.',
                            firstAction: 'Investigate device compliance and sync status'
                        }],
                        evidenceCatalog: {
                            categories: [{
                                key: 'nonCompliantDevices',
                                sourceMetric: 'nonCompliantDevices',
                                count: 3,
                                entities: [
                                    { deviceName: 'DEAN', userPrincipalName: 'dean@example.com', operatingSystem: 'Windows', osVersion: '10.0.22631.5189', complianceState: 'noncompliant', encryptionStatus: 'Encrypted', managementAgent: 'mdm', lastSyncDateTime: '2025-05-02T06:58:53Z', serialNumber: 'GT22T14' },
                                    { deviceName: 'LAPTOP-HNCQT3U1', userPrincipalName: 'dave@example.com', operatingSystem: 'Windows', osVersion: '10.0.26100.6584', complianceState: 'unknown', encryptionStatus: 'Encrypted', managementAgent: 'mdm', lastSyncDateTime: '2025-11-08T15:05:47Z', serialNumber: 'M9N0LP00F69336' },
                                    { deviceName: 'DESKTOP-HEM6JNN', userPrincipalName: 'user@example.com', operatingSystem: 'Windows', osVersion: '10.0.22631.5189', complianceState: 'noncompliant', encryptionStatus: 'Encrypted', managementAgent: 'mdm', lastSyncDateTime: '2025-04-30T10:12:00Z', serialNumber: 'H3M6JNN' }
                                ]
                            }, {
                                key: 'unknownDevices',
                                sourceMetric: 'unknownDevices',
                                count: 1,
                                entities: [{ deviceName: 'LAPTOP-HNCQT3U1', userPrincipalName: 'dave@example.com', operatingSystem: 'Windows', complianceState: 'unknown', encryptionStatus: 'Encrypted', managementAgent: 'mdm', lastSyncDateTime: '2025-11-08T15:05:47Z', serialNumber: 'M9N0LP00F69336' }]
                            }]
                        }
                    }
                }
            ]
        },
        finalSynthesis: {},
        failures: [],
        successes: [],
        recommendations: [],
        events: []
    };

    try {
        const pdf = await generateSunbirdReportPdf(report, 9999);
        const out = path.join(__dirname, '..', 'test-sunbird-report-generated.pdf');
        fs.writeFileSync(out, pdf);
        console.log('Generated PDF:', out);
    } catch (err) {
        console.error('PDF generation failed:', err);
        process.exit(1);
    }
}

run().then(() => process.exit(0));
