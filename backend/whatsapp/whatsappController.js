const { sendTextMessage, sendPaymentMessage, markAsRead } = require('./whatsappService');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Typing simulation delay ───────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Phone number normalizer ────────────────────────────────────────────────
// WhatsApp sends numbers like: 27821234567 (no + or leading 0)
// DB may store as: 0821234567 or +27821234567 or 27821234567
function normalizePhone(phone) {
    if (!phone) {
        console.log('[NORMALIZE] Input: NULL/EMPTY → Result: null');
        return null;
    }
    // Strip all non-digits
    let digits = phone.replace(/\D/g, '');
    console.log(`[NORMALIZE] Input: "${phone}" → Digits only: "${digits}"`);
    
    // Remove leading country code 27 → 0... for SA numbers stored with 0
    if (digits.startsWith('27') && digits.length === 11) {
        const result = '0' + digits.slice(2); // → 0821234567
        console.log(`[NORMALIZE] South African format detected: "${digits}" → "${result}"`);
        return result;
    }
    console.log(`[NORMALIZE] Using as-is: "${digits}"`);
    return digits;
}

// ─── User lookup by phone (checks Users table) ──────────────────────────────
async function findClientByPhone(pool, waPhone) {
    if (!pool) {
        console.error('[PHONE_LOOKUP] ❌ CRITICAL: Database pool is NULL');
        throw new Error('Database pool not available');
    }

    const normalized = normalizePhone(waPhone);
    const variants = [
        waPhone,                    // raw: 27821234567
        '+' + waPhone,             // +27821234567
        normalized,                 // 0821234567
    ].filter(Boolean);

    console.log(`[PHONE_LOOKUP] Input: ${waPhone}`);
    console.log(`[PHONE_LOOKUP] Trying variants:`, variants);
    console.log(`[PHONE_LOOKUP] Pool status: connectionLimit=${pool.pool?.connectionLimit}`);

    const placeholders = variants.map(() => '?').join(', ');
    const query = `SELECT * FROM Users WHERE Contact IN (${placeholders}) LIMIT 1`;
    
    try {
        console.log(`[PHONE_LOOKUP] Executing SQL: ${query.substring(0, 100)}...`);
        // Query the Users table with Contact field
        const [results] = await pool.query(query, variants);
        console.log(`[PHONE_LOOKUP] Query results: ${results.length} found`);
        if (results.length > 0) {
            console.log(`[PHONE_LOOKUP] ✅ Matched contact:`, results[0].Contact);
            return results[0];
        }
        console.log(`[PHONE_LOOKUP] ⚠️  No users found with variants:`, variants);
        return null;
    } catch (err) {
        console.error('[PHONE_LOOKUP] ❌ Database error:', err.message);
        console.error('[PHONE_LOOKUP] Error code:', err.code);
        console.error('[PHONE_LOOKUP] Error errno:', err.errno);
        console.error('[PHONE_LOOKUP] Stack:', err.stack);
        throw err;
    }
}

// ─── Get full user data (projects + invoices) ───────────────────────────────
async function getClientData(pool, userId) {
    if (!pool) {
        console.error('[GET_DATA] ❌ CRITICAL: Database pool is NULL');
        throw new Error('Database pool not available');
    }

    try {
        console.log(`[GET_DATA] Fetching data for user ID: ${userId}`);
        
        // Get user
        console.log(`[GET_DATA] Querying Users table for ID=${userId}...`);
        const [users] = await pool.query('SELECT * FROM Users WHERE ID = ?', [userId]);
        if (!users.length) {
            console.log(`[GET_DATA] ❌ User ${userId} not found in Users table`);
            return { client: null, projects: [], invoices: [] };
        }
        
        console.log(`[GET_DATA] ✅ User found:`, {
            ID: users[0].ID,
            Name: `${users[0].FirstName} ${users[0].LastName}`,
            Email: users[0].Email,
            Contact: users[0].Contact
        });

        // Get projects
        console.log(`[GET_DATA] Querying projects for user ${userId}...`);
        const [projects] = await pool.query(
            'SELECT * FROM projects WHERE client_id = ? OR user_id = ?',
            [userId, userId]
        );
        console.log(`[GET_DATA] ✅ Found ${projects ? projects.length : 0} projects`);

        // Get invoices
        console.log(`[GET_DATA] Querying invoices for user ${userId}...`);
        const [invoices] = await pool.query(
            'SELECT * FROM invoices WHERE client_id = ? OR user_id = ?',
            [userId, userId]
        );
        console.log(`[GET_DATA] ✅ Found ${invoices ? invoices.length : 0} invoices`);

        return { client: users[0], projects: projects || [], invoices: invoices || [] };
    } catch (err) {
        console.error('[GET_DATA] ❌ Critical error:', err.message);
        console.error('[GET_DATA] Error code:', err.code);
        console.error('[GET_DATA] Error errno:', err.errno);
        console.error('[GET_DATA] Stack:', err.stack);
        throw err;
    }
}

