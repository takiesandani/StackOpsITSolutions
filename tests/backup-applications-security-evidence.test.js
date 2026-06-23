const { buildBackupDashboardPayload } = require('../services/intelligence/backup-dashboard-processor');
const { deriveBackupEvidence } = require('../services/intelligence/backup-evidence-store');
const { buildApplicationsDashboardPayload } = require('../services/intelligence/applications-dashboard-processor');
const { deriveApplicationsEvidence } = require('../services/intelligence/applications-evidence-store');
const { buildSecurityDashboardPayload } = require('../services/intelligence/security-dashboard-processor');
const { deriveSecurityEvidence } = require('../services/intelligence/security-evidence-store');

const test = require('node:test');
const assert = require('node:assert/strict');

test('backup evidence metrics and row count align with dashboard model', () => {
    const payload = buildBackupDashboardPayload({
        payload: {
            success: true,
            summary: { totalStorageGB: 120, oneDriveStorageGB: 40, sharePointStorageGB: 50, exchangeStorageGB: 30, activeUsersCount: 12, inactiveUsersCount: 3, servicesCovered: 3 },
            storage: {
                byService: { onedrive: 40, sharepoint: 50, exchange: 30 },
                users: [{ user: 'a@x.com', storage: 10 * 1024 ** 3, lastActivity: '2026-06-20' }],
                sites: [{ url: 'https://site', storage: 5 * 1024 ** 3, lastActivity: '2026-06-18' }],
                inactiveUsers: []
            }
        }
    });
    const evidence = deriveBackupEvidence(payload);
    assert.equal(evidence.dashboardMetrics.totalStorageGB, 120);
    assert.equal(evidence.dashboardMetrics.backupCoverageScore, 100);
    assert.equal(evidence.evidenceRows.length, 2);
    assert.equal(evidence.isComplete, true);
});

test('applications evidence stores one row per application', () => {
    const payload = buildApplicationsDashboardPayload({
        payload: {
            success: true,
            applications: [
                { id: 'app-1', displayName: 'App One', isExternal: true, scopeCount: 12, roleCount: 4, userCount: 25 },
                { id: 'app-2', displayName: 'App Two', isExternal: false, scopeCount: 2, roleCount: 1, userCount: 5 }
            ],
            userCount: 100,
            groupCount: 20
        }
    });
    const evidence = deriveApplicationsEvidence(payload);
    assert.equal(evidence.evidenceRows.length, 2);
    assert.equal(evidence.dashboardMetrics.totalApplications, 2);
    assert.equal(evidence.dashboardMetrics.externalApplications, 1);
    assert.equal(evidence.isComplete, true);
});

test('security evidence stores alerts, incidents, sign-ins, and indicators', () => {
    const payload = buildSecurityDashboardPayload({
        payload: {
            success: true,
            summary: { totalAlerts: 3, highSeverityAlerts: 1, activeIncidents: 1, threatIndicators: 2, usersUnderAttack: 1, securityScore: 72 },
            alerts: [{ id: 'a1', title: 'Alert', severity: 'high', status: 'newalert' }, { id: 'a2', title: 'Low', severity: 'low', status: 'resolved' }],
            incidents: [{ id: 'i1', displayName: 'Incident', severity: 'high', status: 'active' }],
            threats: [{ id: 't1', indicator: '1.1.1.1', severity: 'medium' }],
            signIns: { suspicious: [{ id: 's1', user: 'user@x.com', status: 'Failed' }] },
            recommendations: [{ priority: 'critical', title: 'Review alerts' }]
        }
    });
    const evidence = deriveSecurityEvidence(payload);
    assert.equal(evidence.evidenceRows.length, 5);
    assert.equal(evidence.dashboardMetrics.totalAlerts, 3);
    assert.equal(evidence.dashboardMetrics.highSeverityAlerts, 1);
    assert.equal(evidence.isComplete, true);
});
