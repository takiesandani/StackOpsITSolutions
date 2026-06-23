const DEFAULT_EMAIL_EVIDENCE_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_EMAIL_EVIDENCE_STARTUP_DELAY_MS = 45 * 1000;

function createEmailEvidenceAutomation({
    collectAll,
    enabled = true,
    intervalMs = DEFAULT_EMAIL_EVIDENCE_INTERVAL_MS,
    startupDelayMs = DEFAULT_EMAIL_EVIDENCE_STARTUP_DELAY_MS,
    logger = console
} = {}) {
    if (typeof collectAll !== 'function') throw new Error('Email evidence automation requires a collector');
    const safeIntervalMs = Math.max(60 * 1000, Number(intervalMs) || DEFAULT_EMAIL_EVIDENCE_INTERVAL_MS);
    const safeStartupDelayMs = Math.max(0, Number(startupDelayMs) || 0);
    let intervalHandle = null;
    let startupHandle = null;
    let running = false;
    let lastStartedAt = null;
    let lastCompletedAt = null;
    let lastResult = null;
    let lastError = null;

    async function runOnce(trigger = 'manual') {
        if (!enabled) return { status: 'disabled', trigger };
        if (running) return { status: 'skipped_overlap', trigger };
        running = true;
        lastStartedAt = new Date().toISOString();
        lastError = null;
        try {
            lastResult = await collectAll({ trigger });
            return { status: 'completed', trigger, result: lastResult };
        } catch (error) {
            lastError = String(error?.message || error);
            logger.error('[Email Evidence] Collection failed:', lastError);
            return { status: 'failed', trigger, message: lastError };
        } finally {
            running = false;
            lastCompletedAt = new Date().toISOString();
        }
    }

    function start() {
        if (!enabled || intervalHandle || startupHandle) return getStatus();
        startupHandle = setTimeout(() => {
            startupHandle = null;
            runOnce('startup').catch(error => logger.error('[Email Evidence] Startup collection failed:', error.message));
        }, safeStartupDelayMs);
        intervalHandle = setInterval(() => {
            runOnce('scheduled_hourly').catch(error => logger.error('[Email Evidence] Scheduled collection failed:', error.message));
        }, safeIntervalMs);
        startupHandle.unref?.();
        intervalHandle.unref?.();
        return getStatus();
    }

    function stop() {
        if (startupHandle) clearTimeout(startupHandle);
        if (intervalHandle) clearInterval(intervalHandle);
        startupHandle = null;
        intervalHandle = null;
        return getStatus();
    }

    function getStatus() {
        return {
            enabled,
            started: Boolean(intervalHandle || startupHandle),
            running,
            intervalMs: safeIntervalMs,
            startupDelayMs: safeStartupDelayMs,
            lastStartedAt,
            lastCompletedAt,
            lastResult,
            lastError
        };
    }

    return { runOnce, start, stop, getStatus };
}

module.exports = {
    DEFAULT_EMAIL_EVIDENCE_INTERVAL_MS,
    DEFAULT_EMAIL_EVIDENCE_STARTUP_DELAY_MS,
    createEmailEvidenceAutomation
};
