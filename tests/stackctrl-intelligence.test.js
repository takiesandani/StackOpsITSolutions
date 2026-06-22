const test = require('node:test');
const assert = require('node:assert/strict');

const { createStackCTRLIntelligenceService, PERIOD_OUTPUT_TYPES } = require('../services/stackctrl-intelligence');

function emptyResult() {
    return [[], []];
}

test('daily intelligence requests every major Power BI output', () => {
    for (const outputType of [
        'powerbi_summary',
        'executive_summary',
        'board_report',
        'risk_register',
        'recommendations',
        'trend_analysis',
        'compliance_review',
        'governance_assessment',
        'risk_level',
        'overall_risk_score'
    ]) {
        assert.ok(PERIOD_OUTPUT_TYPES.daily.includes(outputType), `Daily output is missing ${outputType}`);
    }
});

test('buildTenantAIContext uses stored tenant evidence and includes SEDFA licences', async () => {
    const calls = [];
    const pool = {
        async query(sql, params) {
            calls.push({ sql, params });
            if (sql.includes('FROM Companies')) return [[{ ID: 7, CompanyName: 'SEDFA' }], []];
            if (sql.includes('FROM IdentityMetricsCache')) {
                return [[{ CompanyID: 7, TotalUsers: 20, SecurityScore: 82, LastUpdated: new Date() }], []];
            }
            if (sql.includes('FROM client_duo_stats')) {
                return [[{
                    used_licenses: 18,
                    total_licenses: 25,
                    edition: 'Duo Advantage',
                    status: 'active',
                    last_updated: new Date()
                }], []];
            }
            if (sql.includes('FROM Projects')) return [[{ ProjectID: 10, CompanyID: 7, Status: 'Active' }], []];
            if (sql.includes('FROM Invoices')) return [[{ InvoiceID: 11, CompanyID: 7, Status: 'Paid' }], []];
            return emptyResult();
        }
    };
    const service = createStackCTRLIntelligenceService({
        pool,
        azureOpenAI: { createJsonCompletion: async () => ({ data: {} }) }
    });

    const result = await service.buildTenantAIContext(7);

    assert.equal(result.context.tenant.companyId, 7);
    const duoSource = result.sources.find(source => source.sourceKey === 'duo_licences');
    assert.equal(duoSource.evidence[0].total_licenses, 25);
    assert.deepEqual(result.metrics.duo_licences, {
        accounts: 1,
        usedLicences: 18,
        totalLicences: 25,
        remainingLicences: 7
    });
    assert.equal(result.context.capabilities.profileKey, 'sedfa');
    assert.equal(result.context.riskEngine.overallRiskLevel, 'not_scored');
    assert.equal(result.context.sources.find(source => source.sourceKey === 'governance').status, 'not_expected');
    assert.equal(result.dataCompleteness.score, 75);
    assert.equal(calls.some(call => /duo.*admin|admin.*duo|api\.duo/i.test(call.sql)), false);
});

test('bootstrap stores the snapshot, every source status, and normalized metrics', async () => {
    const writes = [];
    let statusId = 200;
    const connection = {
        async beginTransaction() { writes.push('begin'); },
        async commit() { writes.push('commit'); },
        async rollback() { writes.push('rollback'); },
        release() { writes.push('release'); },
        async query(sql, params) {
            writes.push({ sql, params });
            if (sql.includes('INSERT INTO StackCTRLTenantEvidenceSnapshots')) return [{ insertId: 80 }, []];
            if (sql.includes('INSERT INTO StackCTRLIntelligenceSourceStatus')) return [{ insertId: statusId++ }, []];
            return [{ insertId: 1, affectedRows: 1 }, []];
        }
    };
    const pool = {
        async query(sql) {
            if (sql.includes('FROM Companies')) return [[{ ID: 9, CompanyName: 'Standard Client' }], []];
            if (sql.includes('FROM Projects')) return [[{ ProjectID: 12, CompanyID: 9, Status: 'Active' }], []];
            if (sql.includes('FROM Invoices')) return [[{ InvoiceID: 13, CompanyID: 9, Status: 'Unpaid', TotalAmount: 500 }], []];
            return emptyResult();
        },
        async getConnection() { return connection; }
    };
    const service = createStackCTRLIntelligenceService({
        pool,
        azureOpenAI: { createJsonCompletion: async () => ({ data: {} }) }
    });

    const result = await service.bootstrap({ companyId: 9, accessType: 'standard' });

    assert.equal(result.snapshotId, 80);
    assert.equal(result.dataCompleteness.score, 100);
    assert.equal(result.sourceStatuses.length, 13);
    assert.equal(writes.filter(write => write.sql?.includes('StackCTRLIntelligenceSourceStatus')).length, 13);
    assert.ok(writes.some(write => write.sql?.includes('StackCTRLIntelligenceMetrics')));
    assert.equal(writes.includes('commit'), true);
    assert.equal(writes.includes('rollback'), false);
});

