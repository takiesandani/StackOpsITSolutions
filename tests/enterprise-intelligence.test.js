const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildDataLineageComparison,
    createEnterpriseIntelligenceService,
    DEVICE_LINEAGE_FIELDS,
    EMAIL_LINEAGE_FIELDS,
    NETWORK_LINEAGE_FIELDS,
    ENTERPRISE_DOMAINS,
    flattenDomainEvidence,
    normalizeMysqlDate,
    sourceAlignmentFailure,
    splitIntoBatches
} = require('../services/enterprise-intelligence');

function identityLikeEvidence() {
    return {
        users: Array.from({ length: 3000 }, (_, index) => ({ id: `user-${index + 1}`, enabled: true })),
        roles: Array.from({ length: 300 }, (_, index) => ({ id: `role-${index + 1}`, privileged: index < 20 })),
        signIns: Array.from({ length: 200 }, (_, index) => ({ id: `signin-${index + 1}`, risk: 'none' })),
        history: {
            daily: Array.from({ length: 90 }, (_, index) => ({ day: index + 1, riskySignIns: index % 3 }))
        }
    };
}

function domainResponse(domainKey) {
    return {
        domainExecutiveSummary: `${domainKey} requires evidence-based management attention.`,
        technicalSummary: 'Stored metrics and historical comparisons were assessed.',
        businessImpact: 'Control gaps may increase operational exposure.',
        currentPosture: 'partially controlled',
        evidenceUsed: ['StackCTRL metric evidence'],
        evidenceGaps: ['One control requires manual validation'],
        scoreJustification: 'The authoritative StackCTRL score is supported by the supplied metrics.',
        controlAssessment: { confirmed: ['MFA metrics'], unknown: ['Conditional Access policy detail'] },
        keyFindings: [{ title: 'Control gap', severity: 'high', evidenceSummary: 'Stored evidence supports this finding.' }],
        risks: [{ title: 'Domain risk', severity: 'high', businessImpact: 'Business exposure', evidenceSummary: 'Stored evidence', recommendation: 'Remediate' }],
        recommendations: [{ title: 'Remediate control', priority: 'high', suggestedOwner: 'IT Manager', suggestedDueDate: 'Ongoing' }],
        trendAnalysis: [{ metricName: 'Health score', currentValue: 75, previousValue: 70, changePercent: 7.14, direction: 'improving', comparisonPeriod: '24_hours' }],
        yesterdayVsToday: { direction: 'improving' },
        whatImproved: ['Health score'], whatDeteriorated: [], whatStayedTheSame: [],
        missingDataWarnings: [], assumptions: [], confidenceScore: 0.91,
        managementActions: [{ title: 'Approve remediation owner', priority: 'high', suggestedDueDate: 'ASAP' }],
        powerBiSummary: { status: 'attention' }
    };
}

function synthesisResponse() {
    return {
        enterpriseExecutiveSummary: { summary: 'Enterprise risk is moderate and evidence based.' },
        boardReport: { summary: 'Board attention is required for the highest risks.' },
        managementReport: { managementActions: [{ title: 'Assign remediation owners', priority: 'high' }] },
        riskRegister: [{ domainKey: 'identity', title: 'Identity risk', severity: 'high' }],
        recommendations: [{ domainKey: 'identity', title: 'Complete MFA', priority: 'high' }],
        trendAnalysis: [{ domainKey: 'identity', metricName: 'MFA', direction: 'improving', comparisonPeriod: '24_hours' }],
        complianceReview: {}, governanceReview: {}, domainScorecard: [], maturityAssessment: { level: 'defined' },
        businessImpactSummary: 'Cybersecurity gaps may disrupt operations.', topDecisionsRequired: ['Approve owners'],
        next30DaysPlan: ['Close critical gaps'], next90DaysPlan: ['Improve maturity'],
        evidenceJustificationSummary: { domains: 1 }, limitationsAndAssumptions: [],
        powerBiSummary: { risk_score: 35, risk_level: 'moderate' }
    };
}

