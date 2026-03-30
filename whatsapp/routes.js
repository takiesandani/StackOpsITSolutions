const express = require('express');
const router = express.Router();
const { handleIncomingMessage, verifyWebhook } = require('./whatsappController');

/**
 * WhatsApp Integration Routes
 * NO AUTHENTICATION - Meta's webhook doesn't support headers/auth
 * 
 * GET  /api/whatsapp  → Meta verification handshake (one-time setup)
 * POST /api/whatsapp  → Incoming messages from WhatsApp Cloud API
 */

module.exports = function(pool) {
    // GET  /api/whatsapp  → Meta verification handshake
    router.get('/', verifyWebhook);

    // POST /api/whatsapp  → Incoming messages
    router.post('/', async (req, res) => {
        await handleIncomingMessage(req, res, pool);
    });

    return router;
};