test('analyseSnapshot stores outputs and normalized Power BI rows in one transaction', async () => {
    const writes = [];
    let azureMessages = [];
    let nextOutputId = 100;
    const connection = {
        async beginTransaction() { writes.push('begin'); },
        async commit() { writes.push('commit'); },
        async rollback() { writes.push('rollback'); },
        release() { writes.push('release'); },
        async query(sql, params) {
            writes.push({ sql, params });
            if (sql.includes('INSERT INTO StackCTRLTenantAIOutputs')) return [{ insertId: nextOutputId++ }, []];
            return [{ affectedRows: 1 }, []];
        }
    };
    const pool = {
        async query(sql, params) {
            writes.push({ sql, params });
            if (sql.includes('FROM StackCTRLTenantEvidenceSnapshots')) {
                return [[{
                    ID: 4,
                    CompanyID: 7,
                    ContextJson: {
                        tenant: { companyId: 7 },
                        riskEngine: {
                            overallRiskScore: 42,
                            overallRiskLevel: 'moderate',
                            securityMaturityScore: 68,
                            securityMaturityLevel: 'defined',
                            domainRiskScores: { identity: 42 },
                            executiveKPIs: { identityHealth: 58 }
                        },
                        metrics: { identity: { mfaCoverage: 97 } },
                        dataCompleteness: { score: 100 },
                        sources: [{ sourceKey: 'cloudflare_network_security', status: 'available' }]
                    }
                }], []];
            }
            if (sql.includes('FROM StackCTRLIntelligencePrompts')) {
                return [[{
                    PromptVersion: 'tenant-v2',
                    SystemPrompt: 'Use stored StackCTRL evidence only.',
                    UserPromptTemplate: 'Outputs: {{outputTypes}} Context: {{contextJson}}'
                }], []];
            }
            if (sql.includes('INSERT INTO StackCTRLIntelligenceRuns')) return [{ insertId: 50 }, []];
            return [{ affectedRows: 1 }, []];
        },
        async getConnection() { return connection; }
    };
    const azureOpenAI = {
        async createJsonCompletion(options) {
            azureMessages = options.messages;
            await options.onStatusChange({
                status: 'processing', model: 'gpt-4.1-mini', deployment: 'gpt-4.1-mini',
                requestSizeBytes: 1200, retryCount: 0
            });
            await options.onStatusChange({
                status: 'rate_limited', model: 'gpt-4.1-mini', deployment: 'gpt-4.1-mini',
                requestSizeBytes: 1200, retryCount: 1
            });
            await options.onStatusChange({
                status: 'processing', model: 'gpt-4.1-mini', deployment: 'gpt-4.1-mini',
                requestSizeBytes: 1200, retryCount: 1
            });
            return {
                deployment: 'stackctrl-production',
                model: 'gpt-4.1-mini',
                requestSizeBytes: 1200,
                responseSizeBytes: 2400,
                usage: { input_tokens: 900, output_tokens: 300, total_tokens: 1200 },
                retryCount: 1,
                data: {
                    executive_summary: { summary: 'Licence capacity remains available.' },
                    overall_risk_score: 18,
                    risk_level: 'low',
                    board_report: { summary: 'Risk is controlled with licence monitoring required.' },
                    powerbi_summary: {
                        risk_score: '18',
                        risk_level: 'low',
                        maturity_level: 'managed',
                        top_risk_domain: 'Identity',
                        top_recommendation: 'Monitor licence use',
                        mfa_coverage: '95',
                        device_compliance: '92',
                        high_severity_alerts: '0',
                        cloudflare_status: 'available',
                        data_completeness_score: 100
                    },
                    risk_register: [{
                        domain: 'Identity',
                        title: 'Licence capacity',
                        description: 'Capacity should be watched.',
                        severity: 'Low'
                    }],
                    recommendations: [{
                        domain: 'Identity',
                        title: 'Monitor licence use',
                        priority: 'Low'
                    }],
                    trend_analysis: [{
                        metricName: 'Used licences',
                        currentValue: 18,
                        previousValue: 17,
                        changePercent: 5.88,
                        direction: 'up',
                        comparisonPeriod: '24_hours'
                    }]
                }
            };
        }
    };
    const service = createStackCTRLIntelligenceService({ pool, azureOpenAI });

    const result = await service.analyseSnapshot({
        snapshotId: 4,
        companyId: 7,
        outputTypes: [
            'executive_summary', 'overall_risk_score', 'risk_level', 'risk_register',
            'recommendations', 'trend_analysis', 'board_report', 'powerbi_summary'
        ],
        user: { id: 2, email: 'owner@example.com' }
    });

    assert.equal(result.runId, 50);
    assert.equal(result.runStatus, 'completed');
    assert.equal(result.retryCount, 1);
    assert.equal(result.preview.risks, 1);
    assert.equal(result.preview.recommendations, 1);
    assert.equal(result.preview.trends, 1);
    assert.match(azureMessages[0].content, /StackCTRL-calculated tenant evidence is the primary source of truth/);
    assert.match(azureMessages[0].content, /Use stored StackCTRL evidence only/);
    assert.match(azureMessages[1].content, /executive_summary/);
    assert.match(azureMessages[1].content, /"companyId":7/);
    assert.match(azureMessages[1].content, /"powerbi_summary"/);
    assert.match(azureMessages[1].content, /"mfa_coverage"/);
    assert.equal(result.preview.overallRiskScore, 42);
    assert.equal(result.preview.riskLevel, 'moderate');
    assert.equal(result.preview.powerbiSummary.cloudflare_status, 'available');
    assert.equal(writes.includes('commit'), true);
    assert.equal(writes.includes('rollback'), false);
    assert.equal(writes.filter(write => write.sql?.includes('StackCTRLTenantRiskRegister')).length, 1);
    assert.equal(writes.filter(write => write.sql?.includes('StackCTRLTenantRecommendations')).length, 1);
    assert.equal(writes.filter(write => write.sql?.includes('StackCTRLTenantTrendAnalysis')).length, 1);
    const trendWrite = writes.find(write => write.sql?.includes('StackCTRLTenantTrendAnalysis'));
    assert.match(trendWrite.sql, /ComparisonPeriod/);
    assert.equal(trendWrite.params[9], '24_hours');
    const powerBIWrite = writes.find(write => write.sql?.includes('StackCTRLTenantAIOutputs') && write.params[2] === 'powerbi_summary');
    assert.equal(JSON.parse(powerBIWrite.params[5]).risk_score, 42);
    assert.equal(JSON.parse(powerBIWrite.params[5]).mfa_coverage, 97);
    assert.equal(JSON.parse(powerBIWrite.params[5]).high_severity_alerts, 0);
    assert.equal(
        writes.find(write => write.sql?.includes('StackCTRLTenantAIOutputs')).params[8],
        'tenant-v2'
    );
    const runStatuses = writes
        .filter(write => write.sql?.includes('UPDATE StackCTRLIntelligenceRuns') && typeof write.params?.[0] === 'string')
        .map(write => write.params[0]);
    assert.deepEqual(runStatuses, ['processing', 'rate_limited', 'processing', 'completed']);
    const completedRunUpdate = writes.find(write =>
        write.sql?.includes('UPDATE StackCTRLIntelligenceRuns') && write.params?.[0] === 'completed'
    );
    assert.equal(completedRunUpdate.params[1], 'gpt-4.1-mini');
    assert.equal(completedRunUpdate.params[2], 'stackctrl-production');
    assert.equal(completedRunUpdate.params[3], 1200);
    assert.equal(completedRunUpdate.params[4], 2400);
    assert.equal(completedRunUpdate.params[8], 1200);
    assert.equal(completedRunUpdate.params[9], 1);
});

