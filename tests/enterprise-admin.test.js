const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'admin-intelligence.html'), 'utf8');
const javascript = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin-intelligence.js'), 'utf8');

test('admin control center includes every enterprise audit action', () => {
    for (const phrase of [
        'Run Enterprise Deep Report',
        'Run Domain Deep Analysis',
        'Run Selected Domain Deep Analysis',
        'Run Enterprise Synthesis',
        'View Enterprise Evidence Audit',
        'Compare StackCTRL Data vs Azure Input',
        'Compare Compact Output vs Enterprise Output',
        'View Domain Intelligence',
        'View Final Enterprise Report'
    ]) assert.match(html, new RegExp(phrase));
});

test('admin audit shows input, omissions, Azure output depth, tokens, retries, and status', () => {
    for (const field of [
        'StackCTRLDataCount', 'SentToAzureCount', 'OmittedCount',
        'InputTokens', 'OutputTokens', 'RetryCount', 'AzureInputSummaryJson',
        'AnalysisJson', 'BatchSummaryJson', 'AzureFinishReason'
    ]) assert.match(javascript, new RegExp(field));
});

test('admin enterprise UI uses clear batch labels and latest/history filters', () => {
    for (const phrase of [
        'Total StackCTRL Data',
        'Prepared for Azure',
        'Successfully Analysed by Azure',
        'Permanently Omitted',
        'Completed Batches',
        'Failed Batches',
        'Latest run only',
        'Show all runs',
        'Failed only',
        'Completed only',
        'Runs all domains and final synthesis. Use selected-domain testing first.'
    ]) assert.match(html, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('enterprise audit title is reset from the currently rendered latest domain', () => {
    assert.match(html, /id="enterprise-audit-title">Enterprise evidence and output audit</);
    assert.match(html, /id="enterprise-audit-subtitle"/);
    assert.match(javascript, /function enterpriseAuditTitle/);
    assert.match(javascript, /function resolveEnterprisePrimaryDomain/);
    assert.match(javascript, /function enterpriseDomainKeyFromMode/);
    assert.match(javascript, /function enterpriseDomainDisplayName/);
    assert.match(javascript, /supportedEnterpriseDomains\.find\(domain => domain\.key === domainKey\)/);
    assert.match(javascript, /el\('enterprise-audit-title'\)\.textContent = enterpriseAuditTitle/);
    assert.match(javascript, /el\('enterprise-audit-subtitle'\)\.textContent/);
    assert.match(javascript, /if \(!showLatestOnly \|\| !latestRunId\) return enterpriseAuditDefaultTitle/);
});

test('enterprise lineage and modal views format object values instead of [object Object]', () => {
    assert.match(javascript, /function formatDisplayValue/);
    assert.match(javascript, /function formatLineageCell/);
    assert.match(javascript, /function openJsonModal/);
    assert.match(html, /id="json-modal-subtitle"/);
    assert.match(html, /id="json-modal-label"/);
    assert.match(javascript, /trimmed === '\[object Object\]'/);
});

test('enterprise input comparison renders run-scoped source lineage', () => {
    for (const heading of ['StackCTRL Source', 'Enterprise Azure Input', 'Azure Output', 'Stored Intelligence', 'Status']) {
        assert.match(html, new RegExp(heading));
    }
    assert.match(html, /id="enterprise-lineage-body"/);
    assert.match(html, /id="enterprise-lineage-summary"/);
    assert.match(javascript, /dataLineageComparison/);
    assert.match(javascript, /AzureInputSummaryJson\?\.dataLineage/);
    assert.match(javascript, /target: event\.currentTarget\.dataset\.enterpriseView === 'input' \? 'lineage' : 'audit'/);
    assert.match(javascript, /lineageMetadata\.sourceBuilder/);
    assert.match(javascript, /lineageAudit\.RunID/);
    assert.match(javascript, /lineageAudit\.SnapshotID/);
});

test('admin enterprise actions render stored failure statuses instead of unconditional success', () => {
    assert.match(javascript, /enterpriseActionMessage/);
    assert.match(javascript, /failed_rate_limited/);
    assert.match(javascript, /Azure rate limit reached/);
    assert.match(javascript, /completed with warnings/);
    assert.match(javascript, /Retry failed domain/);
});
