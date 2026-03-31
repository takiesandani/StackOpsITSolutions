const https = require('https');

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const API_VERSION = 'v19.0';

/**
 * Send a plain text message to a WhatsApp number
 */
async function sendTextMessage(to, text) {
    const payload = JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { body: text }
    });

    return await callWhatsAppAPI(payload);
}

/**
 * Send a message with a payment button (interactive CTA)
 */
async function sendPaymentMessage(to, bodyText, paymentUrl) {
    // WhatsApp has a 20-char button text limit
    const payload = JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
            type: 'cta_url',
            body: { text: bodyText },
            action: {
                name: 'cta_url',
                parameters: {
                    display_text: '💳 Pay Now',
                    url: paymentUrl
                }
            }
        }
    });

    return await callWhatsAppAPI(payload);
}

/**
 * Mark a message as read (improves UX - shows blue ticks)
 */
async function markAsRead(messageId) {
    const payload = JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
    });

    return await callWhatsAppAPI(payload);
}

/**
 * Core API caller
 */
function callWhatsAppAPI(payload) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'graph.facebook.com',
            path: `/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        console.error('❌ WhatsApp API error:', parsed);
                        reject(new Error(parsed.error?.message || 'WhatsApp API failed'));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse WhatsApp API response'));
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

module.exports = { sendTextMessage, sendPaymentMessage, markAsRead };