test('analyseSnapshot keeps the snapshot and marks the run failed when Azure fails', async () => {
    const queries = [];
    const pool = {
        async query(sql, params) {
            queries.push({ sql, params });
            if (sql.includes('FROM StackCTRLTenantEvidenceSnapshots')) {
                return [[{ ID: 9, CompanyID: 7, ContextJson: { tenant: { companyId: 7 } } }], []];
            }
            if (sql.includes('INSERT INTO StackCTRLIntelligenceRuns')) return [{ insertId: 60 }, []];
            return [{ affectedRows: 1 }, []];
        }
    };
    const service = createStackCTRLIntelligenceService({
        pool,
        azureOpenAI: {
            async createJsonCompletion() {
                throw new Error('Azure OpenAI request failed (503): unavailable');
            }
        }
    });

    await assert.rejects(
        service.analyseSnapshot({
            snapshotId: 9,
            companyId: 7,
            outputTypes: ['executive_summary']
        }),
        /503/
    );

    const failureUpdate = queries.find(call =>
        call.sql.includes('UPDATE StackCTRLIntelligenceRuns') &&
        (call.sql.includes("SET Status = 'failed'") || call.params?.[0] === 'failed')
    );
    assert.ok(failureUpdate);
    assert.equal(failureUpdate.params.at(-1), 60);
    assert.equal(queries.some(call => call.sql.includes('DELETE FROM StackCTRLTenantEvidenceSnapshots')), false);
});
