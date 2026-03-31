const express = require('express');

/**
 * Create WhatsApp routes with a database pool
 * @param {mysql.Pool} pool - MySQL connection pool from main server
 * @returns {Router} - Express router for WhatsApp endpoints
 */
module.exports = function createWhatsAppRoutes(pool) {
    const router = express.Router();
    const { handleIncomingMessage, verifyWebhook } = require('./whatsappController');

    console.log('[ROUTES] Setting up WhatsApp routes...');

    // GET  /api/webhook/whatsapp  → Meta verification handshake
    router.get('/whatsapp', (req, res) => {
        console.log(`[ROUTE] GET /api/webhook/whatsapp (Verification endpoint)`);
        verifyWebhook(req, res);
    });

    // POST /api/webhook/whatsapp  → Incoming messages
    router.post('/whatsapp', (req, res) => {
        console.log(`[ROUTE] POST /api/webhook/whatsapp (Incoming message endpoint)`);
        const handler = handleIncomingMessage(pool);
        handler(req, res);
    });

    console.log('[ROUTES] ✅ WhatsApp routes configured');
    console.log('[ROUTES]   GET  /api/webhook/whatsapp  → Webhook verification (handshake)');
    console.log('[ROUTES]   POST /api/webhook/whatsapp  → Incoming messages');

    return router;
};
