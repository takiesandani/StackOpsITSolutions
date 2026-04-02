const https = require('https');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const API_VERSION = 'v19.0';

// Hardcoded WhatsApp credentials (non-secret)
const WHATSAPP_PHONE_NUMBER_ID = '1049233374934291';
const WHATSAPP_TEST_NUMBER = '15556435081'; // US test number (format: country code + number, no +)

// Initialize Secret Manager client
const secretClient = new SecretManagerServiceClient();

// Cache for the access token (populate on first use)
let cachedToken = null;
let tokenFetchPromise = null;

/**
 * Fetch WHATSAPP_ACCESS_TOKEN from Google Cloud Secret Manager
 */
async function fetchAccessToken() {
    // Prevent multiple simultaneous fetches
    if (tokenFetchPromise) {
        return tokenFetchPromise;
    }

    tokenFetchPromise = (async () => {
        try {
            const projectId = 'stackops-backend-475222';
            const secretName = 'WHATSAPP_ACCESS_TOKEN';
            const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
            
            console.log(`[WHATSAPP_SECRET] 🔐 Fetching ${secretName} from Google Cloud Secret Manager...`);
            
            const [version] = await secretClient.accessSecretVersion({ name });
            const rawData = version.payload.data.toString();
            
            // Debug: Log raw token to diagnose format issues
            console.log(`[WHATSAPP_SECRET] Raw token length: ${rawData.length}`);
            console.log(`[WHATSAPP_SECRET] Raw token (first 30 chars): ${rawData.substring(0, 30)}`);
            console.log(`[WHATSAPP_SECRET] Raw token (last 10 chars): ${rawData.substring(rawData.length - 10)}`);
            
            // Clean up the token - remove whitespace and quotes if present
            let token = rawData.trim();
            
            // Remove surrounding quotes if they exist (sometimes Secret Manager returns quoted strings)
            if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
                token = token.slice(1, -1);
                console.log(`[WHATSAPP_SECRET] ⚠️ Token had surrounding quotes, removed`);
            }
            
            console.log(`[WHATSAPP_SECRET] Final token length: ${token.length}`);
            console.log(`[WHATSAPP_SECRET] Final token (first 30 chars): ${token.substring(0, 30)}`);
            console.log(`[WHATSAPP_SECRET] ✅ Token fetched successfully (${token.substring(0, 20)}...)`);
            
            // Validate token format (should be alphanumeric, possibly with | character)
            if (!/^[A-Za-z0-9|]+$/.test(token)) {
                console.warn(`[WHATSAPP_SECRET] ⚠️ WARNING: Token contains unexpected characters`);
                // Log which characters are problematic
                const chars = new Set(token.split('').filter(c => !/^[A-Za-z0-9|]+$/.test(c)));
                console.warn(`[WHATSAPP_SECRET] Unexpected chars:`, Array.from(chars).join(', '));
            }
            
            cachedToken = token;
            return token;
        } catch (error) {
            console.error(`[WHATSAPP_SECRET] ❌ Failed to fetch token:`, error.message);
            // Fallback to environment variable if Secret Manager fails
            const envToken = process.env.WHATSAPP_ACCESS_TOKEN;
            if (envToken) {
                console.log(`[WHATSAPP_SECRET] Using fallback from process.env`);
                cachedToken = envToken;
                return envToken;
            }
            throw new Error('WHATSAPP_ACCESS_TOKEN not available in Secret Manager or environment');
        } finally {
            // Reset the promise so next call doesn't use cached promise
            tokenFetchPromise = null;
        }
    })();

    return tokenFetchPromise;
}

/**
 * Get current credentials - Phone ID is hardcoded, token from Secret Manager (cached)
 */
async function getCredentials() {
    const token = cachedToken || await fetchAccessToken();
    return {
        phoneId: WHATSAPP_PHONE_NUMBER_ID,
        token: token,
        testNumber: WHATSAPP_TEST_NUMBER
    };
}

/**
 * Send a plain text message to a WhatsApp number
 */