test('enterprise pipeline queues domain analysis, stores audit rows, then synthesizes stored intelligence', async () => {
    const calls = [];
    const azurePrompts = [];
    let insertId = 100;
    const snapshot = {
        ID: 76, CompanyID: 1, TenantKey: 'tenant-sunbird', SnapshotType: 'manual',
        CreatedAt: new Date('2026-06-22T08:00:00.000Z'), DataCompletenessScore: 100,
        MetricsJson: JSON.stringify({ identity: { mfaCoverage: 90 }, stackctrl_risk: { domainRiskScores: { identity: 25 } }, executive_kpis: { identityHealth: 75 } }),
        ContextJson: JSON.stringify({
            secretRawContextMarker: 'must-not-reach-synthesis',
            riskEngine: { domainHealthScores: { identity: 75 }, domainRiskScores: { identity: 25 }, executiveKPIs: { identityHealth: 75 } },
            sources: [{ sourceKey: 'identity', status: 'available', isExpected: true, freshness: { ageMinutes: 2 }, metrics: { mfaCoverage: 90 }, evidence: [{ evidenceType: 'metric_summary', data: { usersWithoutMfa: 2 } }] }]
        })
    };
    const pool = {
        async query(sql, params = []) {
            calls.push({ sql, params });
            assert.equal((sql.match(/\?/g) || []).length, params.length, `Placeholder mismatch in ${sql}`);
            if (sql.includes('FROM StackCTRLTenantEvidenceSnapshots WHERE')) return [[snapshot], []];
            if (sql.includes('FROM StackCTRLKnowledgeBase')) return [[{ Title: 'MFA guidance', SourceType: 'manual', ContentSummary: 'Require strong MFA.', BestPracticeJson: '{}' }], []];
            if (sql.includes('FROM StackCTRLTenantDomainIntelligence') && sql.includes('RunID <>')) return [[], []];
            if (sql.includes('SELECT ID, CompanyID, SnapshotID, RunID, DomainKey')) {
                return [[{
                    ID: 200, CompanyID: 1, SnapshotID: 76, RunID: 100, DomainKey: 'identity', DomainName: 'Identity Protection',
                    HealthScore: 75, RiskScore: 25, RiskLevel: 'moderate', Status: 'completed',
                    DomainExecutiveSummary: 'Identity summary', TechnicalSummary: 'Technical summary', BusinessImpact: 'Impact', CurrentPosture: 'partial',
                    EvidenceSummary: 'Evidence', ScoreJustification: 'Justified', ControlAssessment: '{}', FindingsJson: '[]', RisksJson: '[]',
                    RecommendationsJson: '[]', TrendAnalysisJson: '[]', YesterdayVsTodayJson: '{}', MissingDataWarningsJson: '[]', AssumptionsJson: '[]'
                }], []];
            }
            if (sql.includes('FROM StackCTRLEnterpriseSynthesis synthesis')) return [[], []];
            if (/^\s*INSERT/i.test(sql)) return [{ insertId: insertId++ }, []];
            return [{ affectedRows: 1 }, []];
        }
    };
    const schedulerService = {
        async getHistoricalSnapshotContext() {
            return { comparisons: { '24_hours': { availability: 'unavailable', snapshot: null, metricChanges: {} } } };
        }
    };
    const azureOpenAI = {
        async createJsonCompletion(options) {
            assert.equal(options.maxRetriesOverride, 3);
            azurePrompts.push(options.messages[1].content);
            const data = azurePrompts.length === 1 ? domainResponse('identity') : synthesisResponse();
            return { data, requestSizeBytes: 1200, responseSizeBytes: 2400, retryCount: 0, usage: { input_tokens: 500, output_tokens: 250, total_tokens: 750 } };
        }
    };
    const service = createEnterpriseIntelligenceService({ pool, azureOpenAI, schedulerService, wait: async () => {}, config: { domainDelayMs: 0, maxInputBytes: 100000 } });
    const result = await service.runEnterpriseReport({ companyId: 1, snapshotId: 76, domainKeys: ['identity'], includeSynthesis: true });

    assert.equal(result.domains[0].status, 'completed');
    assert.ok(result.synthesisId);
    assert.equal(azurePrompts.length, 2);
    assert.match(azurePrompts[0], /stackctrl_enterprise_domain_intelligence/);
    assert.match(azurePrompts[0], /evidenceUsed/);
    assert.match(azurePrompts[0], /Do not create layouts, visuals, HTML/);
    assert.match(azurePrompts[1], /synthesisUsesStoredIntelligenceOnly/);
    assert.doesNotMatch(azurePrompts[1], /secretRawContextMarker/);
    assert.ok(calls.some(call => call.sql.includes('StackCTRLIntelligenceEvidenceAudit')));
    assert.ok(calls.some(call => call.sql.includes('StackCTRLEnterpriseIntelligenceItems')));
    assert.ok(calls.some(call => call.sql.includes('StackCTRLEnterpriseSynthesis')));
    const itemWrites = calls.filter(call => call.sql.includes('INSERT INTO StackCTRLEnterpriseIntelligenceItems'));
    assert.ok(itemWrites.length);
    assert.equal(itemWrites.some(call => call.params.includes('Ongoing') || call.params.includes('ASAP')), false);
    assert.ok(itemWrites.some(call => call.params.includes(null)));
    assert.ok(calls.some(call => call.sql.includes('DELETE FROM StackCTRLEnterpriseIntelligenceItems WHERE RunID = ? AND DomainKey = ?')));
});

test('normalizeMysqlDate stores only real MySQL dates for enterprise AI date fields', () => {
    assert.equal(normalizeMysqlDate('Ongoing'), null);
    assert.equal(normalizeMysqlDate('ASAP'), null);
    assert.equal(normalizeMysqlDate('2026-07-15'), '2026-07-15');
    assert.equal(normalizeMysqlDate(new Date('2026-07-15T13:30:00.000Z')), '2026-07-15');
});

test('Enterprise Identity currentMetrics follow dynamic dashboard metrics and detect source mismatches', async () => {
    const pool = {
        async query(sql) {
            if (sql.includes('FROM StackCTRLKnowledgeBase')) return [[], []];
            if (sql.includes('FROM StackCTRLTenantDomainIntelligence') && sql.includes('RunID <>')) return [[], []];
            throw new Error(`Unexpected query: ${sql}`);
        }
    };
    const service = createEnterpriseIntelligenceService({
        pool,
        azureOpenAI: { async createJsonCompletion() { throw new Error('Azure should not be called'); } },
        schedulerService: { async getHistoricalSnapshotContext() { return {}; } },
        config: { domainDelayMs: 0 }
    });

    for (const mfaEnabled of [46, 12]) {
        const totalUsers = 57;
        const dashboardMetrics = {
            totalUsers,
            mfaEnabled,
            mfaMissing: totalUsers - mfaEnabled,
            mfaCoverage: Math.round((mfaEnabled / totalUsers) * 100),
            privilegedUsers: 6,
            adminsWithoutMfa: 1,
            highRiskUsers: 1,
            signInIssues: 57,
            externalUsers: 4,
            unknownDevices: 48,
            multiplePrivilegedRoles: 5,
            securityScore: 82
        };
        const snapshot = {
            ID: 900 + mfaEnabled,
            CompanyID: 1,
            CreatedAt: new Date('2026-06-22T08:00:00.000Z'),
            MetricsJson: JSON.stringify({ identity: { mfaEnabled: 999 }, stackctrl_risk: { domainRiskScores: { identity: 22 } } }),
            ContextJson: JSON.stringify({
                riskEngine: { domainHealthScores: { identity: 78 }, domainRiskScores: { identity: 22 } },
                sources: [{
                    sourceKey: 'identity', status: 'available', isExpected: true,
                    freshness: { lastUpdated: '2026-06-22T07:55:00.000Z', ageMinutes: 5 },
                    metrics: { mfaEnabled: 999 }, dashboardMetrics,
                    sourceLineage: {
                        sourceBuilder: 'storedStackCTRLIdentityEvidence',
                        sourceLayer: 'StackCTRLIdentityEvidenceSnapshots + StackCTRLIdentityUserEvidence',
                        evidenceSnapshotId: 501,
                        evidenceRecordCount: 57,
                        omittedRecordCount: 0
                    },
                    evidence: [
                        { evidenceType: 'users', data: Array.from({ length: 57 }, (_, index) => ({ id: `user-${index + 1}` })) },
                        { evidenceType: 'dashboard_evidence_lists', data: { usersWithoutMfa: Array.from({ length: 11 }, (_, index) => ({ id: `user-${index + 1}` })) } }
                    ]
                }]
            })
        };
        const packageResult = await service.buildDomainPackage({
            companyId: 1,
            snapshot,
            runId: 70,
            domain: ENTERPRISE_DOMAINS[0],
            historicalContext: { comparisons: {} }
        });
        for (const [metric, value] of Object.entries(dashboardMetrics)) {
            assert.equal(packageResult.package.currentMetrics[metric], value, `currentMetrics.${metric}`);
            assert.equal(packageResult.package.dashboardMetrics[metric], value, `dashboardMetrics.${metric}`);
        }
        assert.equal(packageResult.package.dataLineage.sourceBuilder, 'storedStackCTRLIdentityEvidence');
        assert.equal(packageResult.package.dataLineage.evidenceSnapshotId, 501);
        assert.equal(packageResult.package.dataLineage.evidenceRecordCount, 57);
        assert.equal(packageResult.package.dataLineage.evidenceOmittedRecordCount, 0);
        assert.equal(packageResult.audit.stackCTRLDataCount, 57);
        assert.equal(packageResult.audit.evidenceIncludedCount, 57);
        assert.equal(packageResult.audit.omittedCount, 0);
        assert.equal(packageResult.sourceAlignment.mismatches.length, 0);
        assert.equal(packageResult.sourceAlignment.rows.find(row => row.metric === 'mfaEnabled').status, 'MATCH');
    }

    const mismatch = buildDataLineageComparison({
        fields: ['mfaEnabled'],
        sourceValues: { mfaEnabled: 46 },
        inputValues: { mfaEnabled: 12 }
    });
    const failure = sourceAlignmentFailure(mismatch, 'Identity Protection');
    assert.equal(failure.status, 'failed_source_mismatch');
    assert.deepEqual(failure.mismatchedFields, ['mfaEnabled']);
    assert.match(failure.errorMessage, /mfaEnabled/);
});

