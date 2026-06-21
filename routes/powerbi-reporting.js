const express = require('express');
const { ReportingApiError } = require('../services/powerbi-reporting');

function swaggerHtml() {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>StackCTRL Power BI Reporting API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
    <style>body{margin:0;background:#07101d}.swagger-ui .topbar{display:none}</style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
        window.addEventListener('load', function () {
            SwaggerUIBundle({
                url: '/api/powerbi/openapi.json',
                dom_id: '#swagger-ui',
                deepLinking: true,
                persistAuthorization: true,
                displayRequestDuration: true
            });
        });
    </script>
</body>
</html>`;
}

function createPowerBIReportingRouter({ reportingService, logger = console } = {}) {
    if (!reportingService) throw new Error('Power BI Reporting router requires the reporting service');
    const router = express.Router();

    function sendError(req, res, error) {
        const status = Number(error?.statusCode) || 500;
        const safeError = error instanceof ReportingApiError
            ? error.message
            : 'Reporting request failed';
        logger.error('[Power BI Reporting API] Request failed.', {
            path: req.originalUrl,
            method: req.method,
            status,
            message: error?.message || 'Unknown reporting error'
        });
        res.status(status).json({ success: false, error: safeError });
    }

    // OpenAPI stays public so developers can learn the contract before receiving a reporting key.
    router.get('/openapi.json', (req, res) => {
        res.set('Cache-Control', 'public, max-age=300');
        res.json(reportingService.openApiDocument());
    });

    router.get('/docs', (_req, res) => {
        res.set('Cache-Control', 'public, max-age=300');
        res.type('html').send(swaggerHtml());
    });

    router.use(async (req, res, next) => {
        try {
            await reportingService.authenticate(req.get('X-PowerBI-API-Key'));
            next();
        } catch (error) {
            sendError(req, res, error);
        }
    });

    router.get('/', (_req, res) => {
        res.json(reportingService.metadata());
    });

    router.get('/health', async (req, res) => {
        try {
            const result = await reportingService.health();
            res.status(result.success ? 200 : 503).json(result);
        } catch (error) {
            sendError(req, res, error);
        }
    });

    router.get('/:dataset', async (req, res) => {
        try {
            const result = await reportingService.readDataset(req.params.dataset, req.query || {});
            res.json(result);
        } catch (error) {
            sendError(req, res, error);
        }
    });

    return router;
}

module.exports = { createPowerBIReportingRouter, swaggerHtml };
