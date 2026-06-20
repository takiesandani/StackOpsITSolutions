const crypto = require('crypto');
const express = require('express');

function safeSecretMatch(provided, expected) {
    if (!provided || !expected) return false;
    const providedBuffer = Buffer.from(String(provided));
    const expectedBuffer = Buffer.from(String(expected));
    return providedBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function createStackCTRLSchedulerInternalRouter({ getSecret, schedulerService }) {
    const router = express.Router();
    let cachedSecret = null;
    let secretExpiresAt = 0;

    async function loadSchedulerSecret() {
        if (cachedSecret && secretExpiresAt > Date.now()) return cachedSecret;
        cachedSecret = await getSecret('STACKCTRL_SCHEDULER_SECRET');
        secretExpiresAt = Date.now() + (5 * 60 * 1000);
        return cachedSecret;
    }

    router.post('/scheduled-run', async (req, res) => {
        try {
            const expectedSecret = await loadSchedulerSecret();
            const providedSecret = req.get('X-StackCTRL-Scheduler-Secret');
            if (!safeSecretMatch(providedSecret, expectedSecret)) {
                return res.status(401).json({ success: false, message: 'Unauthorized scheduler request' });
            }

            const companyId = req.body?.companyId == null ? null : Number(req.body.companyId);
            if (companyId != null && (!Number.isInteger(companyId) || companyId <= 0)) {
                return res.status(400).json({ success: false, message: 'companyId must be valid' });
            }
            const result = await schedulerService.runScheduledTick({ companyId });
            res.json({ success: true, ...result });
        } catch (error) {
            console.error('[StackCTRL Intelligence Scheduler] Internal run failed:', error.message);
            res.status(500).json({ success: false, message: 'Scheduled intelligence run failed' });
        }
    });

    return router;
}

module.exports = { createStackCTRLSchedulerInternalRouter };
