const { sendTextMessage, sendPaymentMessage, markAsRead } = require('./whatsappService');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Typing simulation delay ───────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Phone number normalizer ────────────────────────────────────────────────
// WhatsApp sends numbers like: 27821234567 (no + or leading 0)
// DB may store as: 0821234567 or +27821234567 or 27821234567
function normalizePhone(phone) {
    if (!phone) return null;
    // Strip all non-digits
    let digits = phone.replace(/\D/g, '');
    // Remove leading country code 27 → 0... for SA numbers stored with 0
    if (digits.startsWith('27') && digits.length === 11) {
        return '0' + digits.slice(2); // → 0821234567
    }
    return digits;
}

// ─── User lookup by phone (checks Users table) ──────────────────────────────
async function findClientByPhone(pool, waPhone) {
    const normalized = normalizePhone(waPhone);
    const variants = [
        waPhone,                    // raw: 27821234567
        '+' + waPhone,             // +27821234567
        normalized,                 // 0821234567
    ].filter(Boolean);

    const placeholders = variants.map(() => '?').join(', ');
    try {
        // Query the Users table with Contact field
        const [results] = await pool.query(
            `SELECT * FROM Users WHERE Contact IN (${placeholders}) LIMIT 1`,
            variants
        );
        return results.length > 0 ? results[0] : null;
    } catch (err) {
        console.error('❌ Phone lookup error:', err.message);
        throw err;
    }
}

// ─── Get full user data (projects + invoices) ───────────────────────────────
async function getClientData(pool, userId) {
    try {
        // Get user
        const [users] = await pool.query('SELECT * FROM Users WHERE ID = ?', [userId]);
        if (!users.length) return { client: null, projects: [], invoices: [] };

        // Get projects
        const [projects] = await pool.query(
            'SELECT * FROM projects WHERE client_id = ? OR user_id = ?',
            [userId, userId]
        );

        // Get invoices
        const [invoices] = await pool.query(
            'SELECT * FROM invoices WHERE client_id = ? OR user_id = ?',
            [userId, userId]
        );

        return { client: users[0], projects: projects || [], invoices: invoices || [] };
    } catch (err) {
        console.error('❌ Get client data error:', err.message);
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
            const body = req.body;

            // Validate structure
            if (body.object !== 'whatsapp_business_account') return;

            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;

            // Ignore status updates (delivered, read receipts)
            if (value?.statuses) return;

            const message = value?.messages?.[0];
            if (!message) return;

            // Only handle text messages for now
            if (message.type !== 'text') {
                await sendTextMessage(
                    message.from,
                    "Sorry, I can only process text messages right now. Please type your question!"
                );
                return;
            }

            const senderPhone = message.from;   // e.g. "27821234567"
            const userText = message.text.body;
            const messageId = message.id;

            // Mark as read immediately
            await markAsRead(messageId).catch(() => {}); // non-critical

            console.log(`📱 WhatsApp message from ${senderPhone}: "${userText}"`);

            // ── Look up user ────────────────────────────────────────────
            const client = await findClientByPhone(pool, senderPhone);

            if (!client) {
                await sendTextMessage(
                    senderPhone,
                    `👋 Hi! I don't recognize this number in our system.\n\nPlease contact us at hello@stackon.co.za or register at our client portal to get started.`
                );
                return;
            }

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
            const clientData = await getClientData(pool, client.ID);
            
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

                } catch (err) {
                    console.error('❌ Payment notification error:', err.message);
                    await sendTextMessage(
                        senderPhone,
                        `Sorry ${clientName}, I had trouble retrieving your payment information. Please contact us directly.`
                    );
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

            await sleep(800); // slight delay feels more natural
            await sendTextMessage(senderPhone, aiReply);

            console.log(`✅ Replied to ${clientName} (${senderPhone})`);

        } catch (err) {
            console.error('❌ WhatsApp handler error:', err.message);
        }
    };
}

// ─── Webhook verification (GET) ──────────────────────────────────────────────
function verifyWebhook(req, res) {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ WhatsApp webhook verified!');
        res.status(200).send(challenge);
    } else {
        console.error('❌ Webhook verification failed');
        res.sendStatus(403);
    }
}

module.exports = { handleIncomingMessage, verifyWebhook };
