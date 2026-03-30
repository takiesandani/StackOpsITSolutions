const { sendTextMessage, sendPaymentMessage, markAsRead } = require('./whatsappService');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Typing simulation delay ───────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Phone number normalizer ────────────────────────────────────────────────
// WhatsApp sends numbers like: 27821234567 (no + or leading 0)
// StackOps stores as: 0821234567 (South African format)
function normalizePhone(phone) {
    if (!phone) return null;
    let digits = phone.replace(/\D/g, '');
    // If starts with 27 and is 11 digits, convert to SA format (0...)
    if (digits.startsWith('27') && digits.length === 11) {
        return '0' + digits.slice(2); // → 0821234567
    }
    return digits;
}

// ─── Client lookup by phone (from StackOps Users table) ─────────────────────
async function findClientByPhone(waPhone, pool) {
    return new Promise((resolve, reject) => {
        const normalized = normalizePhone(waPhone);
        const variants = [
            waPhone,                    // raw: 27821234567
            '+' + waPhone,              // +27821234567
            normalized,                 // 0821234567
        ].filter(Boolean);

        const placeholders = variants.map(() => '?').join(', ');
        const query = `
            SELECT ID, FirstName, LastName, Email, Contact, CompanyID, Role 
            FROM Users 
            WHERE Contact IN (${placeholders}) AND Role = 'client' 
            LIMIT 1
        `;

        pool.query(query, variants, (err, results) => {
            if (err) return reject(err);
            if (results.length > 0) {
                resolve({
                    id: results[0].ID,
                    name: `${results[0].FirstName} ${results[0].LastName}`.trim(),
                    email: results[0].Email,
                    phone: results[0].Contact,
                    companyId: results[0].CompanyID
                });
            } else {
                resolve(null);
            }
        });
    });
}

// ─── Get full client data (projects + invoices) ─────────────────────────────
async function getClientData(clientId, companyId, pool) {
    return new Promise((resolve, reject) => {
        // Get client from Users table
        pool.query('SELECT * FROM Users WHERE ID = ? AND Role = "client"', [clientId], (err, users) => {
            if (err) return reject(err);

            // Get projects
            pool.query('SELECT * FROM Projects WHERE CompanyID = ?', [companyId], (err, projects) => {
                if (err) return reject(err);

                // Get invoices
                pool.query('SELECT * FROM Invoices WHERE CompanyID = ?', [companyId], (err, invoices) => {
                    if (err) return reject(err);

                    resolve({
                        client: users[0],
                        projects: projects || [],
                        invoices: invoices || []
                    });
                });
            });
        });
    });
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
async function handleIncomingMessage(req, res, pool) {
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

        const senderPhone = message.from;
        const userText = message.text.body;
        const messageId = message.id;

        // Mark as read immediately
        await markAsRead(messageId).catch(() => {});

        console.log(`📱 WhatsApp message from ${senderPhone}: "${userText}"`);

        // ── Look up client ──────────────────────────────────────────────
        const client = await findClientByPhone(senderPhone, pool);

        if (!client) {
            await sendTextMessage(
                senderPhone,
                `👋 Hi! I don't recognize this number in the StackOps system.\n\nPlease contact us at hello@stackops.co.za or register at our portal to get started.`
            );
            return;
        }

        // ── Get full data ───────────────────────────────────────────────
        const clientData = await getClientData(client.id, client.companyId, pool);
        const unpaidInvoices = clientData.invoices.filter(
            inv => inv.Status === 'Unpaid' || inv.Status === 'Overdue'
        );
        const totalOwed = unpaidInvoices.reduce((sum, inv) => sum + parseFloat(inv.TotalAmount), 0);

        // ── Payment flow ────────────────────────────────────────────────
        if (detectPaymentIntent(userText) && unpaidInvoices.length > 0) {
            try {
                let paymentUrl, replyText;

                if (unpaidInvoices.length === 1) {
                    const invoice = unpaidInvoices[0];
                    // NOTE: You need to implement createPaymentLink function
                    // This should call your Yoco API or payment provider
                    replyText = `Hi ${client.name}! 👋\n\nYou have Invoice #${invoice.InvoiceID} for R${parseFloat(invoice.TotalAmount).toFixed(2)} awaiting payment.\n\nPlease contact us to process payment securely.`;
                    
                    await sendTextMessage(senderPhone, replyText);
                } else {
                    replyText = `Hi ${client.name}! 👋\n\nYou have *${unpaidInvoices.length} outstanding invoices* totaling *R${totalOwed.toFixed(2)}*.\n\nPlease contact us to settle these invoices.`;
                    
                    await sendTextMessage(senderPhone, replyText);
                }
            } catch (err) {
                console.error('❌ Payment message error:', err.message);
                await sendTextMessage(
                    senderPhone,
                    `Sorry ${client.name}, I had trouble processing your request. Please contact us directly!`
                );
            }
            return;
        }

        // ── AI response flow ────────────────────────────────────────────
        const systemPrompt = `You are a helpful WhatsApp assistant for StackOps, an IT solutions company based in South Africa.
You are chatting with a client via WhatsApp, so keep responses concise and WhatsApp-friendly (use *bold* for emphasis, avoid long paragraphs, use emojis sparingly).

CLIENT INFO:
- Name: ${client.name}
- Email: ${client.email}
- Phone: ${client.phone}

PROJECTS (${clientData.projects.length} total):
${clientData.projects.map(p => `- "${p.Name}" — Status: ${p.Status} — ${p.Description}`).join('\n') || 'No projects yet'}

INVOICES (${clientData.invoices.length} total):
${clientData.invoices.map(i => `- Invoice #${i.InvoiceID}: R${i.TotalAmount} (${i.Status.toUpperCase()}) — Due: ${i.DueDate}`).join('\n') || 'No invoices yet'}

TOTAL OWED: R${totalOwed.toFixed(2)}

Answer questions about their projects, invoices, and account status. Be friendly and professional.
If they ask about paying, let them know you can help coordinate payment.
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

        console.log(`✅ Replied to ${client.name} (${senderPhone})`);

    } catch (err) {
        console.error('❌ WhatsApp handler error:', err.message);
    }
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