test('Enterprise blocks missing or stale saved Identity evidence before calling Azure', async () => {
    for (const sourceStatus of ['missing', 'stale']) {
        let insertId = 800;
        let azureCalls = 0;
        const source = {
            sourceKey: 'identity',
            status: sourceStatus,
            isExpected: true,
            freshness: sourceStatus === 'stale'
                ? { lastUpdated: '2026-06-22T05:00:00.000Z', ageMinutes: 180 }
                : { lastUpdated: null, ageMinutes: null },
            warnings: [sourceStatus === 'stale'
                ? 'Identity Protection evidence is stale.'
                : 'No complete StackCTRL Identity evidence snapshot is available. Azure analysis is blocked until collection succeeds.'],
            metrics: sourceStatus === 'stale' ? { totalUsers: 57, mfaCoverage: 81 } : {},
            dashboardMetrics: sourceStatus === 'stale' ? { totalUsers: 57, mfaCoverage: 81 } : {},
            evidence: sourceStatus === 'stale' ? [{ evidenceType: 'users', data: [{ id: 'user-1' }] }] : [],
            sourceLineage: { sourceBuilder: 'storedStackCTRLIdentityEvidence', evidenceSnapshotId: 700 }
        };
        const snapshot = {
            ID: sourceStatus === 'stale' ? 702 : 701,
            CompanyID: 1,
            TenantKey: 'sunbird',
            SnapshotType: 'manual',
            CreatedAt: new Date('2026-06-22T08:00:00.000Z'),
            DataCompletenessScore: sourceStatus === 'stale' ? 100 : 0,
            MetricsJson: JSON.stringify({ stackctrl_risk: { domainRiskScores: { identity: 25 } } }),
            ContextJson: JSON.stringify({
                riskEngine: { domainHealthScores: { identity: 75 }, domainRiskScores: { identity: 25 } },
                sources: [source]
            })
        };
        const calls = [];
        const pool = {
            async query(sql, params = []) {
                calls.push({ sql, params });
                if (sql.includes('FROM StackCTRLTenantEvidenceSnapshots WHERE')) return [[snapshot], []];
                if (sql.includes('FROM StackCTRLKnowledgeBase')) return [[], []];
                if (sql.includes('FROM StackCTRLTenantDomainIntelligence') && sql.includes('RunID <>')) return [[], []];
                if (/^\s*INSERT/i.test(sql)) return [{ insertId: insertId++ }, []];
                return [{ affectedRows: 1 }, []];
            }
        };
        const service = createEnterpriseIntelligenceService({
            pool,
            azureOpenAI: { async createJsonCompletion() { azureCalls += 1; return { data: domainResponse('identity') }; } },
            schedulerService: { async getHistoricalSnapshotContext() { return { comparisons: {} }; } },
            config: { domainDelayMs: 0 }
        });
        const result = await service.runEnterpriseReport({
            companyId: 1,
            snapshotId: snapshot.ID,
            domainKeys: ['identity'],
            includeSynthesis: false
        });
        assert.equal(azureCalls, 0, sourceStatus);
        assert.equal(result.domains[0].status, sourceStatus === 'stale' ? 'blocked_stale_source' : 'blocked_missing_source');
        const auditWrite = calls.find(call => call.sql.includes('INSERT INTO StackCTRLIntelligenceEvidenceAudit'));
        assert.ok(auditWrite);
        assert.equal(auditWrite.params[5], 0);
        assert.match(result.domains[0].errorMessage, /stale|no complete/i);
    }
});

test('enterprise batching splits 3,590 evidence items by count and byte budget', () => {
    const evidence = identityLikeEvidence();
    assert.equal(Object.keys(evidence).length, 4);
    const flattened = flattenDomainEvidence(evidence, { rootPath: 'identity.evidence' });
    assert.equal(flattened.length, 3590);
    assert.ok(flattened.some(item => item.sourcePath === 'identity.evidence.users[0]'));
    assert.ok(flattened.some(item => item.sourcePath === 'identity.evidence.history.daily[89]'));

    const groupedEvidence = Object.entries(evidence).map(([evidenceType, data]) => ({ evidenceType, data }));
    const flattenedGroups = flattenDomainEvidence(groupedEvidence, { rootPath: 'identity.evidence' });
    assert.equal(groupedEvidence.length, 4);
    assert.equal(flattenedGroups.length, 3590);
    assert.equal(flattenedGroups[0].sourceLabel, 'users');

    const countBatches = splitIntoBatches(flattened, { maxItems: 750 });
    assert.deepEqual(countBatches.map(batch => batch.items.length), [750, 750, 750, 750, 590]);

    const byteBatches = splitIntoBatches(
        Array.from({ length: 80 }, (_, index) => ({ id: index, detail: 'x'.repeat(1200) })),
        { maxItems: 750, maxBytes: 50000, estimateBytes: items => Buffer.byteLength(JSON.stringify(items), 'utf8') }
    );
    assert.ok(byteBatches.length > 1);
    assert.ok(byteBatches.every(batch => Buffer.byteLength(JSON.stringify(batch.items), 'utf8') <= 50000));
});

