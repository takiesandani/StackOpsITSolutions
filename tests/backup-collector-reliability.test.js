'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runAbortableOperation, acquireConnectionWithDeadline, runDatabaseOperationWithDeadline, createTrackedCollectorRegistry } = require('../services/intelligence/collector-runtime');
const { createBackupEvidenceStore } = require('../services/intelligence/backup-evidence-store');
const { refreshWithDeadline } = require('../services/intelligence/source-adapters');

function waitForAbort(signal) {
    return new Promise((_, reject) => {
        if (signal.aborted) return reject(signal.reason);
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
}

test('Backup HTTP request timeout aborts the underlying request', async () => {
    let aborted = false;
    await assert.rejects(
        runAbortableOperation({
            label: 'Backup Graph CSV request', timeoutMs: 10,
            operation: ({ signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true }))
        }),
        error => error.code === 'STACKCTRL_OPERATION_TIMEOUT'
    );
    assert.equal(aborted, true);
});

test('BackupRecoveryPayloadCache write times out and destroys its database connection', async () => {
    let destroyed = false;
    const connection = { destroy() { destroyed = true; } };
    await assert.rejects(
        runDatabaseOperationWithDeadline({ connection, label: 'BackupRecoveryPayloadCache write', timeoutMs: 10, operation: () => new Promise(() => {}) }),
        error => error.code === 'STACKCTRL_OPERATION_TIMEOUT'
    );
    assert.equal(destroyed, true);
});

test('a late MySQL pool checkout is released after its deadline', async () => {
    let releaseConnection;
    let released = false;
    const pending = new Promise(resolve => { releaseConnection = resolve; });
    const acquisition = acquireConnectionWithDeadline({ getConnection: async () => pending }, { timeoutMs: 10, label: 'Backup pool checkout' });
    await assert.rejects(acquisition, error => error.code === 'STACKCTRL_OPERATION_TIMEOUT');
    releaseConnection({ release() { released = true; } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(released, true);
});

test('persistProcessedEvidence times out and cancels the Backup database connection', async () => {
    let destroyed = false;
    const connection = {
        query: async () => new Promise(() => {}),
        beginTransaction: async () => {},
        destroy() { destroyed = true; },
        release() {}
    };
    const store = createBackupEvidenceStore({ pool: { query: async () => [[], []], getConnection: async () => connection }, logger: { log() {} } });
    await assert.rejects(
        store.persistProcessedEvidence({ companyId: 1, payload: { success: true, oneDrive: {}, sharePoint: {}, exchange: {} }, timeoutMs: 10 }),
        error => error.code === 'STACKCTRL_OPERATION_TIMEOUT'
    );
    assert.equal(destroyed, true);
});

test('a stale shared collector promise is aborted and cannot block a later run', async () => {
    let time = 0;
    const events = [];
    const registry = createTrackedCollectorRegistry({ timeoutMs: 1000, now: () => time, logger: { info(_prefix, detail) { events.push(detail); } } });
    const first = registry.run({ companyId: 1, sourceKey: 'backup', runId: 130, pipelineExecutionId: 'old', execute: ({ signal }) => waitForAbort(signal) });
    time = 1001;
    const second = await registry.run({ companyId: 1, sourceKey: 'backup', runId: 131, pipelineExecutionId: 'new', execute: async () => ({ ok: true }) });
    assert.deepEqual(second, { ok: true });
    await assert.rejects(first, error => error.code === 'STACKCTRL_COLLECTOR_TIMEOUT');
    assert.ok(events.some(event => event.event === 'snapshot_source_refresh_timeout' && event.reusedStalePromise));
});

test('a collector timeout propagates out of the source refresh boundary', async () => {
    await assert.rejects(
        refreshWithDeadline(async (_source, _companyId, { signal }) => waitForAbort(signal), 'backup', 1, 10, { runId: 130, pipelineExecutionId: 'daily' }),
        error => error.code === 'STACKCTRL_SOURCE_REFRESH_TIMEOUT' && error.sourceKey === 'backup'
    );
});

test('a successful Backup persistence still completes normally', async () => {
    let queryCount = 0;
    const connection = {
        async beginTransaction() {}, async commit() {}, async release() {},
        async query() { queryCount += 1; return queryCount === 1 ? [{ insertId: 91 }] : [{ affectedRows: 1 }]; }
    };
    const store = createBackupEvidenceStore({ pool: { query: async () => [[], []], getConnection: async () => connection }, logger: { log() {} } });
    const result = await store.persistProcessedEvidence({ companyId: 1, payload: { success: true, oneDrive: {}, sharePoint: {}, exchange: {} }, timeoutMs: 1500 });
    assert.equal(result.snapshotId, 91);
    assert.ok(queryCount >= 1);
});

test('collector logs include run correlation, source key, elapsed time, and memory supplied by runtime logger', async () => {
    const events = [];
    const registry = createTrackedCollectorRegistry({ logger: { info(_prefix, detail) { events.push({ ...detail, rssMb: 123 }); } } });
    await registry.run({ companyId: 1, sourceKey: 'backup', runId: 130, pipelineExecutionId: '1:enterprise:daily:20260813', execute: async () => null });
    const started = events.find(event => event.event === 'snapshot_source_refresh_started');
    const completed = events.find(event => event.event === 'snapshot_source_refresh_completed');
    assert.equal(started.runId, 130);
    assert.equal(started.pipelineExecutionId, '1:enterprise:daily:20260813');
    assert.equal(started.sourceKey, 'backup');
    assert.equal(completed.companyId, 1);
    assert.ok(Number.isFinite(completed.elapsedMs));
    assert.equal(completed.rssMb, 123);
});
