const test = require('node:test');
const assert = require('node:assert/strict');

const { createStackCTRLServerAutomation } = require('../services/intelligence/server-automation');

test('server automation runs the existing scheduled tick and records status', async () => {
    const calls = [];
    const automation = createStackCTRLServerAutomation({
        schedulerService: {
            async runScheduledTick(options) {
                calls.push(options);
                return { status: 'completed', companies: [{ companyId: 1, runs: [] }] };
            }
        },
        now: () => new Date('2026-06-22T06:00:00.000Z')
    });

    const result = await automation.runOnce('test');
    assert.equal(result.status, 'completed');
    assert.equal(result.trigger, 'test');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].now.toISOString(), '2026-06-22T06:00:00.000Z');
    assert.equal(automation.getStatus().running, false);
    assert.ok(automation.getStatus().lastCompletedAt);
    assert.equal(automation.getStatus().lastResult.companyCount, 1);
    assert.equal(automation.getStatus().lastResult.companies[0].companyId, 1);
});

test('server automation skips overlapping ticks in the same server instance', async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const automation = createStackCTRLServerAutomation({
        schedulerService: {
            async runScheduledTick() {
                await pending;
                return { status: 'completed', companies: [] };
            }
        }
    });

    const firstRun = automation.runOnce('first');
    const overlap = await automation.runOnce('second');
    assert.equal(overlap.status, 'skipped_overlap');
    release();
    assert.equal((await firstRun).status, 'completed');
});

test('server automation can be disabled and its timers can be stopped', async () => {
    let calls = 0;
    const disabled = createStackCTRLServerAutomation({
        enabled: false,
        schedulerService: { async runScheduledTick() { calls += 1; } },
        logger: { log() {}, warn() {}, error() {} }
    });
    assert.equal(disabled.start().started, false);
    assert.equal((await disabled.runOnce()).status, 'disabled');
    assert.equal(calls, 0);

    const enabled = createStackCTRLServerAutomation({
        schedulerService: { async runScheduledTick() { calls += 1; return { status: 'completed' }; } },
        intervalMs: 30000,
        startupDelayMs: 30000,
        logger: { log() {}, warn() {}, error() {} }
    });
    assert.equal(enabled.start().started, true);
    assert.equal(enabled.stop().started, false);
});
