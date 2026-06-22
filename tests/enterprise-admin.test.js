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

test('admin enterprise actions render stored failure statuses instead of unconditional success', () => {
    assert.match(javascript, /enterpriseActionMessage/);
    assert.match(javascript, /failed_rate_limited/);
    assert.match(javascript, /Azure rate limit reached/);
    assert.match(javascript, /completed with warnings/);
    assert.match(javascript, /Retry failed domain/);
});
