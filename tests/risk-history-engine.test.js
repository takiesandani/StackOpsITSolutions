const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRiskEngine } = require('../services/intelligence/risk-engine');
const { buildHistoricalIntelligence } = require('../services/intelligence/historical-engine');

function expectedSource(sourceKey, dashboardMetrics = {}, calculatedIndicators = {}) {
    return {
        sourceKey,
        isExpected: true,
        status: 'available',
        dashboardMetrics,
        calculatedIndicators,
        metrics: { ...dashboardMetrics, ...calculatedIndicators }
    };
}

test('risk engine generates overall, domain, maturity, and executive KPI scores', () => {
    const risk = buildRiskEngine({
        dataCompleteness: { score: 100 },
        sources: [
            expectedSource('identity', { totalUsers: 100, mfaCoverage: 90, privilegedUsers: 10, highRiskUsers: 2, adminsWithoutMfa: 1, signInIssues: 3 }),
            expectedSource('devices', { totalDevices: 50, complianceRate: 88, encryptionRate: 92, staleDevices: 3, dead30Days: 1 }),
            expectedSource('security_alerts', { securityScore: 82, highSeverityAlerts: 2, activeIncidents: 1, suspiciousSignIns: 4 }),
            expectedSource('email_security', { highSeverityAlerts: 1, activeIncidents: 0, activeThreats: 2 }),
            expectedSource('backup', { servicesCovered: 3, backupConfigured: true }, { backupCoverageScore: 100 }),
            expectedSource('governance', { governanceScore: 78 }),
            expectedSource('compliance', { complianceScore: 84 }),
            expectedSource('cloudflare_network_security', { deniedAccessEvents: 2 }, { networkSecurityScore: 90 }),
            expectedSource('operations', { totalTasks: 10, highPriorityTasks: 2, failedTasks: 1, activeIncidents: 0 }, { operationsHealthScore: 82 }),
            expectedSource('applications', { totalApplications: 20, highRiskApps: 2, excessivePermissionApps: 1 }, { applicationGovernanceScore: 86 })
        ]
    });

    assert.ok(risk.overallRiskScore >= 0 && risk.overallRiskScore <= 100);
    assert.match(risk.overallRiskLevel, /low|moderate|high|critical/);
    assert.equal(typeof risk.domainRiskScores.identity, 'number');
    assert.equal(typeof risk.securityMaturityScore, 'number');
    assert.equal(risk.executiveKPIs.deviceHealth, risk.domainHealthScores.devices);
    assert.equal(risk.executiveKPIs.operationsHealth, 82);
    assert.equal(risk.executiveKPIs.applicationsHealth, 86);
    assert.equal(risk.domainRiskScores.operations, 18);
    assert.equal(risk.domainRiskScores.applications, 14);
    assert.equal(risk.dataCompletenessScore, 100);
});

test('operations and applications scoring uses available evidence and source freshness', () => {
    const risk = buildRiskEngine({
        dataCompleteness: { score: 100 },
        sources: [
            expectedSource('operations', { totalTasks: 10, highPriorityTasks: 4, failedTasks: 1, activeIncidents: 2 }),
            expectedSource('applications', {
                totalApplications: 20,
                highRiskApps: 4,
                excessivePermissionApps: 2,
                riskyPublisherApps: 1,
                unreviewedPermissionApps: 2,
                shadowITApps: 1
            })
        ]
    });

    assert.ok(risk.domainHealthScores.operations < 100);
    assert.ok(risk.domainHealthScores.applications < 100);
    assert.equal(risk.domainRiskScores.operations, 100 - risk.domainHealthScores.operations);
    assert.equal(risk.domainRiskScores.applications, 100 - risk.domainHealthScores.applications);
});

test('risk engine does not penalize tenant domains that are not expected', () => {
    const risk = buildRiskEngine({
        dataCompleteness: { score: 100 },
        sources: [{ sourceKey: 'identity', isExpected: false, status: 'not_expected', metrics: {} }]
    });
    assert.equal(risk.overallRiskScore, null);
    assert.equal(risk.overallRiskLevel, 'not_scored');
    assert.equal(risk.executiveKPIs.identityHealth, null);
});

test('historical engine compares risk and executive health across named periods', () => {
    const currentRisk = {
        overallRiskScore: 40,
        overallRiskLevel: 'moderate',
        securityMaturityScore: 70,
        securityMaturityLevel: 'defined',
        domainRiskScores: { security: 50 },
        executiveKPIs: { securityHealth: 50 },
        dataCompletenessScore: 100
    };
    const baselineRisk = {
        overallRiskScore: 55,
        overallRiskLevel: 'high',
        securityMaturityScore: 55,
        securityMaturityLevel: 'developing',
        domainRiskScores: { security: 65 },
        executiveKPIs: { securityHealth: 35 },
        dataCompletenessScore: 90
    };
    const history = buildHistoricalIntelligence({
        currentSnapshot: { snapshotId: 10, createdAt: '2026-06-22T08:00:00.000Z', context: { riskEngine: currentRisk } },
        comparisons: {
            '24_hours': {
                availability: 'available',
                targetAt: '2026-06-21T08:00:00.000Z',
                differenceMinutes: 0,
                snapshot: { snapshotId: 9, createdAt: '2026-06-21T08:00:00.000Z', context: { riskEngine: baselineRisk } }
            },
            '7_days': { availability: 'unavailable', targetAt: null, differenceMinutes: null, snapshot: null }
        }
    });

    assert.equal(history.periods['24_hours'].label, 'Today vs yesterday');
    assert.equal(history.periods['24_hours'].changes.overallRisk.direction, 'improving');
    assert.equal(history.periods['24_hours'].changes.securityMaturity.direction, 'improving');
    assert.equal(history.periods['24_hours'].changes.executiveKPIs.securityHealth.change, 15);
    assert.equal(history.periods['7_days'].changes, null);
});
