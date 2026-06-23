const DEFAULT_GOVERNANCE_EVIDENCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_GOVERNANCE_EVIDENCE_STARTUP_DELAY_MS = 120 * 1000;

function createGovernanceEvidenceAutomation({ collectAll, enabled = true, intervalMs = DEFAULT_GOVERNANCE_EVIDENCE_INTERVAL_MS, startupDelayMs = DEFAULT_GOVERNANCE_EVIDENCE_STARTUP_DELAY_MS, logger = console } = {}) {
    if (typeof collectAll !== 'function') throw new Error('Governance evidence automation requires a collector');
    const safeIntervalMs = Math.max(60 * 1000, Number(intervalMs) || DEFAULT_GOVERNANCE_EVIDENCE_INTERVAL_MS);
    let intervalHandle = null;
    let startupHandle = null;
    let running = false;
    async function runOnce(trigger = 'manual') {
        if (!enabled) return { status: 'disabled', trigger };
        if (running) return { status: 'skipped_overlap', trigger };
        running = true;
        try { return { status: 'completed', trigger, result: await collectAll({ trigger }) }; }
        catch (error) { logger.error('[Governance Evidence] Collection failed:', error.message); return { status: 'failed', trigger, message: error.message }; }
        finally { running = false; }
    }
    function start() {
        if (!enabled || intervalHandle || startupHandle) return;
        startupHandle = setTimeout(() => { startupHandle = null; runOnce('startup').catch(() => {}); }, startupDelayMs);
        intervalHandle = setInterval(() => runOnce('scheduled_daily').catch(() => {}), safeIntervalMs);
        startupHandle.unref?.(); intervalHandle.unref?.();
    }
    function stop() { if (startupHandle) clearTimeout(startupHandle); if (intervalHandle) clearInterval(intervalHandle); startupHandle = null; intervalHandle = null; }
    return { runOnce, start, stop, getStatus: () => ({ enabled, intervalMs: safeIntervalMs }) };
}

module.exports = { DEFAULT_GOVERNANCE_EVIDENCE_INTERVAL_MS, createGovernanceEvidenceAutomation };
