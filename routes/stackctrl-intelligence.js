const express = require('express');

function createStackCTRLIntelligenceRouter({
    authenticateToken,
    getAccessContextByUser,
    intelligenceService,
    schedulerService = null,
    automationService = null
}) {
    const router = express.Router();
    router.use(authenticateToken);

    async function resolveCompany(req) {
        const requestedValue = req.body?.companyId || req.query?.companyId;
        const isAdmin = String(req.user?.role || '').toLowerCase() === 'admin';
        if (isAdmin && requestedValue) {
            const requestedCompanyId = Number(requestedValue);
            if (!Number.isInteger(requestedCompanyId) || requestedCompanyId <= 0) {
                const error = new Error('A valid companyId is required');
                error.statusCode = 400;
                throw error;
            }
            return requestedCompanyId;
        }

        const context = await getAccessContextByUser(req.user);
        if (!context?.companyId) {
            const error = new Error('Access mapping is not configured for this account');
            error.statusCode = 403;
            throw error;
        }

        const requestedCompanyId = Number(requestedValue || context.companyId);
        const mappedCompanyId = Number(context.companyId);
        if (!Number.isInteger(requestedCompanyId) || requestedCompanyId <= 0) {
            const error = new Error('A valid companyId is required');
            error.statusCode = 400;
            throw error;
        }
        if (requestedCompanyId !== mappedCompanyId) {
            const error = new Error('You cannot access another tenant');
            error.statusCode = 403;
            throw error;
        }
        return requestedCompanyId;
    }

    function sendError(res, error, label) {
        const status = error.statusCode ||
            (/not found/i.test(error.message) ? 404 :
                /required|unsupported|valid company/i.test(error.message) ? 400 :
                    /Azure OpenAI request failed/i.test(error.message) ? 502 : 500);
        console.error(`[StackCTRL Intelligence] ${label}:`, error.message);
        res.status(status).json({ success: false, message: error.message });
    }

    function requireAdmin(req, res, next) {
        if (String(req.user?.role || '').toLowerCase() !== 'admin') {
            return res.status(403).json({ success: false, message: 'Administrator access is required' });
        }
        next();
    }

    async function resolveTenant(req) {
        const companyId = await resolveCompany(req);
        const context = await getAccessContextByUser(req.user).catch(() => null);
        return {
            companyId,
            accessType: Number(context?.companyId) === companyId ? context.accessType : null,
            tenantId: Number(context?.companyId) === companyId ? context.tenantId : null
        };
    }

    router.post('/bootstrap', async (req, res) => {
        try {
            const tenant = await resolveTenant(req);
            const snapshot = await intelligenceService.bootstrap({
                companyId: tenant.companyId,
                accessType: tenant.accessType,
                user: req.user
            });
            res.status(201).json({ success: true, ...snapshot });
        } catch (error) {
            sendError(res, error, 'Bootstrap failed');
        }
    });

    router.post('/context', async (req, res) => {
        try {
            const tenant = await resolveTenant(req);
            const snapshot = await intelligenceService.createSnapshot({
                companyId: tenant.companyId,
                options: {
                    periodStart: req.body?.periodStart,
                    periodEnd: req.body?.periodEnd,
                    snapshotType: req.body?.snapshotType || 'manual_test',
                    accessType: tenant.accessType
                },
                user: req.user
            });
            res.status(201).json({ success: true, ...snapshot });
        } catch (error) {
            sendError(res, error, 'Context creation failed');
        }
    });

    router.post('/analyze', async (req, res) => {
        try {
            const companyId = await resolveCompany(req);
            const snapshotId = Number(req.body?.snapshotId);
            if (!Number.isInteger(snapshotId) || snapshotId <= 0) {
                return res.status(400).json({ success: false, message: 'A valid snapshotId is required' });
            }
            const analysisMode = String(req.body?.analysisMode || 'compact').toLowerCase();
            if (analysisMode === 'full' && String(req.user?.role || '').toLowerCase() !== 'admin') {
                return res.status(403).json({ success: false, message: 'Full snapshot analysis requires administrator access' });
            }
            const historicalContext = schedulerService
                ? await schedulerService.getHistoricalSnapshotContext(companyId, snapshotId)
                : null;
            const result = await intelligenceService.analyseSnapshot({
                snapshotId,
                companyId,
                outputTypes: req.body?.outputTypes,
                user: req.user,
                historicalContext,
                analysisMode
            });
            res.status(201).json({ success: true, ...result });
        } catch (error) {
            sendError(res, error, 'Analysis failed');
        }
    });

    router.post('/compact-context', requireAdmin, async (req, res) => {
        try {
            if (!schedulerService) throw new Error('Intelligence scheduler is not configured');
            const companyId = await resolveCompany(req);
            const snapshotId = Number(req.body?.snapshotId);
            if (!Number.isInteger(snapshotId) || snapshotId <= 0) {
                return res.status(400).json({ success: false, message: 'A valid snapshotId is required' });
            }
            const historicalContext = await schedulerService.getHistoricalSnapshotContext(companyId, snapshotId);
            const result = await intelligenceService.buildCompactContext({
                companyId,
                snapshotId,
                periodType: req.body?.periodType || 'snapshot',
                historicalContext
            });
            res.status(201).json({ success: true, ...result, compactContextJson: undefined });
        } catch (error) {
            sendError(res, error, 'Compact context creation failed');
        }
    });

    router.post('/period/run-now', requireAdmin, async (req, res) => {
        try {
            if (!schedulerService) throw new Error('Intelligence scheduler is not configured');
            const companyId = await resolveCompany(req);
            const snapshotId = Number(req.body?.snapshotId);
            if (!Number.isInteger(snapshotId) || snapshotId <= 0) {
                return res.status(400).json({ success: false, message: 'A valid snapshotId is required' });
            }
            const historicalContext = await schedulerService.getHistoricalSnapshotContext(companyId, snapshotId);
            const result = await intelligenceService.runPeriodIntelligence({
                companyId,
                snapshotId,
                periodType: req.body?.periodType,
                historicalContext,
                outputTypes: req.body?.outputTypes,
                user: req.user
            });
            res.status(201).json({ success: true, ...result });
        } catch (error) {
            sendError(res, error, 'Period intelligence run failed');
        }
    });

    router.get('/periods/:companyId', requireAdmin, async (req, res) => {
        try {
            const companyId = Number(req.params.companyId);
            if (!Number.isInteger(companyId) || companyId <= 0) {
                return res.status(400).json({ success: false, message: 'A valid companyId is required' });
            }
            const periods = await intelligenceService.getIntelligencePeriods(companyId, req.query?.limit);
            res.json({ success: true, companyId, periods });
        } catch (error) {
            sendError(res, error, 'Period intelligence lookup failed');
        }
    });

    router.get('/latest', async (req, res) => {
        try {
            const companyId = await resolveCompany(req);
            const data = await intelligenceService.getLatest({
                companyId,
                outputType: req.query?.outputType || null
            });
            res.json({ success: true, companyId, ...data });
        } catch (error) {
            sendError(res, error, 'Latest output lookup failed');
        }
    });

    router.get('/powerbi', async (req, res) => {
        try {
            const companyId = await resolveCompany(req);
            const data = await intelligenceService.getPowerBIData(companyId);
            res.json(data);
        } catch (error) {
            sendError(res, error, 'Power BI export failed');
        }
    });

    router.post('/scheduler/run-now', requireAdmin, async (req, res) => {
        try {
            if (!schedulerService) throw new Error('Intelligence scheduler is not configured');
            const companyId = Number(req.body?.companyId);
            if (!Number.isInteger(companyId) || companyId <= 0) {
                return res.status(400).json({ success: false, message: 'A valid companyId is required' });
            }
            const includeAnalysis = req.body?.includeAnalysis === true;
            const result = await schedulerService.runNow({
                companyId,
                includeAnalysis,
                outputTypes: Array.isArray(req.body?.outputTypes) ? req.body.outputTypes : undefined,
                user: req.user
            });
            res.status(201).json({ success: true, ...result });
        } catch (error) {
            sendError(res, error, 'Manual scheduler run failed');
        }
    });

    router.get('/scheduler/status', requireAdmin, async (req, res) => {
        try {
            if (!schedulerService) throw new Error('Intelligence scheduler is not configured');
            const companyId = req.query?.companyId ? Number(req.query.companyId) : null;
            if (companyId != null && (!Number.isInteger(companyId) || companyId <= 0)) {
                return res.status(400).json({ success: false, message: 'companyId must be valid' });
            }
            const status = await schedulerService.getSchedulerStatus(companyId);
            res.json({
                success: true,
                companyId,
                serverAutomation: automationService?.getStatus?.() || null,
                ...status
            });
        } catch (error) {
            sendError(res, error, 'Scheduler status lookup failed');
        }
    });

    router.get('/history/:companyId', requireAdmin, async (req, res) => {
        try {
            if (!schedulerService) throw new Error('Intelligence scheduler is not configured');
            const companyId = Number(req.params.companyId);
            if (!Number.isInteger(companyId) || companyId <= 0) {
                return res.status(400).json({ success: false, message: 'A valid companyId is required' });
            }
            const history = await schedulerService.getHistory(companyId, req.query?.limit);
            res.json({ success: true, ...history });
        } catch (error) {
            sendError(res, error, 'Intelligence history lookup failed');
        }
    });

    return router;
}

module.exports = { createStackCTRLIntelligenceRouter };