test('enterprise domain packages flatten nested evidence and preserve slim shared context in every batch', async () => {
    const snapshot = {
        ID: 80, CompanyID: 1, TenantKey: 'tenant-sunbird', SnapshotType: 'manual',
        CreatedAt: new Date('2026-06-22T08:00:00.000Z'), DataCompletenessScore: 100,
        MetricsJson: JSON.stringify({ identity: { mfaCoverage: 91 }, stackctrl_risk: { domainRiskScores: { identity: 25 } } }),
        ContextJson: JSON.stringify({
            riskEngine: { domainHealthScores: { identity: 75 }, domainRiskScores: { identity: 25 } },
            sources: [{
                sourceKey: 'identity', status: 'available', isExpected: true,
                metrics: { mfaCoverage: 91 }, dashboardMetrics: { privilegedUsers: 20 },
                calculatedIndicators: { usersWithoutMfa: 3 }, evidence: identityLikeEvidence()
            }]
        })
    };
    const pool = {
        async query(sql) {
            if (sql.includes('FROM StackCTRLKnowledgeBase')) return [[], []];
            if (sql.includes('FROM StackCTRLTenantDomainIntelligence') && sql.includes('RunID <>')) return [[], []];
            throw new Error(`Unexpected query: ${sql}`);
        }
    };
    const service = createEnterpriseIntelligenceService({
        pool,
        azureOpenAI: { async createJsonCompletion() { throw new Error('Azure should not be called'); } },
        schedulerService: { async getHistoricalSnapshotContext() { return {}; } },
        config: { domainDelayMs: 0, maxItemsPerBatch: 750 }
    });
    const historicalContext = {
        comparisons: {
            '24_hours': {
                availability: 'available', differenceMinutes: 1440, metricChanges: {},
                snapshot: {
                    snapshotId: 79, createdAt: new Date('2026-06-21T08:00:00.000Z'),
                    context: { sources: [{ sourceKey: 'identity', status: 'available', metrics: { mfaCoverage: 90 } }], riskEngine: { domainHealthScores: { identity: 74 }, domainRiskScores: { identity: 26 } } },
                    metrics: { identity: { mfaCoverage: 90 } }
                }
            }
        }
    };

    const packageResult = await service.buildDomainPackage({
        companyId: 1,
        snapshot,
        runId: 900,
        domain: ENTERPRISE_DOMAINS[0],
        historicalContext
    });
    assert.equal(packageResult.audit.stackCTRLDataCount, 3590);
    assert.equal(packageResult.audit.evidenceIncludedCount, 3590);
    assert.equal(packageResult.package.evidence.length, 0);

    const batches = splitIntoBatches(packageResult.allEvidence, { maxItems: 750 });
    assert.equal(batches.length, 5);
    const batchPackages = batches.map((batch, index) => service.buildDomainBatchPackage(
        packageResult.package,
        batch.items,
        index + 1,
        batches.length
    ));
    for (const [index, batchPackage] of batchPackages.entries()) {
        assert.equal(batchPackage.batchMetadata.batchNumber, index + 1);
        assert.equal(batchPackage.batchMetadata.totalBatches, 5);
        assert.equal(batchPackage.evidence.length, batches[index].items.length);
        assert.equal(batchPackage.current.healthScore, 75);
        assert.equal(batchPackage.current.riskScore, 25);
        assert.equal(batchPackage.current.riskLevel, 'moderate');
        assert.equal(batchPackage.current.metrics.mfaCoverage, 91);
        assert.equal(batchPackage.historicalComparisons['24_hours'].availability, 'available');
        assert.equal(Object.hasOwn(batchPackage.current, 'evidence'), false);
        assert.ok(batchPackage.evidence.every(item => item.sourcePath && item.sourceLabel));
    }
});

test('enterprise rate-limit circuit stops remaining batches and records zero analysed items', async () => {
    const calls = [];
    let azureCalls = 0;
    let insertId = 500;
    const evidence = identityLikeEvidence();
    const snapshot = {
        ID: 79, CompanyID: 1, TenantKey: 'tenant-sunbird', SnapshotType: 'manual',
        CreatedAt: new Date('2026-06-22T08:00:00.000Z'), DataCompletenessScore: 100,
        MetricsJson: JSON.stringify({ stackctrl_risk: { domainRiskScores: { identity: 25, devices: 20 } } }),
        ContextJson: JSON.stringify({
            riskEngine: { domainHealthScores: { identity: 75, devices: 80 }, domainRiskScores: { identity: 25, devices: 20 } },
            sources: [
                { sourceKey: 'identity', status: 'available', evidence },
                { sourceKey: 'devices', status: 'available', evidence: [{ evidenceType: 'metric', data: { id: 1 } }] }
            ]
        })
    };
    const pool = {
        async query(sql, params = []) {
            calls.push({ sql, params });
            assert.equal((sql.match(/\?/g) || []).length, params.length, `Placeholder mismatch in ${sql}`);
            if (sql.includes('FROM StackCTRLTenantEvidenceSnapshots WHERE')) return [[snapshot], []];
            if (sql.includes('FROM StackCTRLKnowledgeBase')) return [[], []];
            if (sql.includes('FROM StackCTRLTenantDomainIntelligence') && sql.includes('RunID <>')) return [[], []];
            if (/^\s*INSERT/i.test(sql)) return [{ insertId: insertId++ }, []];
            return [{ affectedRows: 1 }, []];
        }
    };
    const service = createEnterpriseIntelligenceService({
        pool,
        schedulerService: { async getHistoricalSnapshotContext() { return { comparisons: {} }; } },
        azureOpenAI: {
            async createJsonCompletion(options) {
                azureCalls += 1;
                assert.equal(options.maxRetriesOverride, 0);
                const error = new Error('Azure capacity is temporarily unavailable');
                error.azureMetadata = {
                    statusCode: 429,
                    rateLimited: true,
                    retryAfterMs: 600000,
                    requestSizeBytes: 45000,
                    retryCount: 0
                };
                throw error;
            }
        },
        logger: { info() {}, warn() {}, error() {} },
        wait: async () => {},
        config: { domainDelayMs: 0, maxRetries: 0, maxItemsPerBatch: 750 }
    });

    const result = await service.runEnterpriseReport({
        companyId: 1,
        snapshotId: 79,
        domainKeys: ['identity', 'devices'],
        includeSynthesis: true
    });

    assert.equal(azureCalls, 1);
    assert.equal(result.status, 'failed_rate_limited', JSON.stringify(result));
    assert.equal(result.rateLimited, true);
    assert.equal(result.rateLimit.retryAfterMs, 600000);
    assert.equal(result.domains.length, 1);
    assert.equal(result.domains[0].status, 'failed_rate_limited');
    assert.equal(result.synthesisId, null);

    const batchWrite = calls.find(call => call.sql.includes('INSERT INTO StackCTRLTenantDomainIntelligenceBatches'));
    assert.ok(batchWrite);
    assert.equal(batchWrite.params[6], 5);
    assert.equal(batchWrite.params[8], 3590);
    assert.equal(batchWrite.params[9], 750);
    assert.equal(batchWrite.params[10], 0);
    assert.match(batchWrite.params[19], /"recommendedRetryAfterMs":600000/);

    const auditWrite = calls.find(call => call.sql.includes('INSERT INTO StackCTRLIntelligenceEvidenceAudit'));
    assert.ok(auditWrite);
    assert.equal(auditWrite.params[4], 3590);
    assert.equal(auditWrite.params[5], 0);
    assert.equal(auditWrite.params[8], 3590);

    await assert.rejects(
        service.runEnterpriseReport({ companyId: 1, snapshotId: 79, domainKeys: ['devices'], includeSynthesis: false }),
        error => error.enterpriseStatus === 'failed_rate_limited' && /circuit is open/.test(error.message)
    );
    assert.equal(azureCalls, 1);
});

