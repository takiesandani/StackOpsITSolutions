const DEFAULT_INTERVAL_MS = 60 * 1000;
const DEFAULT_STARTUP_DELAY_MS = 20 * 1000;

function summarizeTick(result) {
    const companies = Array.isArray(result?.companies) ? result.companies : [];
    return {
        status: result?.status || 'unknown',
        localTime: result?.localTime || null,
        companyCount: companies.length,
        companies: companies.map(company => {
            const runs = Array.isArray(company.runs) ? company.runs : [];
            return {
                companyId: company.companyId,
                runCount: runs.length,
                completed: runs.filter(run => run.status === 'completed').length,
                failed: runs.filter(run => run.status === 'failed').length,
                duplicate: runs.filter(run => run.status === 'duplicate').length
            };
        })
    };
}

function createStackCTRLServerAutomation({
    schedulerService,
    enabled = true,
    intervalMs = DEFAULT_INTERVAL_MS,
    startupDelayMs = DEFAULT_STARTUP_DELAY_MS,
    logger = console,
    now = () => new Date()
} = {}) {
    if (!schedulerService?.runScheduledTick) {
        throw new Error('StackCTRL server automation requires the intelligence scheduler');
    }

    const safeIntervalMs = Math.max(30 * 1000, Number(intervalMs) || DEFAULT_INTERVAL_MS);
    const safeStartupDelayMs = Math.max(0, Number(startupDelayMs) || 0);
    let intervalHandle = null;
    let startupHandle = null;
    let running = false;
    let lastStartedAt = null;
    let lastCompletedAt = null;
    let lastResult = null;
    let lastError = null;

    async function runOnce(trigger = 'timer') {
        if (!enabled) return { status: 'disabled', trigger };
        if (running) return { status: 'skipped_overlap', trigger, lastStartedAt };

        running = true;
        lastStartedAt = new Date().toISOString();
        lastError = null;
        try {
            // The scheduler owns business-hour checks and database deduplication for every tenant.
            const result = await schedulerService.runScheduledTick({ now: now() });
            lastResult = summarizeTick(result);
            return { ...result, trigger };
        } catch (error) {
            lastError = String(error?.message || error);
            logger.error('[StackCTRL Intelligence Automation] Scheduled tick failed:', lastError);
            return { status: 'failed', trigger, message: lastError };
        } finally {
            running = false;
            lastCompletedAt = new Date().toISOString();
        }
    }

    function start() {
        if (!enabled) {
            logger.warn('[StackCTRL Intelligence Automation] Server automation is disabled.');
            return getStatus();
        }
        if (intervalHandle || startupHandle) return getStatus();

        startupHandle = setTimeout(() => {
            startupHandle = null;
            runOnce('startup').catch(error => {
                logger.error('[StackCTRL Intelligence Automation] Startup tick failed:', error.message);
            });
        }, safeStartupDelayMs);
        intervalHandle = setInterval(() => {
            runOnce('interval').catch(error => {
                logger.error('[StackCTRL Intelligence Automation] Timer tick failed:', error.message);
            });
        }, safeIntervalMs);

        // Express keeps the process alive. These handles should not block clean test or shutdown exits.
        startupHandle.unref?.();
        intervalHandle.unref?.();
        logger.log(`[StackCTRL Intelligence Automation] Running in server every ${Math.round(safeIntervalMs / 1000)} seconds.`);
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

    return { start, stop, runOnce, getStatus };
}

module.exports = {
    DEFAULT_INTERVAL_MS,
    DEFAULT_STARTUP_DELAY_MS,
    createStackCTRLServerAutomation
};
