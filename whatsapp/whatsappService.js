const https = require('https');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const API_VERSION = 'v19.0';
const secretClient = new SecretManagerServiceClient();

// Cache credentials to avoid repeated Secret Manager calls
let cachedPhoneNumberId = null;
let cachedAccessToken = null;

/**
 * Get secret from Google Cloud Secret Manager with fallback to env vars
 */
async function getSecret(secretName) {
    const projectId = 'stackops-backend-475222';
    
    // Try environment variable first (for local development)
    if (process.env[secretName]) {
        return process.env[secretName];
    }
    
    // Try Secret Manager for production
    try {
        const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
        const [version] = await secretClient.accessSecretVersion({ name });
        return version.payload.data.toString().trim();
    } catch (error) {
        console.error(`❌ Failed to retrieve secret ${secretName}:`, error.message);
        return null;
    }
}

/**
 * Initialize credentials on first use
 */
async function initializeCredentials() {
    if (cachedPhoneNumberId && cachedAccessToken) {
        return; // Already initialized
    }
    
    cachedPhoneNumberId = await getSecret('WHATSAPP_PHONE_NUMBER_ID');
    cachedAccessToken = await getSecret('WHATSAPP_ACCESS_TOKEN');
    
    if (!cachedPhoneNumberId || !cachedAccessToken) {
        throw new Error('WhatsApp credentials not found in Secret Manager or environment variables');
    }
}

/**
 * Send a plain text message to a WhatsApp number
 */
async function sendTextMessage(to, text) {
    await initializeCredentials();
    
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
    await initializeCredentials();
    
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
            path: `/${API_VERSION}/${cachedPhoneNumberId}/messages`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${cachedAccessToken}`,
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