test('enterprise invalid JSON triggers repair retry and stores repaired batch details', async () => {
    const calls = [];
    let azureCalls = 0;
    let insertId = 300;
    const snapshot = {
        ID: 77, CompanyID: 1, TenantKey: 'tenant-sunbird', SnapshotType: 'manual',
        CreatedAt: new Date('2026-06-22T08:00:00.000Z'), DataCompletenessScore: 100,
        MetricsJson: JSON.stringify({ identity: { mfaCoverage: 90 }, stackctrl_risk: { domainRiskScores: { identity: 25 } }, executive_kpis: { identityHealth: 75 } }),
        ContextJson: JSON.stringify({
            riskEngine: { domainHealthScores: { identity: 75 }, domainRiskScores: { identity: 25 }, executiveKPIs: { identityHealth: 75 } },
            sources: [{ sourceKey: 'identity', status: 'available', isExpected: true, evidence: [{ evidenceType: 'metric_summary', data: { usersWithoutMfa: 2 } }] }]
        })
    };
    const pool = {
        async query(sql, params = []) {
            calls.push({ sql, params });
            assert.equal((sql.match(/\?/g) || []).length, params.length, `Placeholder mismatch in ${sql}`);
            if (sql.includes('FROM StackCTRLTenantEvidenceSnapshots WHERE')) return [[snapshot], []];
            if (sql.includes('FROM StackCTRLKnowledgeBase')) return [[], []];
            if (sql.includes('FROM StackCTRLTenantDomainIntelligence') && sql.includes('RunID <>')) return [[], []];
            if (/^\s*INSERT/i.test(sql)) return [{ insertId: insertId++ }, []];
            return [{ affectedRows: 1 }, []];
        }
    };
    const service = createEnterpriseIntelligenceService({
        pool,
        schedulerService: { async getHistoricalSnapshotContext() { return { comparisons: {} }; } },
        azureOpenAI: {
            async createJsonCompletion() {
                azureCalls += 1;
                if (azureCalls === 1) return { data: '{"domainExecutiveSummary":', requestSizeBytes: 100, responseSizeBytes: 20, retryCount: 0, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
                return { data: domainResponse('identity'), requestSizeBytes: 50, responseSizeBytes: 200, retryCount: 0, usage: { input_tokens: 5, output_tokens: 20, total_tokens: 25 } };
            }
        },
        wait: async () => {},
        config: { domainDelayMs: 0 }
    });

    const result = await service.runEnterpriseReport({ companyId: 1, snapshotId: 77, domainKeys: ['identity'], includeSynthesis: false });
    assert.equal(result.status, 'completed');
    assert.equal(azureCalls, 2);
    const batchWrite = calls.find(call => call.sql.includes('StackCTRLTenantDomainIntelligenceBatches'));
    assert.ok(batchWrite);
    assert.match(batchWrite.params.join(' '), /"jsonRepaired":true/);
});

test('enterprise invalid JSON failure stores diagnostics and failed_invalid_json status', async () => {
    const calls = [];
    let insertId = 400;
    const snapshot = {
        ID: 78, CompanyID: 1, TenantKey: 'tenant-sunbird', SnapshotType: 'manual',
        CreatedAt: new Date('2026-06-22T08:00:00.000Z'), DataCompletenessScore: 100,
        MetricsJson: JSON.stringify({ identity: { mfaCoverage: 90 }, stackctrl_risk: { domainRiskScores: { identity: 25 } }, executive_kpis: { identityHealth: 75 } }),
        ContextJson: JSON.stringify({
            riskEngine: { domainHealthScores: { identity: 75 }, domainRiskScores: { identity: 25 }, executiveKPIs: { identityHealth: 75 } },
            sources: [{ sourceKey: 'identity', status: 'available', isExpected: true, evidence: [{ evidenceType: 'metric_summary', data: { usersWithoutMfa: 2 } }] }]
        })
    };
    const pool = {
        async query(sql, params = []) {
            calls.push({ sql, params });
            assert.equal((sql.match(/\?/g) || []).length, params.length, `Placeholder mismatch in ${sql}`);
            if (sql.includes('FROM StackCTRLTenantEvidenceSnapshots WHERE')) return [[snapshot], []];
            if (sql.includes('FROM StackCTRLKnowledgeBase')) return [[], []];
            if (sql.includes('FROM StackCTRLTenantDomainIntelligence') && sql.includes('RunID <>')) return [[], []];
            if (/^\s*INSERT/i.test(sql)) return [{ insertId: insertId++ }, []];
            return [{ affectedRows: 1 }, []];
        }
    };
    const service = createEnterpriseIntelligenceService({
        pool,
        schedulerService: { async getHistoricalSnapshotContext() { return { comparisons: {} }; } },
        azureOpenAI: {
            async createJsonCompletion() {
                return { data: '{"domainExecutiveSummary":', requestSizeBytes: 100, responseSizeBytes: 20, retryCount: 0, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } };
            }
        },
        wait: async () => {},
        config: { domainDelayMs: 0 }
    });

    const result = await service.runEnterpriseReport({ companyId: 1, snapshotId: 78, domainKeys: ['identity'], includeSynthesis: false });
    assert.equal(result.status, 'failed_invalid_json');
    assert.equal(result.domains[0].status, 'failed_invalid_json');
    const batchWrite = calls.find(call => call.sql.includes('StackCTRLTenantDomainIntelligenceBatches'));
    assert.ok(batchWrite.params.includes('failed_invalid_json'));
    assert.ok(batchWrite.params.includes('{"domainExecutiveSummary":'));
    assert.match(batchWrite.params.join(' '), /JSON parse failed/);
});

