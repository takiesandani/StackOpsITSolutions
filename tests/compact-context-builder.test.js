const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildCompactIntelligenceContext,
    selectEvidence
} = require('../services/intelligence/compact-context-builder');

function risk(score) {
    return {
        overallRiskScore: score,
        overallRiskLevel: score >= 70 ? 'high' : 'moderate',
        securityMaturityScore: 100 - score,
        domainRiskScores: { identity: score, devices: score - 5 },
        executiveKPIs: { identityHealth: 100 - score, deviceHealth: 105 - score }
    };
}

test('compact context keeps historical horizons while removing full raw lists', () => {
    const rawUsers = Array.from({ length: 1200 }, (_, index) => ({
        id: `user-${index}`,
        displayName: `Example User ${index}`,
        notes: 'x'.repeat(300)
    }));
    const currentContext = {
        tenant: { companyId: 7, tenantKey: 'tenant-7', company: { CompanyName: 'Example Tenant' } },
        period: { start: '2026-06-21T00:00:00.000Z', end: '2026-06-21T23:59:59.999Z' },
        dataCompleteness: { score: 92, expectedSources: 10, availableSources: 9 },
        riskEngine: risk(72),
        metrics: { identity: { totalUsers: rawUsers.length, mfaCoverage: 71 } },
        sources: [{
            sourceKey: 'identity',
            displayName: 'Microsoft Graph Identity',
            status: 'available',
            isExpected: true,
            metrics: { totalUsers: rawUsers.length, mfaCoverage: 71 },
            evidence: [{ evidenceType: 'users', severity: 'high', data: rawUsers }],
            evidenceCount: 1,
            warnings: []
        }],
        evidence: [{
            sourceKey: 'identity',
            displayName: 'Microsoft Graph Identity',
            data: { evidenceType: 'users', severity: 'critical', title: 'MFA gap', users: rawUsers }
        }],
        warnings: []
    };
    const comparisons = {};
    for (const [key, score] of [['previous', 70], ['24_hours', 68], ['7_days', 64], ['30_days', 59], ['90_days', 52]]) {
        comparisons[key] = {
            availability: 'available',
            targetAt: '2026-06-20T00:00:00.000Z',
            differenceMinutes: 0,
            metricChanges: { 'identity.mfaCoverage': { current: 71, baseline: 65, change: 6 } },
            snapshot: {
                snapshotId: score,
                createdAt: '2026-06-20T00:00:00.000Z',
                dataCompletenessScore: 90,
                context: { riskEngine: risk(score), metrics: { identity: { mfaCoverage: 65 } }, sources: [], evidence: [] }
            }
        };
    }
    const historicalContext = {
        comparisons,
        historicalIntelligence: {
            periods: Object.fromEntries(Object.keys(comparisons).map(key => [key, {
                label: key,
                changes: { overallRisk: { current: 72, baseline: comparisons[key].snapshot.context.riskEngine.overallRiskScore } }
            }]))
        }
    };
    const snapshot = {
        ID: 99,
        CompanyID: 7,
        TenantKey: 'tenant-7',
        CreatedAt: '2026-06-21T08:00:00.000Z',
        ContextJson: currentContext
    };

    const periodRollups = [{ PeriodType: 'daily', RiskScore: 70, ExecutiveSummary: 'Daily movement' }];
    const result = buildCompactIntelligenceContext({ snapshot, historicalContext, periodType: 'weekly', periodRollups });
    const compactText = JSON.stringify(result.compactContextJson);
    const fullText = JSON.stringify(currentContext);

    assert.ok(result.compactContextSizeBytes < Buffer.byteLength(fullText));
    assert.ok(result.compactContextSizeBytes <= 500 * 1024);
    assert.equal(result.compactContextJson.topEvidence[0].severity, 'critical');
    assert.ok(!compactText.includes('Example User 1199'));
    assert.deepEqual(Object.keys(result.compactContextJson.historicalComparisons.periods), [
        'previous', '24_hours', '7_days', '30_days', '90_days'
    ]);
    assert.equal(result.compactContextJson.historicalComparisons.periods['90_days'].availability, 'available');
    assert.equal(result.compactContextJson.periodRollups.count, 1);
    assert.equal(result.compactContextJson.periodRollups.sample[0].PeriodType, 'daily');
});

test('critical evidence remains included even when the normal evidence limit is exceeded', () => {
    const evidence = Array.from({ length: 50 }, (_, index) => ({
        sourceKey: 'security_alerts',
        data: { evidenceType: `alert-${index}`, severity: index < 45 ? 'critical' : 'low' }
    }));
    const selected = selectEvidence(evidence, 20, 5);
    assert.equal(selected.items.filter(item => item.severity === 'critical').length, 45);
});
