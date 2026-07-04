const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sqlPath = path.join(__dirname, '..', 'sql', 'stackctrl-enterprise-intelligence.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const expectedViews = [
    'vw_PowerBI_EnterpriseRuns',
    'vw_PowerBI_DomainIntelligence',
    'vw_PowerBI_DomainFindings',
    'vw_PowerBI_DomainRisks',
    'vw_PowerBI_DomainRecommendations',
    'vw_PowerBI_DomainTrends',
    'vw_PowerBI_DomainEvidenceAudit',
    'vw_PowerBI_EnterpriseSynthesis',
    'vw_PowerBI_EnterpriseBoardReport',
    'vw_PowerBI_EnterpriseManagementActions'
];

test('defines every enterprise Power BI view once', () => {
    const names = [...sql.matchAll(/CREATE\s+OR\s+REPLACE\s+SQL\s+SECURITY\s+INVOKER\s+VIEW\s+(vw_PowerBI_[A-Za-z0-9_]+)/gi)].map(match => match[1]);
    assert.deepEqual(names, expectedViews);
    assert.equal(new Set(names.map(name => name.toLowerCase())).size, names.length);
});

test('creates enterprise run, domain, synthesis, audit, item, and knowledge tables', () => {
    for (const table of [
        'StackCTRLEnterpriseReportRuns',
        'StackCTRLTenantDomainIntelligence',
        'StackCTRLEnterpriseSynthesis',
        'StackCTRLIntelligenceEvidenceAudit',
        'StackCTRLEnterpriseIntelligenceItems',
        'StackCTRLKnowledgeBase'
    ]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'));
});

test('enterprise views expose normalized report fields', () => {
    for (const column of [
        'DomainExecutiveSummary', 'TechnicalSummary', 'BusinessImpact', 'CurrentPosture',
        'EvidenceSummary', 'ScoreJustification', 'FindingID', 'RiskID', 'RecommendationID',
        'TrendID', 'ActionID', 'HistoricalComparisonsIncluded', 'AzureMentionedDomain',
        'InputTokens', 'OutputTokens', 'RetryCount', 'EnterpriseExecutiveSummary', 'BoardSummary'
    ]) assert.match(sql, new RegExp(`\\b${column}\\b`, 'i'), `Missing enterprise report field ${column}`);
});

test('enterprise Power BI views never expose raw contexts, raw evidence, or analysis JSON', () => {
    const viewSql = sql.slice(sql.indexOf('CREATE OR REPLACE SQL SECURITY INVOKER VIEW'));
    assert.doesNotMatch(viewSql, /\bContextJson\b/i);
    assert.doesNotMatch(viewSql, /\bCompactContextJson\b/i);
    assert.doesNotMatch(viewSql, /\bAnalysisJson\b/i);
    assert.doesNotMatch(viewSql, /\bFindingsJson\b|\bRisksJson\b|\bRecommendationsJson\b|\bTrendAnalysisJson\b/i);
    assert.doesNotMatch(viewSql, /\bEvidenceJson\b|\bRawReferenceJson\b/i);
    assert.doesNotMatch(viewSql, /JSON_TABLE\s*\(/i);
});

test('row-based views use normalized enterprise items', () => {
    assert.match(sql, /FROM StackCTRLEnterpriseIntelligenceItems item/i);
    for (const type of ['finding', 'risk', 'recommendation', 'trend', 'management_action']) {
        assert.match(sql, new RegExp(`ItemType[^;]+${type}`, 'i'));
    }
});

