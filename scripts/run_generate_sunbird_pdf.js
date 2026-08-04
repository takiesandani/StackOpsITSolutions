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
                },
                {
                    domainKey: 'email_security',
                    domainName: 'Email Security',
                    intelligenceOutput: {
                        authoritativeScores: { healthScore: 75, riskScore: 25, riskLevel: 'moderate' },
                        domainExecutiveSummary: 'Email security is operating normally with five active low-severity, user-reported alerts. No high-severity malware, phishing, spam, or business email compromise incidents were identified.',
                        businessImpact: 'Repeated user-reported alerts can add operational workload and make genuine threats harder to recognize without mailbox review and user training.',
                        risks: [{
                            title: 'Repeated low-severity user-reported email alerts require review',
                            severity: 'moderate',
                            impact: 'moderate',
                            description: 'Five active low-severity alerts were reported by users as junk or not junk email.',
                            whyItMatters: 'Repeated reports can indicate a training, classification, or mailbox-risk pattern that needs review.',
                            firstAction: 'Review alert details and affected mailbox activity for the eight repeatedly targeted users.'
                        }],
                        keyFindings: [{
                            title: '36 active mailboxes have normal mail activity',
                            description: 'Thirty-six active mailboxes processed normal mail activity during the reporting period.',
                            firstAction: 'Review two inactive mailboxes for deactivation or ownership confirmation.'
                        }],
                        evidenceCatalog: {
                            categories: [{
                                key: 'alerts', sourceMetric: 'alerts', count: 5,
                                entities: [
                                    { id: 'alert-1', title: 'Email reported by user as junk', sender: 'Unknown sender', recipient: 'ryan', severity: 'low', status: 'newalert', created: '2026-06-30T11:15:00Z', source: 'Office 365 Security and Compliance' },
                                    { id: 'alert-2', title: 'Email reported by user as not junk', sender: 'Unknown sender', recipient: 'gary', severity: 'low', status: 'newalert', created: '2026-06-30T11:10:00Z', source: 'Office 365 Security and Compliance' }
                                ]
                            }, {
                                key: 'mailActivityUsers', sourceMetric: 'activeMailboxes', count: 36,
                                entities: [{ id: 'mailbox-1', title: 'Active mailbox activity', recipient: 'ryan', status: 'active', source: 'Microsoft 365 mail activity' }]
                            }]
                        }
                    }
                },
                {
                    domainKey: 'cloudflare_network_security',
                    domainName: 'Network Security / Cloudflare',
                    intelligenceOutput: {
                        authoritativeScores: { healthScore: 78, riskScore: 22, riskLevel: 'low' },
                        domainExecutiveSummary: 'Cloudflare network security has active gateway protections, DLP profiles, protected applications, and registered WARP devices. Audit log and API permission evidence gaps limit event-level analysis.',
                        businessImpact: 'Maintained gateway and DLP controls protect sensitive data and roaming users. Completing audit and permission evidence improves detection, response, and access risk management.',
                        risks: [{
                            title: 'Audit log raw evidence gap limits event-level visibility',
                            severity: 'high',
                            impact: 'high',
                            description: 'Cloudflare audit log coverage is present, but raw audit event evidence is not currently available for detailed analysis.',
                            whyItMatters: 'Missing raw audit events limits incident detection and forensic investigation.',
                            firstAction: 'Obtain raw audit log data for event-level analysis.'
                        }, {
                            title: 'Inactive Do Not Inspect gateway policy may allow uninspected traffic',
                            severity: 'medium',
                            impact: 'medium',
                            description: 'The Do Not Inspect gateway policy is configured with its action set to off.',
                            whyItMatters: 'The policy should be reviewed to confirm its intended traffic inspection behavior.',
                            firstAction: 'Review the Do Not Inspect gateway policy status.'
                        }],
                        keyFindings: [{
                            title: 'Three enrolled devices are active and registered with WARP profiles',
                            description: 'The enrolled device fleet is active and protected through registered WARP profiles.',
                            firstAction: 'Maintain the current device enrollment and WARP profile coverage.'
                        }, {
                            title: 'Two DLP profiles protect sensitive data',
                            description: 'DLP profiles target financial and sensitive personal information.',
                            firstAction: 'Review DLP profile coverage and policy updates regularly.'
                        }],
                        evidenceCatalog: {
                            categories: [{
                                key: 'devices', sourceMetric: 'enrolledDevices', count: 3,
                                entities: [{ id: 'device-1', name: 'DaveLenovo', entityType: 'WARP device', status: 'active', assignedUser: 'dave@example.com' }]
                            }, {
                                key: 'gatewayRules', sourceMetric: 'gatewayPolicies', count: 3,
                                entities: [{ id: 'rule-1', name: 'Do Not Inspect', entityType: 'Gateway policy', action: 'off', enabled: true }]
                            }, {
                                key: 'dlpProfiles', sourceMetric: 'dlpProfiles', count: 2,
                                entities: [{ id: 'dlp-1', name: 'Financial information', entityType: 'DLP profile', status: 'active' }]
                            }, {
                                key: 'accessApps', sourceMetric: 'protectedApps', count: 2,
                                entities: [{ id: 'app-1', name: 'SSO App', entityType: 'Protected application', status: 'active' }]
                            }]
                        }
                    }
                },
                {
                    domainKey: 'applications',
                    domainName: 'Applications',
                    intelligenceOutput: {
                        authoritativeScores: { healthScore: 87, riskScore: 13, riskLevel: 'low' },
                        domainExecutiveSummary: 'Application governance is generally healthy, but the application inventory consists of external applications with unknown publishers and no assigned users. Ownership and publisher trust require review.',
                        businessImpact: 'Unverified external applications can create consent, vendor, and data-access exposure. Establishing ownership and trusted publishers reduces compliance and leakage risk.',
                        risks: [{
                            title: 'External applications with unknown publishers and no assigned users',
                            severity: 'medium',
                            impact: 'medium',
                            description: 'The inventory includes external applications with unverified publishers and no assigned users.',
                            whyItMatters: 'Unknown publishers and unclear ownership can expose tenant data through unmanaged consent and vendor relationships.',
                            firstAction: 'Review application ownership, publisher trust, permissions, assignments, and ongoing business need.'
                        }],
                        keyFindings: [{
                            title: 'No excessive permissions or high-access applications detected',
                            description: 'The current inventory does not identify excessive permission scopes or high-access applications.',
                            firstAction: 'Implement ongoing monitoring and ownership assignment for external applications.'
                        }],
                        evidenceCatalog: {
                            categories: [{
                                key: 'applications', sourceMetric: 'applications', count: 100,
                                entities: [
                                    { id: 'app-1', name: 'Microsoft Intune SCCM Connector', type: 'External', isExternal: true, publisherName: 'Unknown', userCount: 0, roleCount: 0, scopeCount: 0, createdDateTime: '2022-04-04T15:30:52Z' },
                                    { id: 'app-2', name: 'External Reporting Application', type: 'External', isExternal: true, publisherName: 'Unknown', userCount: 0, roleCount: 0, scopeCount: 0, createdDateTime: '2023-10-14T09:00:00Z' }
                                ]
                            }]
                        }
                    }
                },
                {
                    domainKey: 'security_alerts',
                    domainName: 'Security Alerts',
                    intelligenceOutput: {
                        authoritativeScores: { healthScore: 0, riskScore: 100, riskLevel: 'critical' },
                        domainExecutiveSummary: 'No critical alerts are active, but persistent anonymous IP sign-ins and unresolved email threat-management alerts require investigation and containment.',
                        businessImpact: 'Unresolved anonymous IP sign-ins and email threats can lead to unauthorized access, phishing exposure, and potential data breaches that interrupt operational continuity.',
                        risks: [{
                            title: 'Unresolved anonymous IP sign-ins',
                            severity: 'medium',
                            description: 'Anonymous IP sign-in patterns remain unresolved and require investigation.',
                            whyItMatters: 'Anonymous network activity can indicate attempted unauthorized access or account compromise.',
                            firstAction: 'Investigate and contain unresolved anonymous IP sign-ins to prevent unauthorized access.'
                        }, {
                            title: 'Unresolved email threat-management alerts',
                            severity: 'low',
                            description: 'Email threat-management alerts remain open for review.',
                            whyItMatters: 'Unresolved mail alerts can allow phishing or malicious content to persist.',
                            firstAction: 'Review and enhance email filtering policies and user training.'
                        }],
                        keyFindings: [{
                            title: 'Six unresolved alerts remain across the alert inventory',
                            description: 'Six unresolved alerts remain, primarily medium and low severity.',
                            firstAction: 'Confirm resolution quality and suppress recurring alert patterns after investigation.'
                        }, {
                            title: 'Threat indicators support alert and user correlation',
                            description: 'Available indicators can be correlated with affected alerts and users for improved detection.',
                            firstAction: 'Correlate threat indicators with affected alerts and users.'
                        }],
                        evidenceCatalog: {
                            categories: [{
                                key: 'alerts', sourceMetric: 'totalAlerts', count: 16,
                                entities: [{ id: 'alert-1', title: 'Anonymous IP address', user: 'Unknown user', source: 'IPC', status: 'resolved', category: 'AnonymousLogin', severity: 'medium', created: '2026-06-15T12:47:06.88333Z' }]
                            }, {
                                key: 'signIns', sourceMetric: 'signIns', count: 1,
                                entities: [{ id: 'signin-1', user: 'brandon@sunbird.eu', status: 'Failed', location: 'Lisboa, PT', ipAddress: '213.13.6.176', timestamp: '2026-06-30T15:54:38Z', failureReason: "This occurred due to 'Keep me signed in' interrupt when the user was signing in." }]
                            }, {
                                key: 'threatIndicators', sourceMetric: 'threatIndicators', count: 25,
                                entities: [{ id: 'indicator-1', indicator: 'Anonymous IP', indicatorType: 'ThreatKeyword', severity: 'medium', confidence: 'medium', action: 'Review', occurrenceCount: 22, relatedUsers: ['Unknown user'] }]
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
