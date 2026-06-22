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
        'StackCTRLDataCount', 'SentToAzureCount', 'OmittedCount', 'MetricsIncludedCount',
        'HistoricalComparisonsIncluded', 'AzureMentionedDomain', 'RisksReturnedCount',
        'RecommendationsReturnedCount', 'TrendsReturnedCount', 'InputTokens', 'OutputTokens',
        'RetryCount', 'AzureInputSummaryJson', 'AnalysisJson'
    ]) assert.match(javascript, new RegExp(field));
});

