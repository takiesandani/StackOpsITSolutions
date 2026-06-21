const express = require('express');

function createAdminIntelligenceRouter({ authenticateToken, adminIntelligenceService } = {}) {
    if (!authenticateToken || !adminIntelligenceService) {
        throw new Error('Admin Intelligence router requires authentication and service dependencies');
    }
    const router = express.Router();

    router.use(authenticateToken);
    router.use((req, res, next) => {
        if (String(req.user?.role || '').toLowerCase() !== 'admin') {
            return res.status(403).json({ success: false, message: 'Administrator access is required' });
        }
        next();
    });

    function sendError(res, error, label) {
        console.error(`[StackCTRL Admin Intelligence] ${label}:`, error.message);
        res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }

    function companyIdFrom(req, res) {
        const companyId = Number(req.params.companyId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            res.status(400).json({ success: false, message: 'A valid companyId is required' });
            return null;
        }
        return companyId;
    }

    router.get('/status', async (_req, res) => {
        try {
            res.json({ success: true, ...(await adminIntelligenceService.getSystemStatus()) });
        } catch (error) {
            sendError(res, error, 'Status lookup failed');
        }
    });

    router.get('/tenants', async (_req, res) => {
        try {
            res.json({ success: true, tenants: await adminIntelligenceService.getTenants() });
        } catch (error) {
            sendError(res, error, 'Tenant lookup failed');
        }
    });

    router.get('/tenant/:companyId', async (req, res) => {
        try {
            const companyId = companyIdFrom(req, res);
            if (!companyId) return;
            res.json({ success: true, ...(await adminIntelligenceService.getTenant(companyId)) });
        } catch (error) {
            sendError(res, error, 'Tenant intelligence lookup failed');
        }
    });

    router.post('/tenant/:companyId/snapshot', async (req, res) => {
        try {
            const companyId = companyIdFrom(req, res);
            if (!companyId) return;
            const result = await adminIntelligenceService.createSnapshot(companyId, req.user);
            res.status(201).json({ success: true, ...result });
        } catch (error) {
            sendError(res, error, 'Snapshot creation failed');
        }
    });

    router.post('/tenant/:companyId/analyze', async (req, res) => {
        try {
            const companyId = companyIdFrom(req, res);
            if (!companyId) return;
            const result = await adminIntelligenceService.runAnalysis(companyId, req.body || {}, req.user);
            res.status(201).json({ success: true, ...result });
        } catch (error) {
            sendError(res, error, 'Azure analysis failed');
        }
    });

    router.post('/tenant/:companyId/compact-context', async (req, res) => {
        try {
            const companyId = companyIdFrom(req, res);
            if (!companyId) return;
            const result = await adminIntelligenceService.buildCompactContext(companyId, req.body || {}, req.user);
            res.status(201).json({ success: true, ...result });
        } catch (error) {
            sendError(res, error, 'Compact context creation failed');
        }
    });

    router.post('/tenant/:companyId/period/:periodType', async (req, res) => {
        try {
            const companyId = companyIdFrom(req, res);
            if (!companyId) return;
            const periodType = String(req.params.periodType || '').toLowerCase();
            if (!['daily', 'weekly', 'monthly', 'yearly'].includes(periodType)) {
                return res.status(400).json({ success: false, message: 'Period type must be daily, weekly, monthly, or yearly' });
            }
            const result = await adminIntelligenceService.runPeriod(companyId, periodType, req.body || {}, req.user);
            res.status(201).json({ success: true, ...result });
        } catch (error) {
            sendError(res, error, 'Period intelligence run failed');
        }
    });

    router.post('/tenant/:companyId/full-test', async (req, res) => {
        try {
            const companyId = companyIdFrom(req, res);
            if (!companyId) return;
            const result = await adminIntelligenceService.runFullTest(companyId, req.body || {}, req.user);
            res.status(201).json({ success: true, ...result });
        } catch (error) {
            sendError(res, error, 'Full intelligence test failed');
        }
    });

    return router;
}

module.exports = { createAdminIntelligenceRouter };