async function sendTextMessage(to, text) {
    console.log(`[WHATSAPP_API] Sending text message`);
    console.log(`[WHATSAPP_API] To: ${to}`);
    console.log(`[WHATSAPP_API] Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    const payload = JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'text',
        text: { body: text }
    });

    console.log(`[WHATSAPP_API] Payload size: ${payload.length} bytes`);

    try {
        const result = await callWhatsAppAPI(payload);
        console.log(`[WHATSAPP_API] ✅ Message sent successfully`);
        console.log(`[WHATSAPP_API] Response:`, result);
        return result;
    } catch (err) {
        console.error(`[WHATSAPP_API] ❌ Failed to send message:`, err.message);
        throw err;
    }
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
    console.log(`[READ_RECEIPT] Marking message as read: ${messageId}`);
    
    const payload = JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
    });

    try {
        const result = await callWhatsAppAPI(payload);
        console.log(`[READ_RECEIPT] ✅ Read receipt sent`);
        return result;
    } catch (err) {
        console.error(`[READ_RECEIPT] ⚠️ Failed to mark as read:`, err.message);
        throw err;
    }
}

/**
 * Core API caller
 */
async function callWhatsAppAPI(payload) {
    const { phoneId: PHONE_NUMBER_ID, token: ACCESS_TOKEN } = await getCredentials();
    
    return new Promise((resolve, reject) => {
        console.log(`[API_CALL] Calling WhatsApp Graph API`);
        console.log(`[API_CALL] Phone Number ID: ${PHONE_NUMBER_ID ? '✅ SET' : '❌ NOT SET'}`);
        console.log(`[API_CALL] Access Token: ${ACCESS_TOKEN ? '✅ SET' : '❌ NOT SET'}`);
        if (ACCESS_TOKEN) {
            console.log(`[API_CALL] Token length: ${ACCESS_TOKEN.length}`);
            console.log(`[API_CALL] Token preview: ${ACCESS_TOKEN.substring(0, 30)}...${ACCESS_TOKEN.substring(ACCESS_TOKEN.length - 10)}`);
            console.log(`[API_CALL] Token contains pipes: ${ACCESS_TOKEN.includes('|') ? 'YES' : 'NO'}`);
        }
        console.log(`[API_CALL] API Version: ${API_VERSION}`);

        const options = {
            hostname: 'graph.facebook.com',
            path: `/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN ? ACCESS_TOKEN.substring(0, 20) + '...' : 'NOT_SET'}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        console.log(`[API_CALL] Making HTTPS request to:`, `https://${options.hostname}${options.path}`);

        const req = require('https').request(options, (res) => {
            let data = '';
            
            console.log(`[API_RESPONSE] Status Code: ${res.statusCode}`);
            console.log(`[API_RESPONSE] Headers:`, res.headers);

            res.on('data', chunk => {
                data += chunk;
                console.log(`[API_RESPONSE] Received ${chunk.length} bytes`);
            });

            res.on('end', () => {
                console.log(`[API_RESPONSE] Total data: ${data.length} bytes`);
                try {
                    const parsed = JSON.parse(data);
                    console.log(`[API_RESPONSE] Parsed JSON:`, JSON.stringify(parsed).substring(0, 200));

                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log(`[API_RESPONSE] ✅ Success (${res.statusCode})`);
                        resolve(parsed);
                    } else {
                        console.error(`[API_RESPONSE] ❌ Error (${res.statusCode}):`, parsed);
                        reject(new Error(parsed.error?.message || `WhatsApp API failed with status ${res.statusCode}`));
                    }
                } catch (e) {
                    console.error(`[API_RESPONSE] ❌ Failed to parse response:`, e.message);
                    reject(new Error('Failed to parse WhatsApp API response'));
                }
            });
        });

        req.on('error', (err) => {
            console.error(`[API_CALL] ❌ Network error:`, err.message);
            console.error(`[API_CALL] Code:`, err.code);
            reject(err);
        });

        console.log(`[API_CALL] Writing payload...`);
        req.write(payload);
        req.end();
    });
}

module.exports = { sendTextMessage, sendPaymentMessage, markAsRead };