// ─── Payment intent detection ────────────────────────────────────────────────
function detectPaymentIntent(message) {
    const keywords = [
        'pay', 'payment', 'make payment', 'pay invoice', 'settle',
        'pay now', 'payment link', 'how to pay', 'where to pay',
        'want to pay', 'pay my invoice', 'clear my balance'
    ];
    const lower = message.toLowerCase();
    return keywords.some(k => lower.includes(k));
}

// ─── Main webhook handler ────────────────────────────────────────────────────
async function handleIncomingMessage(pool) {
    return async (req, res) => {
        // Always respond 200 immediately — Meta will retry if we don't
        res.sendStatus(200);

        try {
            // CRITICAL: Check database pool first
            if (!pool) {
                console.error('\n' + '='.repeat(80));
                console.error('❌ [CRITICAL] Database pool is NULL - cannot process message');
                console.error('='.repeat(80) + '\n');
                return;
            }

            const body = req.body;
            console.log('[DEBUG] Webhook received:', {
                object: body.object,
                hasEntry: !!body.entry?.[0],
                hasChanges: !!body.entry?.[0]?.changes?.[0],
                timestamp: new Date().toISOString()
            });

            // Validate structure
            if (body.object !== 'whatsapp_business_account') {
                console.log('[DEBUG] Invalid object type:', body.object);
                return;
            }

            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;

            console.log('[DEBUG] Webhook value details:', {
                hasMessages: !!value?.messages?.[0],
                hasStatuses: !!value?.statuses,
                messageType: value?.messages?.[0]?.type,
                from: value?.messages?.[0]?.from
            });

            // Ignore status updates (delivered, read receipts)
            if (value?.statuses) {
                console.log('[DEBUG] Ignoring status update (delivered/read receipt)');
                return;
            }

            const message = value?.messages?.[0];
            if (!message) {
                console.log('[DEBUG] No message found in webhook');
                return;
            }

            // Only handle text messages for now
            if (message.type !== 'text') {
                console.log('[DEBUG] Ignoring non-text message type:', message.type);
                await sendTextMessage(
                    message.from,
                    "Sorry, I can only process text messages right now. Please type your question!"
                );
                return;
            }

            const senderPhone = message.from;   // e.g. "27821234567"
            const userText = message.text.body;
            const messageId = message.id;

            console.log(`\n${'='.repeat(60)}`);
            console.log(`📱 WhatsApp message received`);
            console.log(`   From: ${senderPhone}`);
            console.log(`   Text: "${userText}"`);
            console.log(`   MessageId: ${messageId}`);
            console.log(`${'='.repeat(60)}\n`);

            // Mark as read immediately
            await markAsRead(messageId).catch(() => {}); // non-critical

            // ── Look up user ────────────────────────────────────────────
            console.log(`[LOOKUP] Searching for user with phone: ${senderPhone}`);
            let client = null;
            try {
                client = await findClientByPhone(pool, senderPhone);
            } catch (dbErr) {
                console.error(`[LOOKUP] ❌ Database error during phone lookup:`, dbErr.message);
                console.error(`[LOOKUP] Error type:`, dbErr.code || dbErr.errno);
                console.error(`[LOOKUP] Full error:`, dbErr);
                
                // Send error message to user
                await sendTextMessage(
                    senderPhone,
                    `Sorry! We're having trouble connecting to our database right now. Please try again in a moment. (DBError: ${dbErr.code || dbErr.errno})`
                ).catch(sendErr => {
                    console.error('[LOOKUP] ❌ Also failed to send error message:', sendErr.message);
                });
                return;
            }

            if (!client) {
                console.log(`[LOOKUP] ❌ User NOT found for phone: ${senderPhone}`);
                console.log(`[ACTION] Sending unrecognized number response`);
                await sendTextMessage(
                    senderPhone,
                    `👋 Hi! I don't recognize this number in our system.\n\nPlease contact us at hello@stackon.co.za or register at our client portal to get started.`
                );
                return;
            }

            console.log(`[LOOKUP] ✅ User FOUND:`, {
                ID: client.ID,
                Name: `${client.FirstName} ${client.LastName}`,
                Contact: client.Contact,
                Email: client.Email
            });

            // ── Send Welcome Greeting ───────────────────────────────────
            const clientName = client.FirstName && client.LastName 
                ? `${client.FirstName} ${client.LastName}` 
                : client.FirstName || 'Client';
            
            await sendTextMessage(
                senderPhone,
                `👋 Hi ${clientName}! My name is StackOn. I'm here to assist you with your Client Dashboard, projects, invoices, and payments. How can I help you today?`
            ).catch(() => {}); // non-critical if greeting fails

            // Small delay before processing their actual message (feels more natural)
            await sleep(1200);

            // ── Get full data ───────────────────────────────────────────
            let clientData = null;
            try {
                clientData = await getClientData(pool, client.ID);
            } catch (dbErr) {
                console.error(`[GET_DATA] ❌ Database error retrieving client data:`, dbErr.message);
                console.error(`[GET_DATA] Error type:`, dbErr.code || dbErr.errno);
                
                await sendTextMessage(
                    senderPhone,
                    `Sorry ${clientName}, I'm having trouble retrieving your information. Please try again in a moment.`
                ).catch(sendErr => {
                    console.error('[GET_DATA] ❌ Failed to send error message:', sendErr.message);
                });
                return;
            }
            
            const unpaidInvoices = clientData.invoices.filter(
                inv => inv.status === 'unpaid' || inv.status === 'overdue'
            );
            const totalOwed = unpaidInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0);

            // ── Payment flow ────────────────────────────────────────────
            if (detectPaymentIntent(userText) && unpaidInvoices.length > 0) {
                try {
                    let replyText;

                    if (unpaidInvoices.length === 1) {
                        const invoice = unpaidInvoices[0];
                        replyText = `Hi ${clientName}! 👋\n\nYou have 1 outstanding invoice for *R${parseFloat(invoice.amount).toFixed(2)}*.\n\nPlease contact our team to arrange payment. 💳`;
                    } else {
                        replyText = `Hi ${clientName}! 👋\n\nYou have *${unpaidInvoices.length} outstanding invoices* totaling *R${totalOwed.toFixed(2)}*.\n\nPlease contact our team to settle. 💳`;
                    }

                    await sendTextMessage(senderPhone, replyText);
                    console.log(`✅ [PAYMENT] Sent payment info to ${clientName}`);

                } catch (err) {
                    console.error('❌ [PAYMENT] Notification error:', err.message);
                    console.error('[PAYMENT] Stack:', err.stack);
                    await sendTextMessage(
                        senderPhone,
                        `Sorry ${clientName}, I had trouble retrieving your payment information. Please contact us directly.`
                    ).catch(sendErr => {
                        console.error('[PAYMENT] ❌ Failed to send error message:', sendErr.message);
                    });
                }
                return;
            }

            // ── AI response flow ────────────────────────────────────────
            const systemPrompt = `You are a helpful WhatsApp assistant for StackOps, a project management company based in South Africa.
You are chatting with a client via WhatsApp, so keep responses concise and WhatsApp-friendly (use *bold* for emphasis, avoid long paragraphs, use emojis sparingly).

CLIENT INFO:
- Name: ${clientName}
- Email: ${clientData.client.Email}
- Phone: ${clientData.client.Contact}
- Position: ${clientData.client.Position || 'Not specified'}
- Company ID: ${clientData.client.CompanyID || 'Not specified'}

PROJECTS (${clientData.projects.length} total):
${clientData.projects.map(p => `- "${p.name}" — Status: ${p.status} — ${p.description}`).join('\n') || 'No projects yet'}

INVOICES (${clientData.invoices.length} total):
${clientData.invoices.map(i => `- Invoice #${i.id}: R${i.amount} (${i.status.toUpperCase()}) — Due: ${i.due_date}`).join('\n') || 'No invoices yet'}

TOTAL OWED: R${totalOwed.toFixed(2)}

Answer questions about their projects, invoices, and account status. Be friendly and professional.
If they ask about paying, tell them to contact support and someone will help them arrange payment.
Keep replies SHORT — this is WhatsApp, not email. Max 3-4 sentences unless detail is needed.`;

            console.log(`\n[AI] Calling OpenAI API...`);
            console.log(`[AI] Model: gpt-4o-mini`);
            console.log(`[AI] User message: "${userText}"`);
            console.log(`[AI] Token count: ~${systemPrompt.length / 4 + userText.length / 4} (estimate)`);

            try {
                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userText }
                    ],
                    temperature: 0.7,
                    max_tokens: 300
                });

                const aiReply = completion.choices[0].message.content;
                
                console.log(`[AI] ✅ Response received`);
                console.log(`[AI] Reply: "${aiReply.substring(0, 100)}..."`);
                console.log(`[SEND] Waiting 800ms before sending...`);

                await sleep(800); // slight delay feels more natural
                
                console.log(`[SEND] Sending reply to ${senderPhone}...`);
                await sendTextMessage(senderPhone, aiReply);
                
                console.log(`✅ [SUCCESS] Replied to ${clientName} (${senderPhone})`);
                console.log('='.repeat(80) + '\n');

            } catch (openaiErr) {
                console.error(`[AI] ❌ OpenAI Error:`, openaiErr.message);
                console.error(`[AI] Status:`, openaiErr.status);
                console.error(`[AI] Code:`, openaiErr.code);
                console.error(`[AI] Stack:`, openaiErr.stack);
                
                // Send fallback message
                await sendTextMessage(
                    senderPhone,
                    `Sorry ${clientName}, I'm experiencing some difficulty right now. Please try again in a moment or contact support directly.`
                ).catch(sendErr => {
                    console.error(`[AI] ❌ Failed to send fallback message:`, sendErr.message);
                });
                return;
            }

        } catch (err) {
            console.error('\n' + '='.repeat(80));
            console.error('❌ [HANDLER_ERROR] WhatsApp handler error');
            console.error('❌ Message:', err.message);
            console.error('❌ Type:', err.constructor.name);
            console.error('❌ Code:', err.code);
            console.error('❌ Errno:', err.errno);
            console.error('❌ Stack:', err.stack);
            console.error('='.repeat(80) + '\n');
        }
    };
}

