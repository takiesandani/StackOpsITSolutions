const express = require('express');

/**
 * Create WhatsApp routes with a database pool
 * @param {mysql.Pool} pool - MySQL connection pool from main server
 * @returns {Router} - Express router for WhatsApp endpoints
 */
module.exports = function createWhatsAppRoutes(pool) {
    const router = express.Router();
    const { handleIncomingMessage, verifyWebhook } = require('./whatsappController');

    // GET  /api/webhook/whatsapp  → Meta verification handshake
    router.get('/whatsapp', verifyWebhook);

    // POST /api/webhook/whatsapp  → Incoming messages
    router.post('/whatsapp', handleIncomingMessage(pool));

    return router;
};
