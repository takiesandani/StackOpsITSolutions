const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadHistoricalNarrativeBuilder() {
    const source = fs.readFileSync('server.js', 'utf8');
    const start = source.indexOf('function buildHistoricalNarrativeFromSynthesis(output = {}, report = null) {');
    const end = source.indexOf('const SUNBIRD_REPORT_LIVE_DOMAIN_TIMEOUT_MS', start);
    assert.ok(start >= 0 && end > start, 'historical narrative builder must be present');
    return vm.runInNewContext(`
        ${source.slice(start, end)}
        buildHistoricalNarrativeFromSynthesis;
    `);
}

test('PDF history uses completed-report comparisons and never emits fabricated fallback statements', () => {
    const buildHistoricalNarrativeFromSynthesis = loadHistoricalNarrativeBuilder();
    const result = buildHistoricalNarrativeFromSynthesis({
        trendAnalysis: [{
            metricName: 'Identity health',
            previousValue: 62,
            currentValue: 71,
            unit: '%',
            direction: 'improving'
        }, {
            description: 'Baseline unavailable due to lack of historical period reports.'
        }],
        complianceReview: {
            failedOrWeakControlThemes: ['MFA enforcement'],
            evidenceGaps: ['A required device attestation is missing']
        }
    }, {
        dailyReports: [{
            periodEnd: '2026-08-05T08:00:00.000Z',
            healthScore: 62,
            failures: 8,
            successes: 3,
            events: 20
        }, {
            periodEnd: '2026-08-06T08:00:00.000Z',
            healthScore: 71,
            failures: 5,
            successes: 6,
            events: 24
        }]
    });

    assert.match(result.whatChangedSinceLastReport, /Health score increased from 62% to 71%/);
    assert.match(result.whatChangedSinceLastReport, /Open findings decreased from 8 to 5/);
    assert.match(result.historicalTrendAnalysis, /Identity health moved from 62% to 71%/);
    assert.doesNotMatch(result.historicalTrendAnalysis, /baseline unavailable/i);
    assert.deepEqual([...result.remainsOpen], ['MFA enforcement', 'A required device attestation is missing']);
    assert.equal(result.controlGapsAndRemediationProgress, '');
});

test('PDF history compares a just-collected daily summary with the prior saved report', () => {
    const buildHistoricalNarrativeFromSynthesis = loadHistoricalNarrativeBuilder();
    const result = buildHistoricalNarrativeFromSynthesis({}, {
        dailyReports: [],
        currentDailyReport: {
            periodEnd: '2026-08-07T08:00:00.000Z',
            healthScore: 78,
            failures: 2,
            successes: 9,
            events: 31
        },
        previousDailyReport: {
            periodEnd: '2026-08-06T08:00:00.000Z',
            healthScore: 70,
            failures: 5,
            successes: 6,
            events: 27
        }
    });

    assert.match(result.whatChangedSinceLastReport, /Health score increased from 70% to 78%/);
    assert.match(result.whatChangedSinceLastReport, /Open findings decreased from 5 to 2/);
});
test('PDF history stays empty when there is no genuine comparison or stated gap', () => {
    const buildHistoricalNarrativeFromSynthesis = loadHistoricalNarrativeBuilder();
    const result = buildHistoricalNarrativeFromSynthesis({
        trendAnalysis: [{ description: 'Baseline unavailable due to lack of historical period reports.' }]
    }, { dailyReports: [] });

    assert.equal(result.whatChangedSinceLastReport, '');
    assert.equal(result.historicalTrendAnalysis, '');
    assert.equal(result.controlGapsAndRemediationProgress, '');
    assert.deepEqual([...result.remainsOpen], []);
});

test('PDF executive renderer uses the structured synthesis fields instead of raw report records', () => {
    const source = fs.readFileSync('server.js', 'utf8');
    const start = source.indexOf('const buildExecutiveOverview = () => {');
    const end = source.indexOf('const executiveListParts = value => {', start);
    const renderer = source.slice(start, end);

    assert.match(renderer, /addText\('summary', executive\.summary\)/);
    assert.match(renderer, /addText\('impact', finalOutput\.businessImpactSummary\)/);
    assert.match(renderer, /addStructuredItems\(finalOutput\.riskRegister, 'risks'/);
    assert.match(renderer, /finalOutput\.recommendations/);
    assert.doesNotMatch(renderer, /addItems\(analysis\.failures \|\| report\.failures, 'risks'\)/);
});