test('enterprise automation does nothing outside the controlled daily window', async () => {
    let queryCount = 0;
    const service = createEnterpriseIntelligenceService({
        pool: { async query() { queryCount++; return [[], []]; } },
        azureOpenAI: { async createJsonCompletion() { throw new Error('Azure should not be called'); } },
        schedulerService: { async getHistoricalSnapshotContext() { return {}; } },
        config: { domainDelayMs: 0 }
    });
    const result = await service.runScheduledTick({ now: new Date('2026-06-22T06:00:00.000Z') });
    assert.equal(result.status, 'not_due');
    assert.equal(queryCount, 0);
});

test('Enterprise Device currentMetrics follow stored dashboard metrics and flatten per-device evidence', async () => {
    const pool = {
        async query(sql) {
            if (sql.includes('FROM StackCTRLKnowledgeBase')) return [[], []];
            if (sql.includes('FROM StackCTRLTenantDomainIntelligence') && sql.includes('RunID <>')) return [[], []];
            throw new Error(`Unexpected query: ${sql}`);
        }
    };
    const service = createEnterpriseIntelligenceService({
        pool,
        azureOpenAI: { async createJsonCompletion() { throw new Error('Azure should not be called'); } },
        schedulerService: { async getHistoricalSnapshotContext() { return {}; } },
        config: { domainDelayMs: 0 }
    });
    const dashboardMetrics = {
        totalDevices: 17,
        compliantDevices: 13,
        nonCompliantDevices: 3,
        complianceRate: 76,
        encryptedDevices: 17,
        encryptionRate: 100,
        activeDevices24h: 12,
        staleDevices: 1,
        dead30Days: 4,
        highRiskDevices: 4,
        unmanagedDevices: 0,
        securityAlerts: 19,
        deviceSecurityScore: 82
    };
    const snapshot = {
        ID: 910,
        CompanyID: 1,
        CreatedAt: new Date('2026-06-22T08:00:00.000Z'),
        MetricsJson: JSON.stringify({ devices: { complianceRate: 99 }, stackctrl_risk: { domainRiskScores: { devices: 22 } } }),
        ContextJson: JSON.stringify({
            riskEngine: { domainHealthScores: { devices: 78 }, domainRiskScores: { devices: 22 } },
            sources: [{
                sourceKey: 'devices', status: 'available', isExpected: true,
                freshness: { lastUpdated: '2026-06-22T07:55:00.000Z', ageMinutes: 5 },
                metrics: { complianceRate: 99 }, dashboardMetrics,
                sourceLineage: {
                    sourceBuilder: 'storedStackCTRLDeviceEvidence',
                    sourceLayer: 'StackCTRLDeviceEvidenceSnapshots + StackCTRLDeviceEvidence',
                    evidenceSnapshotId: 801,
                    evidenceRecordCount: 17,
                    omittedRecordCount: 0
                },
                evidence: [
                    { evidenceType: 'devices', data: Array.from({ length: 17 }, (_, index) => ({ id: `device-${index + 1}`, deviceName: `Device ${index + 1}` })) }
                ]
            }]
        })
    };
    const packageResult = await service.buildDomainPackage({
        companyId: 1,
        snapshot,
        runId: 71,
        domain: ENTERPRISE_DOMAINS.find(domain => domain.key === 'devices'),
        historicalContext: { comparisons: {} }
    });
    for (const metric of DEVICE_LINEAGE_FIELDS.filter(field => !['healthScore', 'riskScore', 'sourceHealth.evidenceCount', 'snapshotId', 'sourceLastUpdated'].includes(field))) {
        assert.equal(packageResult.package.currentMetrics[metric], dashboardMetrics[metric], `currentMetrics.${metric}`);
        assert.equal(packageResult.package.dashboardMetrics[metric], dashboardMetrics[metric], `dashboardMetrics.${metric}`);
    }
    assert.equal(packageResult.package.dataLineage.sourceBuilder, 'storedStackCTRLDeviceEvidence');
    assert.equal(packageResult.package.dataLineage.evidenceSnapshotId, 801);
    assert.equal(packageResult.package.dataLineage.evidenceRecordCount, 17);
    assert.equal(packageResult.package.dataLineage.evidenceOmittedRecordCount, 0);
    assert.equal(packageResult.audit.stackCTRLDataCount, 17);
    assert.equal(packageResult.audit.evidenceIncludedCount, 17);
    assert.equal(packageResult.audit.omittedCount, 0);
    assert.equal(packageResult.sourceAlignment.mismatches.length, 0);
    assert.equal(packageResult.sourceAlignment.rows.find(row => row.metric === 'complianceRate').status, 'MATCH');
});

test('Enterprise Email currentMetrics follow stored dashboard metrics and flatten row-level evidence', async () => {
    const pool = {
        async query(sql) {
            if (sql.includes('FROM StackCTRLKnowledgeBase')) return [[], []];
            if (sql.includes('FROM StackCTRLTenantDomainIntelligence') && sql.includes('RunID <>')) return [[], []];
            throw new Error(`Unexpected query: ${sql}`);
        }
    };
    const service = createEnterpriseIntelligenceService({
        pool,
        azureOpenAI: { async createJsonCompletion() { throw new Error('Azure should not be called'); } },
        schedulerService: { async getHistoricalSnapshotContext() { return {}; } },
        config: { domainDelayMs: 0 }
    });
    const dashboardMetrics = {
        activeThreats: 6,
        highSeverityAlerts: 0,
        affectedUsersCount: 8,
        activeIncidents: 0,
        securityScore: 88,
        threatResolutionRate: 0,
        phishingCount: 1,
        malwareCount: 0,
        spamCount: 0,
        becCount: 0,
        activeMailboxes: 36,
        totalMailActivity: 11867,
        sendCount: 1430,
        receiveCount: 4759,
        readCount: 5678,
        recommendationsCount: 3
    };
    const snapshot = {
        ID: 911,
        CompanyID: 1,
        CreatedAt: new Date('2026-06-22T08:00:00.000Z'),
        MetricsJson: JSON.stringify({ email_security: { activeThreats: 99 }, stackctrl_risk: { domainRiskScores: { email: 22 } } }),
        ContextJson: JSON.stringify({
            riskEngine: { domainHealthScores: { email: 78 }, domainRiskScores: { email: 22 } },
            sources: [{
                sourceKey: 'email_security', status: 'available', isExpected: true,
                freshness: { lastUpdated: '2026-06-22T07:55:00.000Z', ageMinutes: 5 },
                metrics: { activeThreats: 99 }, dashboardMetrics,
                sourceLineage: {
                    sourceBuilder: 'storedStackCTRLEmailEvidence',
                    sourceLayer: 'StackCTRLEmailEvidenceSnapshots + StackCTRLEmailEvidence',
                    evidenceSnapshotId: 901,
                    evidenceRecordCount: 42,
                    omittedRecordCount: 0
                },
                evidence: [
                    { evidenceType: 'alerts', data: Array.from({ length: 6 }, (_, index) => ({ id: `alert-${index + 1}` })) },
                    { evidenceType: 'incidents', data: [] },
                    { evidenceType: 'mailActivityUsers', data: Array.from({ length: 36 }, (_, index) => ({ userPrincipalName: `user${index + 1}` })) }
                ]
            }]
        })
    };
    const packageResult = await service.buildDomainPackage({
        companyId: 1,
        snapshot,
        runId: 72,
        domain: ENTERPRISE_DOMAINS.find(domain => domain.key === 'email_security'),
        historicalContext: { comparisons: {} }
    });
    for (const metric of EMAIL_LINEAGE_FIELDS.filter(field => !['healthScore', 'riskScore', 'sourceHealth.evidenceCount', 'snapshotId', 'sourceLastUpdated'].includes(field))) {
        assert.equal(packageResult.package.currentMetrics[metric], dashboardMetrics[metric], `currentMetrics.${metric}`);
    }
    assert.equal(packageResult.package.dataLineage.sourceBuilder, 'storedStackCTRLEmailEvidence');
    assert.equal(packageResult.audit.stackCTRLDataCount, 42);
    assert.equal(packageResult.sourceAlignment.mismatches.length, 0);
});