// ─── Webhook verification (GET) ──────────────────────────────────────────────
function verifyWebhook(req, res) {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('\n' + '='.repeat(80));
    console.log('🔐 WEBHOOK VERIFICATION REQUEST (Handshake)');
    console.log('='.repeat(80));
    console.log('[HANDSHAKE] Timestamp:', new Date().toISOString());
    console.log('[HANDSHAKE] Mode:', mode);
    console.log('[HANDSHAKE] Token received:', token ? `${token.substring(0, 20)}...` : 'MISSING');
    console.log('[HANDSHAKE] Expected token:', VERIFY_TOKEN ? `${VERIFY_TOKEN.substring(0, 20)}...` : 'NOT SET');
    console.log('[HANDSHAKE] Challenge:', challenge ? `${challenge.substring(0, 20)}...` : 'MISSING');
    console.log('[HANDSHAKE] Match:', token === VERIFY_TOKEN ? '✅ YES' : '❌ NO');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('[HANDSHAKE] ✅ VERIFICATION SUCCESSFUL - Sending challenge back');
        console.log('='.repeat(80) + '\n');
        res.status(200).send(challenge);
    } else {
        console.log('[HANDSHAKE] ❌ VERIFICATION FAILED');
        if (mode !== 'subscribe') console.log('  → Mode mismatch. Got:', mode);
        if (token !== VERIFY_TOKEN) console.log('  → Token mismatch. Expected vs got do not match');
        console.log('='.repeat(80) + '\n');
        res.sendStatus(403);
    }
}

module.exports = { handleIncomingMessage, verifyWebhook };
