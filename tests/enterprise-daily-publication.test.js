const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
    createEnterpriseIntelligenceService,
    johannesburgScheduleContext
} = require('../services/enterprise-intelligence');

test('04:23 SAST on 13 August uses the Johannesburg daily key for 13 August', () => {
    const context = johannesburgScheduleContext(new Date('2026-08-13T02:23:00.000Z'));
    assert.equal(context.local.toISODate(), '2026-08-13');
    assert.equal(context.scheduleKey, '20260813');
});

test('published current-report query selects run 130 rather than old run 129', async () => {
    const queries = [];
    const pool = {
        async query(sql, params = []) {
            queries.push({ sql, params });
            if (sql.includes('FROM StackCTRLEnterpriseReportRuns runs')) {
                assert.match(sql, /JOIN SunbirdReports publishedReport/);
                assert.match(sql, /publishedReport\.IsCurrent = 1/);
                return [[{
                    ID: 130,
                    CompanyID: 1,
                    SnapshotID: 6801,
                    PeriodType: 'daily',
                    PeriodStart: '2026-08-12',
                    PeriodEnd: '2026-08-13',
                    Status: 'completed',
                    CreatedAt: '2026-08-13T02:23:00.000Z'
                }], []];
            }
            if (sql.includes('FROM StackCTRLTenantDomainIntelligence')) {
                return [[{
                    ID: 1,
                    CompanyID: 1,
                    SnapshotID: 6801,
                    RunID: 130,
                    DomainKey: 'identity',
                    DomainName: 'Identity Protection',
                    PeriodType: 'daily',
                    PeriodStart: '2026-08-12',
                    PeriodEnd: '2026-08-13',
                    Status: 'completed',
                    AnalysisJson: '{}',
                    CreatedAt: '2026-08-13T02:24:00.000Z'
                }], []];
            }
            return [[], []];
        }
    };
    const service = createEnterpriseIntelligenceService({
        pool,
        azureOpenAI: {},
        intelligenceService: {},
        schedulerService: {},
        logger: { info() {}, warn() {}, error() {} }
    });
    const current = await service.getPowerBIIntelligenceRun(1, null, { publishedOnly: true });
    assert.equal(current.latestRunId, 130);
    assert.equal(current.latestSnapshotId, 6801);
    assert.notEqual(current.latestRunId, 129);
    assert.ok(queries.some(query => query.sql.includes('EnterpriseRunID = runs.ID')));
});

test('daily publication persists a report/run/snapshot association and uses it for the dashboard', () => {
    const source = fs.readFileSync('server.js', 'utf8');
    assert.match(source, /EnterpriseRunID, EnterpriseSnapshotID, IsCurrent, PublishedAt/);
    assert.match(source, /publishCurrent: true/);
    assert.match(source, /publishedOnly: !runId/);
    assert.match(source, /parseCloudSchedulerScheduleTime/);
    const enterpriseSource = fs.readFileSync('services/enterprise-intelligence.js', 'utf8');
    assert.match(enterpriseSource, /event: 'enterprise_daily_pipeline_completed'/);
});