test('Enterprise Network currentMetrics follow stored dashboard metrics and flatten row-level evidence', async () => {
    const pool = {
        async query(sql) {
            if (sql.includes('FROM StackCTRLKnowledgeBase')) return [[], []];
            if (sql.includes('FROM StackCTRLTenantDomainIntelligence') && sql.includes('RunID <>')) return [[], []];
            throw new Error(`Unexpected query: ${sql}`);
        }
    };
    const service = createEnterpriseIntelligenceService({
        pool,
        azureOpenAI: { async createJsonCompletion() { throw new Error('Azure should not be called'); } },
        schedulerService: { async getHistoricalSnapshotContext() { return {}; } },
        config: { domainDelayMs: 0 }
    });
    const dashboardMetrics = {
        protectedApps: 4,
        enrolledDevices: 12,
        gatewayPolicies: 8,
        activeGatewayPolicies: 7,
        deniedAccessEvents: 1,
        recentAccessEvents: 15,
        networkSecurityScore: 91,
        dlpProfiles: 2,
        identityProviders: 1,
        sectionErrors: 0
    };
    const snapshot = {
        ID: 912,
        CompanyID: 1,
        CreatedAt: new Date('2026-06-22T08:00:00.000Z'),
        MetricsJson: JSON.stringify({ cloudflare_network_security: { protectedApps: 99 }, stackctrl_risk: { domainRiskScores: { network: 18 } } }),
        ContextJson: JSON.stringify({
            riskEngine: { domainHealthScores: { network: 82 }, domainRiskScores: { network: 18 } },
            sources: [{
                sourceKey: 'cloudflare_network_security', status: 'available', isExpected: true,
                freshness: { lastUpdated: '2026-06-22T07:55:00.000Z', ageMinutes: 5 },
                metrics: { protectedApps: 99 }, dashboardMetrics,
                sourceLineage: {
                    sourceBuilder: 'storedStackCTRLNetworkEvidence',
                    sourceLayer: 'StackCTRLNetworkEvidenceSnapshots + StackCTRLNetworkEvidence',
                    evidenceSnapshotId: 1001,
                    evidenceRecordCount: 42,
                    omittedRecordCount: 0
                },
                evidence: [
                    { evidenceType: 'accessApps', data: Array.from({ length: 4 }, (_, index) => ({ id: `app-${index + 1}` })) },
                    { evidenceType: 'devices', data: Array.from({ length: 12 }, (_, index) => ({ id: `device-${index + 1}` })) },
                    { evidenceType: 'gatewayRules', data: Array.from({ length: 8 }, (_, index) => ({ id: `rule-${index + 1}` })) },
                    { evidenceType: 'accessLogs', data: Array.from({ length: 15 }, (_, index) => ({ id: `log-${index + 1}` })) },
                    { evidenceType: 'dlpProfiles', data: [{ id: 'dlp-1' }, { id: 'dlp-2' }] },
                    { evidenceType: 'warpProfiles', data: [{ id: 'warp-1' }] }
                ]
            }]
        })
    };
    const packageResult = await service.buildDomainPackage({
        companyId: 1,
        snapshot,
        runId: 73,
        domain: ENTERPRISE_DOMAINS.find(domain => domain.key === 'cloudflare_network_security'),
        historicalContext: { comparisons: {} }
    });
    for (const metric of NETWORK_LINEAGE_FIELDS.filter(field => !['healthScore', 'riskScore', 'sourceHealth.evidenceCount', 'snapshotId', 'sourceLastUpdated'].includes(field))) {
        assert.equal(packageResult.package.currentMetrics[metric], dashboardMetrics[metric], `currentMetrics.${metric}`);
    }
    assert.equal(packageResult.package.dataLineage.sourceBuilder, 'storedStackCTRLNetworkEvidence');
    assert.equal(packageResult.audit.stackCTRLDataCount, 42);
    assert.equal(packageResult.sourceAlignment.mismatches.length, 0);
});

