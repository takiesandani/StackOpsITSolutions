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
    <style>
        body{margin:0;background:#07101d}.swagger-ui .topbar{display:none}
        .fabric-note{margin:16px;padding:14px 18px;color:#dcecff;background:#0d1b2d;border:1px solid #28496f;border-radius:10px;font:14px/1.5 Arial,sans-serif}
        .fabric-note code{color:#70c7ff}
    </style>
</head>
<body>
    <div class="fabric-note"><strong>Fabric Dataflow Gen2:</strong> use <code>?apiKey=&lt;POWERBI_KEY&gt;</code>.<br>
    Example: <code>https://stackopsit.co.za/api/powerbi/intelligence-summary?apiKey=&lt;POWERBI_KEY&gt;&amp;companyId=1&amp;limit=500</code></div>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
        window.addEventListener('load', function () {
            const apiKey = new URLSearchParams(window.location.search).get('apiKey');
            const definitionUrl = '/api/powerbi/openapi.json' + (apiKey ? '?apiKey=' + encodeURIComponent(apiKey) : '');
            const ui = SwaggerUIBundle({
                url: definitionUrl,
                dom_id: '#swagger-ui',
                deepLinking: true,
                persistAuthorization: true,
                displayRequestDuration: true
            });
            if (apiKey) ui.preauthorizeApiKey('PowerBIQueryAPIKey', apiKey);
        });
    </script>
</body>
</html>`;
}

function redactRequestUrl(value) {
    const original = String(value || '');
    try {
        const parsed = new URL(original, 'https://stackctrl.local');
        if (parsed.searchParams.has('apiKey')) parsed.searchParams.set('apiKey', '<redacted>');
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (_) {
        return original.replace(/([?&]apiKey=)[^&#]*/gi, '$1<redacted>');
    }
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
            path: redactRequestUrl(req.originalUrl),
            method: req.method,
            status,
            message: error?.message || 'Unknown reporting error'
        });
        res.status(status).json({ success: false, error: safeError });
    }

    router.use(async (req, res, next) => {
        try {
            await reportingService.authenticate([
                req.get('X-PowerBI-API-Key'),
                req.query?.apiKey
            ]);
            next();
        } catch (error) {
            sendError(req, res, error);
        }
    });

    router.get('/openapi.json', (_req, res) => {
        res.set('Cache-Control', 'private, max-age=300');
        res.json(reportingService.openApiDocument());
    });

    router.get('/docs', (_req, res) => {
        res.set('Cache-Control', 'private, max-age=300');
        res.type('html').send(swaggerHtml());
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

module.exports = { createPowerBIReportingRouter, redactRequestUrl, swaggerHtml };