test('Enterprise Governance, Compliance, and Operations use saved API rows and document manual exclusions', async () => {
    const pool = {
        async query(sql) {
            if (sql.includes('FROM StackCTRLKnowledgeBase')) return [[], []];
            if (sql.includes('FROM StackCTRLTenantDomainIntelligence') && sql.includes('RunID <>')) return [[], []];
            throw new Error(`Unexpected query: ${sql}`);
        }
    };
    const service = createEnterpriseIntelligenceService({
        pool,
        azureOpenAI: { async createJsonCompletion() { throw new Error('Azure should not be called'); } },
        schedulerService: { async getHistoricalSnapshotContext() { return {}; } },
        config: { domainDelayMs: 0 }
    });
    const cases = [
        { key: 'governance', builder: 'storedStackCTRLGovernanceEvidence', evidenceType: 'governanceRows', apiRows: 4, manualRows: 2, metrics: { totalRows: 6, apiConnectedRows: 4, manualRowsExcluded: 2 } },
        { key: 'compliance', builder: 'storedStackCTRLComplianceEvidence', evidenceType: 'controls', apiRows: 5, manualRows: 3, metrics: { totalControls: 8, apiControls: 5, manualControlsExcluded: 3 } },
        { key: 'operations', builder: 'storedStackCTRLOperationsEvidence', evidenceType: 'tasks', apiRows: 3, manualRows: 4, metrics: { totalTasks: 7, apiTasks: 3, manualTasksExcluded: 4 } }
    ];

    for (const [index, item] of cases.entries()) {
        const snapshot = {
            ID: 920 + index,
            CompanyID: 1,
            CreatedAt: new Date('2026-06-23T08:00:00.000Z'),
            MetricsJson: JSON.stringify({ stackctrl_risk: { domainRiskScores: { [item.key]: 20 } } }),
            ContextJson: JSON.stringify({
                riskEngine: { domainHealthScores: { [item.key]: 80 }, domainRiskScores: { [item.key]: 20 } },
                sources: [{
                    sourceKey: item.key,
                    status: 'available',
                    isExpected: true,
                    freshness: { lastUpdated: '2026-06-23T07:55:00.000Z', ageMinutes: 5 },
                    metrics: item.metrics,
                    dashboardMetrics: item.metrics,
                    sourceLineage: {
                        sourceBuilder: item.builder,
                        evidenceSnapshotId: 1100 + index,
                        collectionStatus: 'complete',
                        isComplete: true,
                        totalRows: item.apiRows + item.manualRows,
                        apiConnectedRows: item.apiRows,
                        manualRowsExcluded: item.manualRows,
                        evidenceRecordCount: item.apiRows,
                        omittedRecordCount: item.manualRows
                    },
                    evidence: [{ evidenceType: item.evidenceType, data: Array.from({ length: item.apiRows }, (_, rowIndex) => ({ id: `${item.key}-${rowIndex + 1}` })) }]
                }]
            })
        };
        const packageResult = await service.buildDomainPackage({
            companyId: 1,
            snapshot,
            runId: 80 + index,
            domain: ENTERPRISE_DOMAINS.find(domain => domain.key === item.key),
            historicalContext: { comparisons: {} }
        });

        assert.equal(packageResult.audit.stackCTRLDataCount, item.apiRows, item.key);
        assert.equal(packageResult.audit.preparedForAzureCount, item.apiRows, item.key);
        assert.equal(packageResult.audit.omittedCount, item.manualRows, item.key);
        assert.equal(packageResult.package.dataLineage.totalRows, item.apiRows + item.manualRows, item.key);
        assert.equal(packageResult.package.dataLineage.apiConnectedRows, item.apiRows, item.key);
        assert.equal(packageResult.package.dataLineage.manualRowsExcluded, item.manualRows, item.key);
        assert.match(packageResult.package.limitations.missingDataWarnings.join(' '), /intentionally excluded from Azure input/, item.key);
    }
});

test('Enterprise blocks missing or stale saved Device evidence before calling Azure', async () => {
    for (const sourceStatus of ['missing', 'stale']) {
        let insertId = 900;
        let azureCalls = 0;
        const source = {
            sourceKey: 'devices',
            status: sourceStatus,
            isExpected: true,
            freshness: sourceStatus === 'stale'
                ? { lastUpdated: '2026-06-22T05:00:00.000Z', ageMinutes: 180 }
                : { lastUpdated: null, ageMinutes: null },
            warnings: [sourceStatus === 'stale'
                ? 'Device Protection evidence is stale.'
                : 'No complete StackCTRL Device Protection evidence snapshot is available. Azure analysis is blocked until collection succeeds.'],
            metrics: sourceStatus === 'stale' ? { totalDevices: 17, complianceRate: 76 } : {},
            dashboardMetrics: sourceStatus === 'stale' ? { totalDevices: 17, complianceRate: 76 } : {},
            evidence: sourceStatus === 'stale' ? [{ evidenceType: 'devices', data: [{ id: 'device-1' }] }] : [],
            sourceLineage: { sourceBuilder: 'storedStackCTRLDeviceEvidence', evidenceSnapshotId: 801 }
        };
        const snapshot = {
            ID: sourceStatus === 'stale' ? 912 : 911,
            CompanyID: 1,
            TenantKey: 'sunbird',
            SnapshotType: 'manual',
            CreatedAt: new Date('2026-06-22T08:00:00.000Z'),
            DataCompletenessScore: sourceStatus === 'stale' ? 100 : 0,
            MetricsJson: JSON.stringify({ stackctrl_risk: { domainRiskScores: { devices: 25 } } }),
            ContextJson: JSON.stringify({
                riskEngine: { domainHealthScores: { devices: 75 }, domainRiskScores: { devices: 25 } },
                sources: [source]
            })
        };
        const calls = [];
        const pool = {
            async query(sql, params = []) {
                calls.push({ sql, params });
                if (sql.includes('FROM StackCTRLTenantEvidenceSnapshots WHERE')) return [[snapshot], []];
                if (sql.includes('FROM StackCTRLKnowledgeBase')) return [[], []];
                if (sql.includes('FROM StackCTRLTenantDomainIntelligence') && sql.includes('RunID <>')) return [[], []];
                if (/^\s*INSERT/i.test(sql)) return [{ insertId: insertId++ }, []];
                return [{ affectedRows: 1 }, []];
            }
        };
        const service = createEnterpriseIntelligenceService({
            pool,
            azureOpenAI: { async createJsonCompletion() { azureCalls += 1; return { data: domainResponse('devices') }; } },
            schedulerService: { async getHistoricalSnapshotContext() { return { comparisons: {} }; } },
            config: { domainDelayMs: 0 }
        });
        const result = await service.runEnterpriseReport({
            companyId: 1,
            snapshotId: snapshot.ID,
            domainKeys: ['devices'],
            includeSynthesis: false
        });
        assert.equal(azureCalls, 0, sourceStatus);
        assert.equal(result.domains[0].status, sourceStatus === 'stale' ? 'blocked_stale_source' : 'blocked_missing_source');
        const auditWrite = calls.find(call => call.sql.includes('INSERT INTO StackCTRLIntelligenceEvidenceAudit'));
        assert.ok(auditWrite);
        assert.equal(auditWrite.params[5], 0);
        assert.match(result.domains[0].errorMessage, /stale|no complete/i);
    }
});

test('all required enterprise domain modes are registered', () => {
    assert.equal(ENTERPRISE_DOMAINS.length, 10);
    for (const domain of ENTERPRISE_DOMAINS) assert.match(domain.mode, /^enterprise_domain_/);
    assert.deepEqual(new Set(ENTERPRISE_DOMAINS.map(domain => domain.key)), new Set([
        'identity', 'devices', 'email_security', 'cloudflare_network_security', 'governance',
        'compliance', 'security_alerts', 'operations', 'backup', 'applications'
    ]));
});
