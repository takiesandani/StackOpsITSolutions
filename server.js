const bcrypt = require('bcryptjs');
const express = require('express');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');  // ADDED: For SHA1 hashing
const PDFDocument = require('pdfkit');
const fs = require('fs');
const OpenAI = require('openai');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');

// NOTE: dotenv check removed as credentials are now hardcoded

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Supabase disabled as MySQL credentials were provided
let useSupabase = false; 
let supabase = null;

// Supabase client initialization skipped since useSupabase is false

let pool = null;

if (!useSupabase) {
    const dbConfig = {
        user: 'admin-fix',                // Hardcoded DB_USER
        password: '@TakalaniSandani2005', // Hardcoded DB_PASSWORD
        database: 'consultation_db',      // Hardcoded DB_NAME
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        
        /*
        authPlugins: {
            'caching_sha2_password': () => require('mysql2/lib/auth_plugins/caching_sha2_password')
        } */
    };

    console.log(`Connecting to Cloud SQL via Socket: /cloudsql/stackops-backend-475222:us-central1:stackops-db`);
    dbConfig.socketPath = `/cloudsql/stackops-backend-475222:us-central1:stackops-db`;

    try {
        // Use mysql.createPool (promise-based) for modern Node.js
        pool = mysql.createPool(dbConfig);
    } catch (error) {
        console.error('Failed to create MySQL pool.', error);
        // Fallback logic removed since Supabase is disabled
    }
}

if (!pool) {
    console.warn('MySQL pool unavailable.');
}

function formatDateToMySQL(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

// connecting to nodemailer to send emails from contact form
const transporter = nodemailer.createTransport({
    host: 'smtpout.secureserver.net', // Default used (not provided in prompt)
    port: 465,                        // Default used
    secure: true,                     // Default used
    auth: {
        user: 'info@stackopsit.co.za', // Hardcoded EMAIL_USER
        pass: '632685356nS$'           // Hardcoded Email_pass
    }
});

// function to generate invoice PDF
async function generateInvoicePDF(invoiceData, items, companyData, clientData) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            let buffers = [];
            
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                let pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });
            
            doc.on('error', (err) => {
                reject(err);
            });

            const logoPath = path.join(__dirname, 'Images', 'Logos', 'RemovedStackOps.png');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 50, 45, { width: 100 });
            }

            doc.fillColor('#444444')
               .fontSize(20)
               .text('INVOICE', 50, 120);

            const formatDate = (dateStr) => {
                const date = new Date(dateStr);
                return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString();
            };

            doc.fontSize(10)
               .text(`Invoice Number: ${invoiceData.InvoiceNumber || 'N/A'}`, 200, 50, { align: 'right' })
               .text(`Invoice Date: ${formatDate(invoiceData.InvoiceDate)}`, 200, 65, { align: 'right' })
               .text(`Due Date: ${formatDate(invoiceData.DueDate)}`, 200, 80, { align: 'right' })
               .moveDown();

        // From details
        doc.fontSize(12).text('FROM:', 50, 160);
        doc.fontSize(10)
           .text('StackOps IT Solutions', 50, 175)
           .text('Mia Drive, Waterfall City', 50, 190)
           .text('Johannesburg, 1685', 50, 205)
           .text('011 568 9337', 50, 220)
           .text('billing@stackopsit.co.za', 50, 235);

        // To details
        doc.fontSize(12).text('TO:', 300, 160);
        doc.fontSize(10)
           .text(companyData.CompanyName, 300, 175)
           .text(`${clientData.firstname} ${clientData.lastname}`, 300, 190)
           .text(companyData.address || '', 300, 205)
           .text(`${companyData.city || ''} ${companyData.state || ''} ${companyData.zipcode || ''}`, 300, 220)
           .text(clientData.email, 300, 235);

        // Table Header
        const tableTop = 280;
        doc.rect(50, tableTop, 510, 20).fill('#eeeeee');
        doc.fillColor('#000000')
           .fontSize(10)
           .text('Description', 60, tableTop + 5)
           .text('Quantity', 250, tableTop + 5)
           .text('Unit Price', 350, tableTop + 5)
           .text('Amount', 450, tableTop + 5);

        // Items
        let i = 0;
        items.forEach((item, index) => {
            const y = tableTop + 25 + (i * 25);
            doc.text(item.Description, 60, y)
               .text(item.Quantity.toString(), 250, y)
               .text(`R${parseFloat(item.UnitPrice).toFixed(2)}`, 350, y)
               .text(`R${(item.Quantity * item.UnitPrice).toFixed(2)}`, 450, y);
            i++;
        });

        const totalY = tableTop + 35 + (i * 25);
        doc.moveTo(50, totalY - 5).lineTo(560, totalY - 5).stroke();
        doc.fontSize(12).text('TOTAL:', 350, totalY);
        doc.text(`R${parseFloat(invoiceData.TotalAmount).toFixed(2)}`, 450, totalY);

        // Payment Details Space
        doc.fontSize(10)
           .moveDown(2)
           .text('PAYMENT DETAILS:', 50, doc.y)
           .text('Bank Name: [To be updated]', 50, doc.y + 15)
           .text('Account Number: [To be updated]', 50, doc.y + 30)
           .text('Reference: ' + invoiceData.InvoiceNumber, 50, doc.y + 45);

        doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

// function to send email to admin email 
const sendEmail = async (to, subject, body, isHtml = false, attachments = []) => {
    const mailOptions = {
        from: 'info@stackopsit.co.za', // Hardcoded EMAIL_USER
        to: to,
        subject: subject,
        attachments: attachments
    };
    
    if (isHtml) {
        mailOptions.html = body;
    } else {
        mailOptions.text = body;
    }
    
    try {
        console.log(`Attempting to send email to ${to}...`);
        await transporter.sendMail(mailOptions);
        console.log(`Email successfully sent to ${to}`);
    } catch (error) {
        console.error(`Failed to send email to ${to}:`, error);
        throw error; // Rethrow so the caller knows it failed
    }
};

// function to send email from the billing email 
const sendBillingEmail = async (to, subject, body, isHtml = false, attachments = []) => {
    const mailOptions = {
        from: 'billing@stackopsit.co.za', // Hardcoded EMAIL_USER
        to: to,
        subject: subject,
        attachments: attachments
    };
    
    if (isHtml) {
        mailOptions.html = body;
    } else {
        mailOptions.text = body;
    }
    
    try {
        console.log(`Attempting to send email to ${to}...`);
        await transporter.sendMail(mailOptions);
        console.log(`Email successfully sent to ${to}`);
    } catch (error) {
        console.error(`Failed to send email to ${to}:`, error);
        throw error; // Rethrow so the caller knows it failed
    }
};

async function getUserByEmail(email) {
    try {
        if (!pool) {
            throw new Error('MySQL pool is not available.');
        }
        // Normalize column names so we can reliably use user.id, user.email, user.role in code
        const [rows] = await pool.query(
            `SELECT 
                ID        AS id,
                FirstName AS firstName,
                LastName  AS lastName,
                Email     AS email,
                Contact   AS contact,
                Position  AS position,
                password,
                isActive  AS isActive,
                Role      AS role,
                CompanyID AS companyId,
                CreatedAt AS createdAt
             FROM Users
             WHERE Email = ?`,
            [email]
        );
        return rows[0] || null;
    } catch (err) {
        console.error('getUserByEmail error:', err);
        throw err;
    }
}

async function checkMfaCode(user_id, code) {
    try {
        if (!pool) {
            throw new Error('MySQL pool is not available.');
        }
        const [codes] = await pool.query('SELECT * FROM mfa_codes WHERE user_id = ? AND code = ? AND expires_at > NOW()', [user_id, code]);
        return codes[0]; 
    } catch (err) {
        console.error('checkMfaCode error:', err);
        throw err;
    }
}

async function insertMfaCode(user_id, code, expires_at) {
    try {
        if (!pool) {
            throw new Error('MySQL pool is not available.');
        }
        await pool.query(
            'INSERT INTO mfa_codes (user_id, code, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE code = VALUES(code), expires_at = VALUES(expires_at)',
            [user_id, code, expires_at]
        );
    } catch (err) {
        console.error('insertMfaCode error:', err);
        throw err;
    }
}

// Seed initial availability data for the next 30 days (updated from original)
async function seedAvailability() {
    try {
        console.log('Checking for existing appointments...');

        let count = 0;

        if (!pool) {
            throw new Error('MySQL pool is not available.');
        }
        const [rows] = await pool.query('SELECT COUNT(*) AS count FROM appointment');
        count = rows[0].count;

        if (count === 0) {
            console.log('No appointments found. Seeding availability data...');

            const today = new Date();
            const dates = [];
            for (let i = 0; i < 30; i++) {  // Updated to 30 days (from original)
                const date = new Date(today);
                date.setDate(today.getDate() + i);
                dates.push(date.toISOString().split('T')[0]); 
            }
            
            const times = ['09:00:00', '10:00:00', '11:00:00', '14:00:00', '15:00:00']; 

            for (const date of dates) {
                for (const time of times) {
                    if (!pool) {
                        throw new Error('MySQL pool is not available.');
                    }
                    await pool.query('INSERT INTO appointment (date, time, is_available) VALUES (?, ?, ?)', [date, time, true]);
                }
            }

            console.log(`Seeded ${dates.length * times.length} available slots.`);
        } else {
            console.log(`Found ${count} existing appointments. Skipping seed.`);
        }
    } catch (err) {
        console.error('seedAvailability error:', err);
        throw err;
    }
}

// Function to ensure database schema is up to date for automation
async function ensureDatabaseSchema() {
    try {
        if (!pool) return;
        console.log('Ensuring database schema for automation...');
        
        // Add PaidEmailSent column if it doesn't exist
        const [columns] = await pool.query("SHOW COLUMNS FROM Invoices LIKE 'PaidEmailSent'");
        if (columns.length === 0) {
            console.log('Adding PaidEmailSent column to Invoices table...');
            await pool.query("ALTER TABLE Invoices ADD COLUMN PaidEmailSent BOOLEAN DEFAULT FALSE");
        }
        
        // Add LastReminderDate column to track daily reminders
        const [columns2] = await pool.query("SHOW COLUMNS FROM Invoices LIKE 'LastReminderDate'");
        if (columns2.length === 0) {
            console.log('Adding LastReminderDate column to Invoices table...');
            await pool.query("ALTER TABLE Invoices ADD COLUMN LastReminderDate DATE DEFAULT NULL");
        }
    } catch (err) {
        console.error('ensureDatabaseSchema error:', err);
    }
}

// Call seed availability and schema check NON-BLOCKING (after server starts)
setTimeout(() => {
    seedAvailability().catch((error) => console.error('Seed availability failed:', error));
    ensureDatabaseSchema().catch((error) => console.error('Schema update failed:', error));
}, 1000);  // Delay to ensure server starts first

// --- INVOICE AUTOMATION ---

/**
 * CONFIGURATION FOR TESTING:
 * To test immediately, set:
 * - TEST_MODE: true
 * - INTERVAL_MS: 10000 (10 seconds)
 * This will ignore the hour checks and send emails every 10 seconds.
 * 
 * FOR PRODUCTION:
 * - TEST_MODE: false
 * - INTERVAL_MS: 3600000 (1 hour)
 */
const AUTOMATION_CONFIG = {
    ENABLED: true,
    CHECK_HOUR: 0,             // 00:00 for status updates (Pending -> Overdue)
    EMAIL_HOUR: 8,             // 08:00 for email reminders (8 hours after check)
    FINE_DAYS_THRESHOLD: 3,     // 3 days overdue for fine message
    TEST_MODE: false,          // If true, ignores hour checks and allows repeat emails
    INTERVAL_MS: 60 * 60 * 1000 // Check frequency (default: 1 hour)
};

async function runInvoiceAutomation() {
    if (!AUTOMATION_CONFIG.ENABLED || !pool) return;

    const now = new Date();
    const currentHour = now.getHours();
    const todayStr = now.toISOString().split('T')[0];

    console.log(`[Automation] Running check at ${now.toLocaleString()}${AUTOMATION_CONFIG.TEST_MODE ? ' (TEST MODE)' : ''}`);

    try {
        // 1. STATUS UPDATES (Runs at 00:00 or in TEST_MODE)
        if (currentHour === AUTOMATION_CONFIG.CHECK_HOUR || AUTOMATION_CONFIG.TEST_MODE) {
            console.log('[Automation] Checking for overdue invoices...');
            // Find Pending invoices where DueDate <= current date
            const [pendingInvoices] = await pool.query(
                "SELECT InvoiceID, InvoiceNumber FROM Invoices WHERE Status = 'Pending' AND DueDate <= CURDATE()"
            );

            for (const invoice of pendingInvoices) {
                console.log(`[Automation] Marking Invoice #${invoice.InvoiceNumber} as Overdue`);
                await pool.query(
                    "UPDATE Invoices SET Status = 'Overdue' WHERE InvoiceID = ?",
                    [invoice.InvoiceID]
                );
            }
        }

        // 2. EMAIL REMINDERS (Runs at 08:00 or in TEST_MODE)
        if (currentHour === AUTOMATION_CONFIG.EMAIL_HOUR || AUTOMATION_CONFIG.TEST_MODE) {
            console.log('[Automation] Processing email reminders...');

            // A. Handle PAID confirmations
            const [paidInvoices] = await pool.query(
                `SELECT i.*, c.companyname as CompanyName, u.firstname, u.lastname, u.email 
                 FROM Invoices i
                 JOIN Companies c ON i.CompanyID = c.ID
                 JOIN Users u ON c.ID = u.CompanyID
                 WHERE LOWER(i.Status) = 'paid' AND (i.PaidEmailSent = FALSE OR ? = TRUE)`,
                [AUTOMATION_CONFIG.TEST_MODE]
            );
            
            for (const invoice of paidInvoices) {
                console.log(`[Automation] Sending payment confirmation for Invoice #${invoice.InvoiceNumber}`);
                const emailBody = `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                        <p>Good day ${invoice.lastname},</p>
                        <p>This is a confirmation that your payment for <b>Invoice #${invoice.InvoiceNumber}</b> has been received and confirmed.</p>
                        <p>Thank you for your business!</p>
                        <p>Best regards,<br><b>StackOps IT Solutions Team</b></p>
                    </div>
                `;
                await sendBillingEmail(invoice.email, `Payment Confirmed - Invoice #${invoice.InvoiceNumber}`, emailBody, true);
                await pool.query("UPDATE Invoices SET PaidEmailSent = TRUE WHERE InvoiceID = ?", [invoice.InvoiceID]);
            }

            // B. Handle OVERDUE reminders
            const [overdueInvoices] = await pool.query(
                `SELECT i.*, c.companyname as CompanyName, u.firstname, u.lastname, u.email 
                 FROM Invoices i
                 JOIN Companies c ON i.CompanyID = c.ID
                 JOIN Users u ON c.ID = u.CompanyID
                 WHERE LOWER(i.Status) = 'overdue' AND (i.LastReminderDate IS NULL OR i.LastReminderDate < ? OR ? = TRUE)`,
                [todayStr, AUTOMATION_CONFIG.TEST_MODE]
            );

            for (const invoice of overdueInvoices) {
                const dueDate = new Date(invoice.DueDate);
                const diffTime = Math.abs(now - dueDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                let subject = `Overdue Payment Reminder - Invoice #${invoice.InvoiceNumber}`;
                let messagePrefix = `<p>This is a reminder that your payment for <b>Invoice #${invoice.InvoiceNumber}</b> was due on ${dueDate.toLocaleDateString()}.</p>`;
                
                if (diffDays >= AUTOMATION_CONFIG.FINE_DAYS_THRESHOLD) {
                    subject = `URGENT: Overdue Payment & Fine Warning - Invoice #${invoice.InvoiceNumber}`;
                    messagePrefix = `
                        <p style="color: red; font-weight: bold;">URGENT NOTICE</p>
                        <p>This is a final reminder that your payment for <b>Invoice #${invoice.InvoiceNumber}</b> is now ${diffDays} days overdue.</p>
                        <p>Please note that as per our terms, a fine is now being applied to your account due to the delay.</p>
                    `;
                }

                console.log(`[Automation] Sending overdue reminder for Invoice #${invoice.InvoiceNumber} (${diffDays} days)`);
                const emailBody = `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                        <p>Good day ${invoice.lastname},</p>
                        ${messagePrefix}
                        <p>Amount Due: R${parseFloat(invoice.TotalAmount).toFixed(2)}</p>
                        <p>Please settle this amount as soon as possible to avoid further action.</p>
                        <p>If you have already made payment, please ignore this email.</p>
                        <p>Best regards,<br><b>StackOps IT Solutions Team</b></p>
                    </div>
                `;
                
                await sendBillingEmail(invoice.email, subject, emailBody, true);
                await pool.query("UPDATE Invoices SET LastReminderDate = ? WHERE InvoiceID = ?", [todayStr, invoice.InvoiceID]);
            }
        }
    } catch (error) {
        console.error('[Automation] Error during invoice automation:', error);
    }
}

// Start the automation loop
setInterval(runInvoiceAutomation, AUTOMATION_CONFIG.INTERVAL_MS);
// Also run once on startup after a delay
setTimeout(runInvoiceAutomation, 5000);

// --- END INVOICE AUTOMATION ---

// Serve static files from the root directory (for CSS, JS, images)
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Home.html'));
});

app.get('/admin/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

// API endpoint to get available time slots for a given date (updated from original)
app.get('/api/schedule', async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).send('Date is required.');
    }

    try {
        let availableTimes;

        // First, ensure default slots exist for the date (auto-create if missing, from original)
        const standardTimes = ['09:00:00', '10:00:00', '11:00:00', '14:00:00', '15:00:00'];
        if (!pool) {
            throw new Error('MySQL pool is not available.');
        }
        const [existingRows] = await pool.query(
            'SELECT time FROM appointment WHERE date = ?',
            [date]
        );
        const existingTimes = new Set(existingRows.map(row => row.time));
        const slotsToInsert = standardTimes
            .filter(time => !existingTimes.has(time))
            .map(time => [date, time, true, null, null, null, null]);

        if (slotsToInsert.length > 0) {
            await pool.query(
                'INSERT INTO appointment (date, time, is_available, clientname, email, service, message) VALUES ?',
                [slotsToInsert]
            );
        }

        // Now fetch available times
        const [rows] = await pool.query(
            'SELECT time FROM appointment WHERE date = ? AND is_available = TRUE AND clientname IS NULL',
            [date]
        );
        availableTimes = rows.map(row => row.time);

        res.json(availableTimes);

    } catch (error) {
        console.error('Error fetching schedule:', error);
        res.status(500).send('Server error.');
    }
});

// function to book a consultation from consultation.html page (updated from original)
app.post('/api/book', async (req, res) => {
    const { date, time, name, email, service, message } = req.body;
    
    let updateSuccessful = false;
    let result; 

    try {
        if (!pool) {
            throw new Error('MySQL pool is not available.');
        }
        [result] = await pool.query(
            'UPDATE appointment SET is_available = FALSE, clientname = ?, email = ?, service = ?, message = ? WHERE date = ? AND time = ? AND is_available = TRUE',
            [name, email, service, message, date, time]
        );
        
        if (result.affectedRows > 0) {
            updateSuccessful = true;
        }
        
        if (!updateSuccessful) {
            return res.status(409).send('The selected time slot is no longer available. Please choose another.');
        }

        const clientConfirmation = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
                    .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border-top: 5px solid #007bff; }
                    .content { padding: 30px; }
                    .footer { text-align: center; font-size: 0.8em; color: #888; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
                    a { color: #007bff; text-decoration: none; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="content">
                        <p>Hello ${name},</p>
                        <p>Your consultation with StackOps IT Solutions has been successfully booked for **${date} at ${time}**. We look forward to speaking with you about your **${service}** inquiry!</p>
                        <p>If you need to reschedule or cancel, please contact us by replying to this email.</p>
                        <p>Best regards,</p>
                        <p>The StackOps IT Team</p>
                    </div>
                    
                    <div class="footer">
                        <p>StackOps IT Solutions (Pty) Ltd | Reg. No: 2016/120370/07 | B-BBEE Level: 1 Contributor: 135% | CSD Supplier: MAAA1641244</p>
                        <p>Legally registered in South Africa. All client information is protected in accordance with the Protection of Personal Information Act (POPIA) and our internal privacy and security policies.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        const adminNotification = `New Consultation Booking:

- Name: ${name}
- Email: ${email}
- Date: ${date}
- Time: ${time}
- Service: ${service}
- Notes: ${message || 'N/A'}`;
        
        await sendEmail(email, 'Booking Confirmation', clientConfirmation, true);
        await sendEmail('info@stackopsit.co.za', 'New Consultation Booking', adminNotification); // Hardcoded EMAIL_USER
        
        res.status(200).send('Booking successful!');
        
    } catch (error) {
        console.error('Booking error:', error);
        res.status(500).send('Failed to book consultation.');
    }
});


const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        if (req.originalUrl.startsWith('/api')) {
             return res.status(401).json({ success: false, message: 'Unauthorized: No token provided.' });
        }
        return res.redirect('/signin.html');
    }

    // Hardcoded ACCESS_TOKEN_SECRET
    const ACCESS_TOKEN_SECRET = '7a076e42670cfe26193655fe5f48b776defe078754ca16fb9ae0a054b354d335';

    jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) {
            if (req.originalUrl.startsWith('/api')) {
                return res.status(403).json({ success: false, message: 'Forbidden: Invalid or expired token.' });
            }
            return res.redirect('/signin.html');
        }
        req.user = user;
        next();
    });
};

// API endpoint for admin to get all bookings (updated from original)
app.get('/api/admin/bookings', authenticateToken, async (req, res) => {
    try {
        let bookings;

        if (!pool) {
            throw new Error('MySQL pool is not available.');
        }
        const [rows] = await pool.query('SELECT date, time, clientname as name, email, service, message FROM appointment WHERE clientname IS NOT NULL ORDER BY date DESC, time ASC');
        bookings = rows;

        res.json(bookings);
    } catch (error) {
        console.error('Error fetching admin bookings:', error);
        res.status(500).send('Server error.');
    }
});

// API endpoint for admin to get schedule for a date (added from original)
app.get('/api/admin/schedule', authenticateToken, async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).send('Date is required.');
    }

    try {
        let bookings;

        if (!pool) {
            throw new Error('MySQL pool is not available.');
        }
        const [rows] = await pool.query(
            'SELECT * FROM appointment WHERE date = ? ORDER BY time ASC',
            [date]
        );
        bookings = rows;

        // Standard times array for comparison to ensure all standard slots are present
        const standardTimes = ['09:00:00', '10:00:00', '11:00:00', '14:00:00', '15:00:00'];
        const existingTimes = new Set(bookings.map(b => b.time));
        
        // Add default available slots if they don't exist for the day
        for (const time of standardTimes) {
            if (!existingTimes.has(time)) {
                // Insert new available slot
                const newSlot = { date, time, is_available: true, clientname: null, email: null, service: null, message: null };
                if (!pool) {
                    throw new Error('MySQL pool is not available.');
                }
                await pool.query('INSERT INTO appointment (date, time, is_available) VALUES (?, ?, ?)', [date, time, true]);
                bookings.push(newSlot); // Add to the array for the response
            }
        }
        
        // Sort the final list by time
        bookings.sort((a, b) => a.time.localeCompare(b.time));

        res.json(bookings);

    } catch (error) {
        console.error('Error fetching admin schedule:', error);
        res.status(500).send('Server error.');
    }
});

// managing admin availability (updated from original, FIXED syntax error)
app.post('/api/admin/availability', authenticateToken, async (req, res) => {
    const { date, time } = req.body;
    let { isAvailable } = req.body; 
    
    if (isAvailable !== undefined) {  // FIXED: Added 'undefined'
        isAvailable = (isAvailable === true || isAvailable === 'true');
    }

    if (!date || !time || isAvailable === undefined) {
        return res.status(400).send('Missing required availability data.');
    }

    try {
        if (!pool) {
            throw new Error('MySQL pool is not available.');
        }
        await pool.query(
            'UPDATE appointment SET is_available = ?, clientname = NULL, email = NULL, service = NULL, message = NULL WHERE date = ? AND time = ?',
            [isAvailable, date, time]
        );

        res.status(200).send('Availability updated successfully.');
    } catch (error) {
        console.error('Error updating availability:', error);
        res.status(500).send('Server error.');
    }
});

app.post('/api/auth/signin', async (req, res) => {
    try {
        console.log('Signin attempt:', req.body.email);
        const { email, password } = req.body;
        console.log('Calling getUserByEmail...');
        const user = await getUserByEmail(email);
        console.log('User found:', !!user, user ? user.id : 'N/A');
        
        // Security: Don't reveal if email exists - use same message for both cases
        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid email or password. Please check your credentials and try again." });
        }

        // Check if user is a client (for Client Portal access)
        // Allow both 'client' role and 'admin' role to sign in
        const userRole = user.role ? user.role.toLowerCase() : '';
        if (userRole !== 'client' && userRole !== 'admin') {
            return res.status(403).json({ success: false, message: "Access denied. This portal is only available for authorized clients and administrators." });
        }

        // Hybrid password verification:
        // 1) Prefer bcrypt (new Node.js hashing, hashes start with `$2`)
        // 2) Fallback to legacy C# SHA1 (40-char hex, sometimes truncated) for older accounts
        let validPassword = false;
        try {
            if (user.password && user.password.startsWith('$2')) {
                // New bcrypt-based accounts
                validPassword = await bcrypt.compare(password, user.password);
            } else if (user.password) {
                // Legacy SHA1-based accounts (old C# logic we had before)
                const sha1Hash = crypto.createHash('sha1').update(password).digest('hex').slice(0, -2);
                validPassword = (sha1Hash === user.password);
            }
        } catch (compareErr) {
            console.error('Password compare error:', compareErr);
            // Treat as invalid credentials instead of 500
            validPassword = false;
        }
        
        // Security: Use same message for invalid password (don't reveal if email exists)
        if (!validPassword) {
            return res.status(400).json({ success: false, message: "Invalid email or password. Please check your credentials and try again." });
        }
        
        const mfaCode = Math.floor(100000 + Math.random() * 900000);
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + 10 * 60000); // 10 minutes
        
        await insertMfaCode(user.id, mfaCode, expiresAt);
        
        await sendEmail(user.email, 'Your MFA Code', `Your MFA code is ${mfaCode}. It will expire in 10 minutes.`);
        console.log('Signin successful');
        res.json({ success: true, message: "MFA code sent. Please check your email to verify your login." });
    } catch (err) {
        console.error('Signin error details:', err.message, err.stack);
        res.status(500).json({ success: false, message: "An error occurred during sign-in. Please try again later." });
    }
});

// Resend MFA code endpoint
app.post('/api/auth/send-mfa', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email address is required.' });
        }
        
        const user = await getUserByEmail(email);
        
        if (!user) {
            return res.status(400).json({ success: false, message: 'Unable to send verification code. Please check your email address and try again.' });
        }
        
        // Generate new MFA code
        const mfaCode = Math.floor(100000 + Math.random() * 900000);
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + 10 * 60000); // 10 minutes
        
        await insertMfaCode(user.id, mfaCode, expiresAt);
        
        await sendEmail(user.email, 'Your MFA Code', `Your MFA code is ${mfaCode}. It will expire in 10 minutes.`);
        
        res.json({ success: true, message: 'A new verification code has been sent to your email address.' });
    } catch (error) {
        console.error('Send MFA error:', error);
        res.status(500).json({ success: false, message: 'An error occurred while sending the verification code. Please try again later.' });
    }
});

//  MFA issues the JWT token upon success (from original)
app.post('/api/auth/verify-mfa', async (req, res) => {
    try {
        const { email, code } = req.body;
        
        if (!email || !code) {
            return res.status(400).json({ success: false, message: 'Email and verification code are required.' });
        }
        
        const user = await getUserByEmail(email);
        
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid verification code. Please try again.' });
        }
        
        const validCode = await checkMfaCode(user.id, code);

        if (!validCode) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification code. Please request a new code.' });
        }
        
        // MySQL Delete MFA
        await pool.query('DELETE FROM mfa_codes WHERE user_id = ?', [user.id]);

        // Hardcoded ACCESS_TOKEN_SECRET
        const ACCESS_TOKEN_SECRET = '7a076e42670cfe26193655fe5f48b776defe078754ca16fb9ae0a054b354d335';

        const accessToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

        // Use role from Users table instead of hard-coded email list
        const isAdmin = (user.role && user.role.toLowerCase() === 'admin');

        res.json({
            success: true,
            message: 'Authentication successful!',
            accessToken: accessToken,
            redirect: isAdmin ? '/Admin.html' : '/ClientPortal.html',
            user: {
                firstName: user.firstName || '',
                lastName: user.lastName || ''
            }
        });
        
    } catch (error) {
        console.error('MFA verification error:', error);
        res.status(500).json({ success: false, message: 'An error occurred during verification. Please try again later.' });
    }
});

// NEW: Protect the Client Portal route with the authentication middleware (from original)
app.get('/ClientPortal.html', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'ClientPortal.html'));
});

// CRITICAL FIX: Wrapped the entire transaction logic for dual-database support (adapted for MySQL-only, from original)
app.post('/api/admin/register-client', async (req, res) => {
    const {
        firstName, lastName, email, contact, password,
        companyName, website, industry, address, city, state, zipCode, country
    } = req.body;
    
    if (!firstName || !lastName || !email || !password || !companyName) {
        return res.status(400).json({ success: false, message: 'Missing required client or company details.' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    let registrationSuccessful = false;

    try {
        // MySQL Registration
        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // Check if company already exists (case-insensitive match on company name)
            const [existingCompany] = await connection.query(
                `SELECT ID FROM Companies WHERE LOWER(companyname) = LOWER(?) LIMIT 1`,
                [companyName]
            );

            let companyId;
            
            if (existingCompany && existingCompany.length > 0) {
                // Company exists - reuse its ID
                companyId = existingCompany[0].ID;
                console.log(`Reusing existing company ID ${companyId} for "${companyName}"`);
            } else {
                // Company doesn't exist - create new one
                const [companyResult] = await connection.query(
                    `INSERT INTO Companies (companyname, website, industry, address, city, state, zipcode, country)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [companyName, website, industry, address, city, state, zipCode, country]
                );
                companyId = companyResult.insertId;
                console.log(`Created new company ID ${companyId} for "${companyName}"`);
            }
            
            await connection.query(
                `INSERT INTO Users (firstname, lastname, email, contact, password, isactive, role, companyid)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [firstName, lastName, email, contact, hashedPassword, 1, 'client', companyId]
            );
            
            await connection.commit();
            registrationSuccessful = true;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        
        if (registrationSuccessful) {
            const loginLink = "https://stackopsit.co.za/ClientPortal.html";
            const forgotPasswordLink = "https://stackopsit.co.za/forgot-password.html";
            const emailBody = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
                    .email-container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #ffffff; }
                    .header { background-color: #007bff; padding: 10px 20px; text-align: center; border-radius: 8px 8px 0 0; }
                    .header h2 { margin: 0; color: #ffffff; }
                    .content { padding: 20px 0; }
                    .credentials { background-color: #e9e9e9; padding: 15px; border-left: 5px solid #007bff; margin: 20px 0; }
                    .credentials p { margin: 5px 0; }
                    .password-display { font-family: monospace; font-size: 1.1em; font-weight: bold; color: #007bff; }
                    .important-note { background-color: #fff3cd; padding: 15px; border-left: 5px solid #ffc107; margin: 20px 0; border-radius: 4px; }
                    .important-note p { margin: 5px 0; }
                    .footer { text-align: center; font-size: 0.8em; color: #888; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
                    a { color: #007bff; text-decoration: none; }
                    .button { display: inline-block; padding: 10px 20px; margin-top: 15px; background-color: #007bff; color: white !important; text-decoration: none; border-radius: 5px; }
                    .button-secondary { display: inline-block; padding: 10px 20px; margin-top: 15px; background-color: #6c757d; color: white !important; text-decoration: none; border-radius: 5px; }
                    </style>
                </head>
                <body>
                    <div class="email-container">
                        <div class="header">
                            <h2>Welcome to StackOps IT Solutions!</h2>
                        </div>
                        <div class="content">
                            <p>Dear ${firstName} ${lastName},</p>
                            <p>Welcome! An account has been created for you to access the StackOps IT Solutions Client Portal.</p>
                            <p>You can use the following credentials to log in:</p>
                            <div class="credentials">
                                <p><strong>Email:</strong> ${email}</p>
                                <p><strong>Password:</strong> <span class="password-display">${password}</span></p>
                            </div>
                            <div class="important-note">
                                <p><strong>Important:</strong> Your password has been auto-generated. For security reasons, we strongly recommend that you reset your password after your first login using the "Forgot Password" feature.</p>
                            </div>
                            <p>Click here to get started:</p>
                            <p><a href="${loginLink}" class="button">Client Portal Login</a></p>
                            <p style="margin-top: 20px;">To reset your password, you can use the forgot password feature:</p>
                            <p><a href="${forgotPasswordLink}" class="button-secondary">Reset Password</a></p>
                            <p>If you have any questions, please do not hesitate to contact us.</p>
                            <p>Best regards,<br>The StackOps IT Team</p>
                        </div>
                        <div class="footer">
                            <p>&copy; ${new Date().getFullYear()} StackOps IT Solutions. All rights reserved.</p>
                        </div>
                    </div>
                </body>
                </html>
            `;
            
            await sendEmail(email, 'Your StackOps IT Client Portal Credentials', emailBody, true);
            
            res.status(200).json({ success: true, message: 'Client and company registered successfully. Login credentials emailed.' });
        }
        
    } catch (error) {
        console.error('Registration failed:', error);
        res.status(500).json({ success: false, message: 'Failed to register client. Please check the provided information.' });
    }
});

// Add a new GET endpoint to serve the forgot-password page (from original)
app.get('/forgot-password.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'forgot_password.html'));
});

// Endpoint to handle the password reset request (Step 1: Send token, from original)
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    try {
        const user = await getUserByEmail(email);

        if (!user) {
            return res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
        }

        const resetToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await pool.query(
            `INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at)`,
            [user.id, resetToken, expiresAt] 
        );

        const resetLink = `https://stackopsit.co.za/reset-password.html?token=${resetToken}`;

        const emailBody = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
                    .email-container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #ffffff; }
                    .content { padding: 20px 0; }
                    .button { display: inline-block; padding: 10px 20px; background-color: #007bff; color: white !important; text-decoration: none; border-radius: 5px; }
                    .footer { text-align: center; font-size: 0.8em; color: #888; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
                </style>
            </head>
            <body>
                <div class="email-container">
                    <div class="content">
                        <p>Hello,</p>
                        <p>You have requested to reset your password. Please click the button below to proceed:</p>
                        <p><a href="${resetLink}" class="button">Reset Password</a></p>
                        <p style="margin-top: 20px;">This link will expire in 1 hour. If you did not request this, please ignore this email.</p>
                        <p>Best regards,<br>The StackOps IT Team</p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} StackOps IT Solutions. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        await sendEmail(email, 'Password Reset Request', emailBody, true);

        res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
});

// Endpoint to verify the token and serve the password change page (from original)
app.get('/reset-password.html', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send('Invalid or missing token.');
    }

    try {
        let tokens;
        
        if (!pool) {
            throw new Error('MySQL pool is not available.');
        }
        [tokens] = await pool.query(
            'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()',
            [token]
        );

        if (tokens.length === 0) {
            return res.status(400).send('Invalid or expired password reset link.');
        }

        res.sendFile(path.join(__dirname, 'reset-password.html'));
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).send('Server error. Please try again.');
    }
});

// Endpoint to handle the password update (Step 2: Update password, from original)
app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }

    try {
        let userId;

        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [tokens] = await connection.query(
                'SELECT user_id FROM password_resets WHERE token = ? AND expires_at > NOW()',
                [token]
            );

            if (tokens.length === 0) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
            }

            userId = tokens[0].user_id;

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            await connection.query('UPDATE Users SET password = ? WHERE ID = ?', [hashedPassword, userId]);

            await connection.query('DELETE FROM password_resets WHERE token = ?', [token]);

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
        
        res.status(200).json({ success: true, message: 'Password has been successfully updated!' });

    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ success: false, message: 'Failed to reset password.' });
    }
});

// Contact message endpoint (from original)
app.post('/api/contact-message', async (req, res) => {
    const { firstName, lastName, company, email, contact, service, message } = req.body;

    if (
        !firstName?.trim() ||
        !lastName?.trim() ||
        !company?.trim() ||
        !email?.trim() ||
        !contact?.trim() ||
        !service?.trim() ||
        !message?.trim()
    ) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const emailBody = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Contact Inquiry | StackOps IT</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
                .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); border-top: 5px solid #007bff; }
                .header { background-color: #007bff; padding: 20px 30px; border-radius: 8px 8px 0 0; text-align: center; }
                .header h1 { margin: 0; font-size: 24px; color: #ffffff; }
                .content { padding: 30px; }
                .section-title { font-size: 18px; color: #007bff; border-bottom: 2px solid #f4f4f4; padding-bottom: 5px; margin-top: 20px; margin-bottom: 15px; font-weight: bold; }
                .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                .data-table tr:nth-child(even) { background-color: #f9f9f9; }
                .data-table th, .data-table td { padding: 10px 15px; text-align: left; border-bottom: 1px solid #eee; }
                .data-table th { width: 35%; color: #555; font-weight: normal; }
                .message-box { background-color: #fff8e1; border: 1px solid #ffecb3; padding: 20px; border-radius: 5px; margin-top: 15px; }
                .footer { padding: 20px 30px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>&#128231; New Contact Inquiry: ${company}</h1>
                </div>
                
                <div class="content">
                    <p style="font-size: 16px;">
                        A new message has been received from **${firstName} ${lastName}** at **${company}**.
                        The inquiry is for **${service}**.
                    </p>

                    <div class="section-title">Client & Contact Details</div>
                    <table class="data-table">
                        <tr>
                            <th>Name:</th>
                            <td>${firstName} ${lastName}</td>
                        </tr>
                        <tr>
                            <th>Company:</th>
                            <td>${company}</td>
                        </tr>
                        <tr>
                            <th>Email:</th>
                            <td><a href="mailto:${email}" style="color: #007bff;">${email}</a></td>
                        </tr>
                        <tr>
                            <th>Contact Number:</th>
                            <td>${contact}</td>
                        </tr>
                    </table>

                    <div class="section-title">Service Interest</div>
                    <table class="data-table">
                        <tr>
                            <th>Service Requested:</th>
                            <td>**${service}**</td>
                        </tr>
                    </table>
                    
                    <div class="section-title">Message Details</div>
                    <div class="message-box">
                        <p style="margin: 0; white-space: pre-wrap;">${message}</p>
                    </div>

                </div>
                <div class="footer">
                    <p>&copy; ${new Date().getFullYear()} StackOps IT Solutions. All rights reserved. | Automated Contact Alert</p>
                </div>
            </div>
        </body>
        </html>
    `;

    try {
        await sendEmail('info@stackopsit.co.za', `New Inquiry: ${company} - ${service}`, emailBody, true); // Hardcoded EMAIL_USER

        res.json({ success: true });
    } catch (error) {
        console.error('Contact message error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message.' });
    }
});

// ============================================
// ADMIN API ENDPOINTS - INVOICES & MANAGEMENT
// ============================================

// Get all companies
app.get('/api/admin/companies', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        const [companies] = await pool.query('SELECT * FROM Companies ORDER BY CompanyName');
        res.json(companies);
    } catch (error) {
        console.error('Error fetching companies:', error);
        res.status(500).json({ error: 'Failed to fetch companies' });
    }
});

// Get company by ID
app.get('/api/admin/companies/:id', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        const [companies] = await pool.query('SELECT * FROM Companies WHERE ID = ?', [req.params.id]);
        if (companies.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }
        res.json(companies[0]);
    } catch (error) {
        console.error('Error fetching company:', error);
        res.status(500).json({ error: 'Failed to fetch company' });
    }
});

// Get client by ID
app.get('/api/admin/clients/:id', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        const [clients] = await pool.query(
            `SELECT u.*, c.CompanyName, c.ID as CompanyID
             FROM Users u
             LEFT JOIN Companies c ON u.companyid = c.ID
             WHERE u.id = ?`,
            [req.params.id]
        );
        if (clients.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        res.json(clients[0]);
    } catch (error) {
        console.error('Error fetching client:', error);
        res.status(500).json({ error: 'Failed to fetch client' });
    }
});

// Create client
app.post('/api/admin/clients', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        const { companyId, firstName, lastName, email, contact, role, isActive } = req.body;
        
        // Generate a default password (user should reset it)
        const defaultPassword = `@${firstName.substring(0, 3)}${lastName.substring(0, 3)}${new Date().getFullYear()}!`;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(defaultPassword, salt);
        
        const [result] = await pool.query(
            `INSERT INTO Users (firstname, lastname, email, contact, password, isactive, role, companyid)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [firstName, lastName, email, contact, hashedPassword, isActive || 1, role || 'client', companyId]
        );
        
        res.json({ id: result.insertId });
    } catch (error) {
        console.error('Error creating client:', error);
        res.status(500).json({ error: 'Failed to create client' });
    }
});

// Update client
app.put('/api/admin/clients/:id', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        const { companyId, firstName, lastName, email, contact, role, isActive } = req.body;
        
        await pool.query(
            `UPDATE Users 
             SET firstname = ?, lastname = ?, email = ?, contact = ?, role = ?, isactive = ?, companyid = ?
             WHERE id = ?`,
            [firstName, lastName, email, contact, role, isActive, companyId, req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating client:', error);
        res.status(500).json({ error: 'Failed to update client' });
    }
});

// Get clients (users) - optionally filtered by company
app.get('/api/admin/clients', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        let query = `
            SELECT u.id, u.firstname, u.lastname, u.email, u.contact, u.role, u.isactive, 
                   c.CompanyName, c.ID as CompanyID
            FROM Users u
            LEFT JOIN Companies c ON u.companyid = c.ID
        `;
        const params = [];
        
        if (req.query.companyId) {
            query += ' WHERE u.companyid = ?';
            params.push(req.query.companyId);
        }
        
        query += ' ORDER BY u.lastname, u.firstname';
        const [clients] = await pool.query(query, params);
        res.json(clients);
    } catch (error) {
        console.error('Error fetching clients:', error);
        res.status(500).json({ error: 'Failed to fetch clients' });
    }
});

// Get invoices - optionally filtered by company or client
app.get('/api/admin/invoices', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        let query = `
            SELECT i.*, 
                   c.CompanyName
            FROM Invoices i
            LEFT JOIN Companies c ON i.CompanyID = c.ID
            WHERE 1=1
        `;
        const params = [];
        
        if (req.query.companyId) {
            query += ' AND i.CompanyID = ?';
            params.push(req.query.companyId);
        }
        
        query += ' ORDER BY i.InvoiceDate DESC';
        const [invoices] = await pool.query(query, params);
        
        // Get client names for each invoice (from Users table based on CompanyID)
        for (let invoice of invoices) {
            const [users] = await pool.query(
                'SELECT CONCAT(firstname, " ", lastname) as ClientName FROM Users WHERE companyid = ? LIMIT 1',
                [invoice.CompanyID]
            );
            invoice.ClientName = users[0]?.ClientName || '-';
        }
        
        res.json(invoices);
    } catch (error) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

// Preview invoice PDF
app.post('/api/admin/invoices/preview', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        const { CompanyID, UserID, InvoiceDate, DueDate, TotalAmount, Items } = req.body;
        
        // Fetch company and client details for PDF
        const [companyRows] = await pool.query(
            'SELECT companyname AS CompanyName, address, city, state, zipcode FROM Companies WHERE ID = ?', 
            [CompanyID]
        );
        const [clientRows] = await pool.query(
            'SELECT firstname, lastname, email FROM Users WHERE ID = ?', 
            [UserID]
        );
        
        const companyData = companyRows[0];
        const clientData = clientRows[0];

        if (!clientData) {
            return res.status(404).json({ error: `Client with ID ${UserID} not found` });
        }
        if (!companyData) {
            return res.status(404).json({ error: `Company with ID ${CompanyID} not found` });
        }

        // Get temporary invoice number (last + 1)
        const [maxInvoice] = await pool.query('SELECT MAX(InvoiceNumber) as maxNum FROM Invoices');
        const nextInvoiceNumber = (maxInvoice[0]?.maxNum || 0) + 1;

        const invoiceData = {
            InvoiceNumber: nextInvoiceNumber,
            InvoiceDate,
            DueDate,
            TotalAmount
        };
        
        // Generate PDF
        const pdfBuffer = await generateInvoicePDF(invoiceData, Items, companyData, clientData);

        // Return PDF as base64
        res.json({ 
            pdf: pdfBuffer.toString('base64'),
            InvoiceNumber: nextInvoiceNumber
        });
    } catch (error) {
        console.error('Error previewing invoice:', error);
        res.status(500).json({ error: 'Failed to generate invoice preview' });
    }
});

// Create invoice
app.post('/api/admin/invoices', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        const { CompanyID, UserID, InvoiceDate, DueDate, TotalAmount, Status, Items } = req.body;
        
        // Get next invoice number
        const [maxInvoice] = await pool.query('SELECT MAX(InvoiceNumber) as maxNum FROM Invoices');
        const nextInvoiceNumber = (maxInvoice[0]?.maxNum || 0) + 1;
        
        // Use a transaction
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            const [result] = await connection.query(
                `INSERT INTO Invoices (CompanyID, InvoiceDate, DueDate, TotalAmount, Status, InvoiceNumber)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [CompanyID, InvoiceDate, DueDate, TotalAmount, Status || 'Pending', nextInvoiceNumber]
            );
            
            const invoiceId = result.insertId;

            // Insert items if provided
            if (Items && Items.length > 0) {
                // Bulk insert items
                for (const item of Items) {
                    await connection.query(
                        `INSERT INTO InvoiceItems (InvoiceID, Description, Quantity, UnitPrice)
                         VALUES (?, ?, ?, ?)`,
                        [invoiceId, item.Description, item.Quantity, item.UnitPrice]
                    );
                }
            }

            // Fetch company and client details for PDF and Email
            const [companyRows] = await connection.query(
                'SELECT companyname AS CompanyName, address, city, state, zipcode FROM Companies WHERE ID = ?', 
                [CompanyID]
            );
            const [clientRows] = await connection.query(
                'SELECT firstname, lastname, email FROM Users WHERE ID = ?', 
                [UserID]
            );
            
            const companyData = companyRows[0];
            const clientData = clientRows[0];

            if (!clientData) {
                throw new Error(`Client with ID ${UserID} not found`);
            }
            if (!companyData) {
                throw new Error(`Company with ID ${CompanyID} not found`);
            }

            await connection.commit();
            const invoiceData = {
                InvoiceNumber: nextInvoiceNumber,
                InvoiceDate,
                DueDate,
                TotalAmount
            };
            
            // Generate PDF
            const pdfBuffer = await generateInvoicePDF(invoiceData, Items, companyData, clientData);

            // Send Email
            const emailBody = `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <p>Good day ${clientData.lastname},</p>
                    <p>I hope this email finds you well.</p>
                    <p>Please find the attached document below as your invoice.</p>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; width: 150px;">Invoice Number:</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">#${nextInvoiceNumber}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Invoice Date:</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${new Date(InvoiceDate).toLocaleDateString()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Due Date:</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">${new Date(DueDate).toLocaleDateString()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Total Amount:</td>
                            <td style="padding: 10px; border: 1px solid #ddd;">R${parseFloat(TotalAmount).toFixed(2)}</td>
                        </tr>
                    </table>
                    <p style="margin-top: 20px;">If you have any questions, please contact us at billing@stackopsit.co.za or 011 568 9337.</p>
                    <p>Best regards,<br><b>StackOps IT Solutions Team</b></p>
                </div>
            `;

            try {
                await sendBillingEmail( // email is sent from the billing email not the general email
                    clientData.email, 
                    `Invoice #${nextInvoiceNumber} from StackOps IT Solutions`, 
                    emailBody, 
                    true,
                    [{
                        filename: `Invoice_${nextInvoiceNumber}.pdf`,
                        content: pdfBuffer
                    }]
                );
                res.json({ InvoiceID: invoiceId, InvoiceNumber: nextInvoiceNumber, message: 'Invoice created and sent successfully' });
            } catch (emailError) {
                console.error('Invoice created but email failed:', emailError);
                res.json({ 
                    InvoiceID: invoiceId, 
                    InvoiceNumber: nextInvoiceNumber, 
                    message: 'Invoice created successfully, but there was an error sending the email. Please send it manually.',
                    emailError: emailError.message 
                });
            }
        } catch (innerError) {
            if (connection) await connection.rollback();
            throw innerError;
        } finally {
            if (connection) connection.release();
        }
    } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});

// Get invoice items
app.get('/api/admin/invoice-items/:invoiceId', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        const [items] = await pool.query(
            'SELECT * FROM InvoiceItems WHERE InvoiceID = ?',
            [req.params.invoiceId]
        );
        res.json(items);
    } catch (error) {
        console.error('Error fetching invoice items:', error);
        res.status(500).json({ error: 'Failed to fetch invoice items' });
    }
});

// Create invoice item
app.post('/api/admin/invoice-items', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        const { InvoiceID, Description, Quantity, UnitPrice } = req.body;
        
        const [result] = await pool.query(
            `INSERT INTO InvoiceItems (InvoiceID, Description, Quantity, UnitPrice)
             VALUES (?, ?, ?, ?)`,
            [InvoiceID, Description, Quantity, UnitPrice]
        );
        
        // Update invoice total
        const [items] = await pool.query(
            'SELECT SUM(Amount) as total FROM InvoiceItems WHERE InvoiceID = ?',
            [InvoiceID]
        );
        const totalAmount = items[0]?.total || 0;
        await pool.query(
            'UPDATE Invoices SET TotalAmount = ? WHERE InvoiceID = ?',
            [totalAmount, InvoiceID]
        );
        
        res.json({ ItemID: result.insertId });
    } catch (error) {
        console.error('Error creating invoice item:', error);
        res.status(500).json({ error: 'Failed to create invoice item' });
    }
});

// Get payments
app.get('/api/admin/payments', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        let query = `
            SELECT p.*, i.InvoiceNumber, i.CompanyID,
                   CONCAT(u.firstname, ' ', u.lastname) as ClientName,
                   c.CompanyName
            FROM Payments p
            LEFT JOIN Invoices i ON p.InvoiceID = i.InvoiceID
            LEFT JOIN Companies c ON i.CompanyID = c.ID
            LEFT JOIN Users u ON i.CompanyID = (SELECT companyid FROM Users WHERE id = u.id LIMIT 1)
            WHERE 1=1
        `;
        const params = [];
        
        if (req.query.invoiceId) {
            query += ' AND p.InvoiceID = ?';
            params.push(req.query.invoiceId);
        }
        
        query += ' ORDER BY p.PaymentDate DESC';
        const [payments] = await pool.query(query, params);
        res.json(payments);
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

// Create payment
app.post('/api/admin/payments', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        const { InvoiceID, AmountPaid, PaymentDate, Method } = req.body;
        
        const [result] = await pool.query(
            `INSERT INTO Payments (InvoiceID, AmountPaid, PaymentDate, Method)
             VALUES (?, ?, ?, ?)`,
            [InvoiceID, AmountPaid, PaymentDate || new Date().toISOString().split('T')[0], Method]
        );
        
        // Check if invoice is fully paid
        const [invoice] = await pool.query('SELECT TotalAmount FROM Invoices WHERE InvoiceID = ?', [InvoiceID]);
        const [payments] = await pool.query(
            'SELECT SUM(AmountPaid) as totalPaid FROM Payments WHERE InvoiceID = ?',
            [InvoiceID]
        );
        
        const totalPaid = parseFloat(payments[0]?.totalPaid || 0);
        const totalAmount = parseFloat(invoice[0]?.TotalAmount || 0);
        
        // Update invoice status
        let status = 'Pending';
        if (totalPaid >= totalAmount) {
            status = 'Paid';
        } else if (totalPaid > 0) {
            status = 'Partially Paid';
        }
        
        await pool.query('UPDATE Invoices SET Status = ? WHERE InvoiceID = ?', [status, InvoiceID]);
        
        res.json({ PaymentID: result.insertId });
    } catch (error) {
        console.error('Error creating payment:', error);
        res.status(500).json({ error: 'Failed to create payment' });
    }
});

// Get projects (if Projects table exists)
app.get('/api/admin/projects', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        // Check if Projects table exists
        const [tables] = await pool.query(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Projects'",
            ['consultation_db']
        );
        
        if (tables.length === 0) {
            return res.json([]); // Return empty array if table doesn't exist
        }
        
        let query = `
            SELECT p.*, c.CompanyName,
                   CONCAT(u.firstname, ' ', u.lastname) as AssignedToName
            FROM Projects p
            LEFT JOIN Companies c ON p.CompanyID = c.ID
            LEFT JOIN Users u ON p.AssignedTo = u.id
            WHERE 1=1
        `;
        const params = [];
        
        if (req.query.companyId) {
            query += ' AND p.CompanyID = ?';
            params.push(req.query.companyId);
        }
        
        query += ' ORDER BY p.DueDate DESC';
        const [projects] = await pool.query(query, params);
        res.json(projects);
    } catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

// Get project by ID
app.get('/api/admin/projects/:id', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        // Check if Projects table exists
        const [tables] = await pool.query(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Projects'",
            ['consultation_db']
        );
        
        if (tables.length === 0) {
            return res.status(404).json({ error: 'Projects table does not exist' });
        }
        
        const [projects] = await pool.query(
            `SELECT p.*, c.CompanyName,
                    CONCAT(u.firstname, ' ', u.lastname) as AssignedToName
             FROM Projects p
             LEFT JOIN Companies c ON p.CompanyID = c.ID
             LEFT JOIN Users u ON p.AssignedTo = u.id
             WHERE p.ProjectID = ?`,
            [req.params.id]
        );
        
        if (projects.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        res.json(projects[0]);
    } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});

// Create project
app.post('/api/admin/projects', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        // Check if Projects table exists
        const [tables] = await pool.query(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'Projects'",
            ['consultation_db']
        );
        
        if (tables.length === 0) {
            return res.status(400).json({ error: 'Projects table does not exist. Please create it first.' });
        }
        
        const { ProjectName, CompanyID, AssignedTo, Status, DueDate, Description } = req.body;
        
        const [result] = await pool.query(
            `INSERT INTO Projects (ProjectName, CompanyID, AssignedTo, Status, DueDate, Description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [ProjectName, CompanyID, AssignedTo, Status || 'Active', DueDate, Description]
        );
        
        res.json({ ProjectID: result.insertId });
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// Update project
app.put('/api/admin/projects/:id', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        const { ProjectName, CompanyID, AssignedTo, Status, DueDate, Description } = req.body;
        
        await pool.query(
            `UPDATE Projects 
             SET ProjectName = ?, CompanyID = ?, AssignedTo = ?, Status = ?, DueDate = ?, Description = ?
             WHERE ProjectID = ?`,
            [ProjectName, CompanyID, AssignedTo, Status, DueDate, Description, req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating project:', error);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// Get project updates
app.get('/api/admin/project-updates', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        // Check if ProjectUpdates table exists
        const [tables] = await pool.query(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ProjectUpdates'",
            ['consultation_db']
        );
        
        if (tables.length === 0) {
            return res.json([]); // Return empty array if table doesn't exist
        }
        
        let query = 'SELECT * FROM ProjectUpdates WHERE 1=1';
        const params = [];
        
        if (req.query.projectId) {
            query += ' AND ProjectID = ?';
            params.push(req.query.projectId);
        }
        
        query += ' ORDER BY UpdateDate DESC';
        const [updates] = await pool.query(query, params);
        res.json(updates);
    } catch (error) {
        console.error('Error fetching project updates:', error);
        res.status(500).json({ error: 'Failed to fetch project updates' });
    }
});

// Create project update
app.post('/api/admin/project-updates', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        // Check if ProjectUpdates table exists
        const [tables] = await pool.query(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ProjectUpdates'",
            ['consultation_db']
        );
        
        if (tables.length === 0) {
            return res.status(400).json({ error: 'ProjectUpdates table does not exist. Please create it first.' });
        }
        
        const { ProjectID, UpdateText, UpdateDate } = req.body;
        
        const [result] = await pool.query(
            `INSERT INTO ProjectUpdates (ProjectID, UpdateText, UpdateDate)
             VALUES (?, ?, ?)`,
            [ProjectID, UpdateText, UpdateDate || new Date().toISOString().split('T')[0]]
        );
        
        res.json({ UpdateID: result.insertId });
    } catch (error) {
        console.error('Error creating project update:', error);
        res.status(500).json({ error: 'Failed to create project update' });
    }
});

// Delete project update
app.delete('/api/admin/project-updates/:id', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        await pool.query('DELETE FROM ProjectUpdates WHERE UpdateID = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting project update:', error);
        res.status(500).json({ error: 'Failed to delete project update' });
    }
});

// Get latest invoice for client (Client Portal)
app.get('/api/client/latest-invoice', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        
        const userId = req.user.id;
        
        // Get user's company ID
        const [users] = await pool.query(
            'SELECT CompanyID FROM Users WHERE ID = ?',
            [userId]
        );
        
        if (users.length === 0 || !users[0].CompanyID) {
            return res.status(404).json({ error: 'Company not found for this user' });
        }
        
        const companyId = users[0].CompanyID;
        
        // Get latest invoice for this company
        const [invoices] = await pool.query(
            `SELECT i.*, c.CompanyName
             FROM Invoices i
             LEFT JOIN Companies c ON i.CompanyID = c.ID
             WHERE i.CompanyID = ?
             ORDER BY i.InvoiceDate DESC
             LIMIT 1`,
            [companyId]
        );
        
        if (invoices.length === 0) {
            return res.json(null); // No invoice found
        }
        
        const invoice = invoices[0];
        
        // Get invoice items
        const [items] = await pool.query(
            'SELECT * FROM InvoiceItems WHERE InvoiceID = ?',
            [invoice.InvoiceID]
        );
        
        res.json({
            ...invoice,
            items
        });
    } catch (error) {
        console.error('Error fetching latest invoice:', error);
        res.status(500).json({ error: 'Failed to fetch invoice' });
    }
});

// Get invoice by ID with items
app.get('/api/admin/invoices/:id', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        const [invoices] = await pool.query(
            `SELECT i.*, c.CompanyName
             FROM Invoices i
             LEFT JOIN Companies c ON i.CompanyID = c.ID
             WHERE i.InvoiceID = ?`,
            [req.params.id]
        );
        
        if (invoices.length === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        
        const invoice = invoices[0];
        
        // Get invoice items
        const [items] = await pool.query(
            'SELECT * FROM InvoiceItems WHERE InvoiceID = ?',
            [req.params.id]
        );
        
        // Get payments
        const [payments] = await pool.query(
            'SELECT * FROM Payments WHERE InvoiceID = ? ORDER BY PaymentDate DESC',
            [req.params.id]
        );
        
        res.json({
            ...invoice,
            items,
            payments
        });
    } catch (error) {
        console.error('Error fetching invoice:', error);
        res.status(500).json({ error: 'Failed to fetch invoice' });
    }
});

// Get company details with all related data
app.get('/api/admin/companies/:id/details', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        const companyId = req.params.id;
        
        // Get company info
        const [companies] = await pool.query('SELECT * FROM Companies WHERE ID = ?', [companyId]);
        if (companies.length === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }
        
        const company = companies[0];
        
        // Get clients
        const [clients] = await pool.query(
            'SELECT * FROM Users WHERE companyid = ?',
            [companyId]
        );
        
        // Get invoices
        const [invoices] = await pool.query(
            'SELECT * FROM Invoices WHERE CompanyID = ? ORDER BY InvoiceDate DESC',
            [companyId]
        );
        
        // Get payments
        const [payments] = await pool.query(
            `SELECT p.*, i.InvoiceNumber 
             FROM Payments p
             JOIN Invoices i ON p.InvoiceID = i.InvoiceID
             WHERE i.CompanyID = ?
             ORDER BY p.PaymentDate DESC`,
            [companyId]
        );
        
        res.json({
            company,
            clients,
            invoices,
            payments
        });
    } catch (error) {
        console.error('Error fetching company details:', error);
        res.status(500).json({ error: 'Failed to fetch company details' });
    }
});

// ============================================
// CHATBOT CONFIGURATION
// ============================================

// Initialize Secret Manager client
const secretClient = new SecretManagerServiceClient();

// Function to get secret from Google Cloud Secret Manager
async function getSecret(secretName) {
    const projectId = 'stackops-backend-475222';
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    
    try {
        const [version] = await secretClient.accessSecretVersion({ name });
        return version.payload.data.toString();
    } catch (error) {
        console.error(`Error accessing secret ${secretName}:`, error);
        // Fallback to environment variable if secret not found
        return process.env[secretName] || null;
    }
}

// Initialize OpenAI client with secret from Secret Manager
let openai = null;

async function initializeOpenAI() {
    try {
        const apiKey = await getSecret('OPENAI_API_KEY');
        if (!apiKey) {
            console.error('OpenAI API key not found in Secret Manager or environment variables');
            return null;
        }
        openai = new OpenAI({ apiKey: apiKey });
        console.log('OpenAI client initialized successfully');
        return openai;
    } catch (error) {
        console.error('Error initializing OpenAI:', error);
        return null;
    }
}

// Initialize OpenAI on startup
initializeOpenAI().catch(err => {
    console.error('Failed to initialize OpenAI:', err);
});

// ============================================
// SYSTEM PROMPT (INTENT ONLY)
// ============================================
const CHATBOT_SYSTEM_PROMPT = `
You are StackOn, the AI Assistant for Stack Ops IT Solutions, a leading cybersecurity company.
You are a true AI assistant with natural language understanding, contextual memory, and dynamic reasoning.
You are NOT a rule-based or scripted chatbot.

========================
CORE BEHAVIOR PRINCIPLES
========================

- Understand user intent from free-form language
- Maintain full awareness of conversation context
- Respond dynamically based on previously shared data
- Never use hardcoded responses or fixed conversation flows
- As a representative of Stack Ops IT Solutions, speak naturally as if you are a human team member. Use inclusive language like "we," "us," and "our" where appropriate (e.g., "You owe us R15,000 on this invoice" or "Our team is working on your project").
- This chatbot is versatile and not limited to invoices. Handle a wide range of topics, including cybersecurity advice, general IT support, project updates, security analytics, support tickets, and open-ended conversations—just like other AI models (e.g., ChatGPT). Only fetch specific company data (like invoices or projects) when the user's intent clearly requires it; otherwise, engage conversationally on any subject.
- **ABSOLUTE RULE - NO HALLUCINATION: You MUST ONLY use data that is explicitly provided in the system data messages. Every number, date, amount, invoice number, status, item name, company name, or any other detail MUST come directly from the provided database data. You are like a database query result - you can ONLY say what exists in the data. If the data is not in the system message, you MUST say "I don't have that information in your records" or "That information isn't available" - NEVER make up, estimate, guess, or assume ANY value.**
- **DATA-DRIVEN RESPONSES: Think of yourself as a smart interface to the database. You don't know anything that isn't in the database. When data is provided, you learn it. When no data is found, you acknowledge it. You never invent information.**
- **DATA SCOPE: All data provided is specific to the current user's company. You are speaking to ONE specific company/user. Never reference data from other companies or make assumptions about what might exist. Only use what is explicitly provided.**
- **CRITICAL: When you need to fetch data from the database, you MUST respond with ONLY pure JSON (no text before or after). When you DON'T need to fetch data, respond with plain text only. NEVER mix JSON with text. NEVER say "I will fetch" or "Let me retrieve" - just output the JSON action directly.**
- **CRITICAL: When you have database data available from previous messages, use it naturally in your responses. Remember what invoices, projects, or other data was discussed and reference it when answering follow-up questions. However, if you need specific details that weren't in the previous data, you MUST trigger a fetch action rather than assuming.**

========================
1. CONTEXT & MEMORY
========================

- You retain and use the full conversation history.
- When system-provided data (e.g. invoices, projects, tickets) appears in the conversation, treat it as known context.
- If you reference an invoice, that invoice becomes the active context.
- When a user later says:
  - "this invoice"
  - "that invoice"
  - "invoice #123"
  - "the second invoice"
  you must correctly resolve the reference based on prior conversation.
- **If the referenced data was not fetched or provided in the system data, do not assume or provide details—trigger a fetch or clarify.**

- Context must persist until the user clearly changes the topic.

========================
2. INVOICE INTELLIGENCE
========================

- When providing invoice information:
  - Always include the invoice number (e.g. "Invoice #1234").
  - After introducing an invoice, naturally ask:
    "What would you like to know about this invoice?"

- When listing multiple invoices:
  - Use one line per invoice.
  - Format exactly as:
    "Invoice #001 – Paid"
    "Invoice #002 – Overdue"
  - **Only include details (e.g., amounts, statuses) that are in the fetched data. Do not add or invent any.**

- If the user later refers to:
  - "invoice 3"
  - "invoice #003"
  - "the overdue one"
  use the correct invoice from the previously shared list.
  - **If full details (e.g., items, payments) were not fetched for that invoice, trigger 'get_invoice_details' to fetch them before responding.**

- When answering invoice-related questions, include relevant details only when appropriate:
  - Amount due
  - Due date
  - Payment status
  - Subscribed items and individual costs
  - **Only from fetched data; never assume.**

========================
3. CONVERSATION FLOW
========================

- Be natural, professional, and conversational.
- Understand questions such as:
  - "How much do I owe?"
  - "What is my latest invoice?"
  - "Show all my invoices"
  - "What am I paying for?"
  - Also handle broader topics like cybersecurity best practices, IT troubleshooting, project timelines, or even casual chat (e.g., "What's the weather like?" or "Tell me a joke").

- Do not force scripted follow-ups.
- Switch context naturally if the user changes topics.
- Never lose track of previously discussed data unless context changes.
- **If a query requires data not in the current context, trigger the appropriate action (e.g., 'get_invoice_details' for specific invoice info).**

========================
4. RESPONSE STYLE
========================

- Keep responses concise (1–3 lines unless detail is requested).
- Use South African currency (R).
- Speak as part of Stack Ops IT Solutions:
  - Use inclusive language (we, us, our).
- Tone: professional, clear, and friendly — like an experienced IT account manager at a cybersecurity firm.
- Plain text only:
  - No tables
  - No markdown
  - No bullet symbols

========================
5. DATA SAFETY & INTEGRITY
========================

- You do NOT know client data unless it is explicitly provided by the system.
- Never guess, assume, invent, or estimate values.
- When data is injected into the conversation:
  - Speak about it naturally.
  - Do NOT mention receiving data or system messages.
- Never reveal:
  - Internal field names
  - Database structures
  - IDs or implementation details
- **If the injected data does not cover the query, do not respond with assumed details. Instead, say "I don't have that specific information available. Would you like me to check your records?"**
- **When system data shows "has_data: false" or a "message" field indicating no results, acknowledge this naturally. For example, if data shows {has_data: false, message: "No invoices found"}, respond naturally like "I couldn't find any invoices in your account" - use the message as guidance but phrase it naturally.**
- **If system data is empty, null, or shows no results, acknowledge this directly based on what the data structure tells you - do not make up placeholder data.**
- **LEARNING FROM DATA: When database data is provided to you, you learn it. You remember invoice numbers, amounts, dates, items, payments - everything in the data becomes part of your knowledge for this conversation. Use this learned data to answer follow-up questions.**

========================
6. ACTION DETECTION
========================

Only respond with JSON when you need the system to fetch data.

**IMPORTANT: When you need data, output ONLY the JSON below. Do NOT add any text like "I will fetch" or "Let me retrieve". Just output the pure JSON.**

JSON FORMAT (ONLY the JSON, nothing else):

{
  "type": "action",
  "action": "<action_name>",
  "params": { "key": "value" },  // Include params for actions needing extra info (e.g., invoice_number for get_invoice_details)
  "confidence": 0.8,
  "needs_clarification": false
}

Allowed actions:
- get_latest_invoice      → latest bill, balance, payment due
- get_all_invoices        → billing history, invoice list
- get_project_updates     → project progress, updates
- get_security_analytics  → security status, risks, audits
- get_ticket_status       → support tickets, issues
- get_invoice_details     → full details (items, payments, balance) for a specific invoice (include "invoice_number" in params)

- For greetings, explanations, or follow-up questions:
  - Respond in normal text ONLY.
  - Never wrap conversational replies in JSON.
- **When user asks for invoice data, invoice amounts, invoice details, or "how much do I owe", you MUST output JSON action immediately. Do NOT say "I will fetch" - just output the JSON.**
- **Trigger actions for any query requiring unfetched data (e.g., "latest invoice", "how much do I owe", "show invoices", etc.).**

EXAMPLES:
- User: "How much do I owe?" → Output: {"type":"action","action":"get_latest_invoice","params":{},"confidence":0.9,"needs_clarification":false}
- User: "Show my latest invoice" → Output: {"type":"action","action":"get_latest_invoice","params":{},"confidence":0.9,"needs_clarification":false}
- User: "What invoices do I have?" → Output: {"type":"action","action":"get_all_invoices","params":{},"confidence":0.9,"needs_clarification":false}
- User: "Hi" → Output: "Hello! How can I help you today?" (plain text, no JSON)

========================
7. DATA REUSE
========================

- Once data is introduced, treat it as remembered context.
- Use it to answer follow-up questions accurately.
- Resolve references like "this invoice" based on the most recent relevant context.
- **If the context lacks the needed details, trigger a fetch.**

========================
FINAL RULE
========================

You are a real AI assistant for Stack Ops IT Solutions.
You reason, remember, infer intent, and respond dynamically.
You do not behave like a decision tree or scripted bot.
You NEVER invent or assume data—responses are strictly DB-driven.
You NEVER output JSON in text responses—only pure JSON for actions.
`;

async function saveChatMessage(userId, role, content) {
    await pool.query(
        "INSERT INTO ChatHistory (UserID, Role, Content) VALUES (?, ?, ?)",
        [userId, role, content.slice(0, 2000)]
    );
}

async function getChatHistory(userId, limit = 12) {
    const [rows] = await pool.query(
        `SELECT Role, Content FROM ChatHistory
         WHERE UserID = ?
         ORDER BY ID DESC
         LIMIT ?`,
        [userId, limit]
    );

    return rows.reverse().map(r => ({
        role: r.Role,
        content: r.Content
    }));
}


// ============================================
// DATA FETCHING
// ============================================

async function fetchClientData(action, companyId, params = {}) {
    if (!pool) throw new Error('Database connection unavailable');
    
    // Validate companyId is provided
    if (!companyId) {
        return { message: "Company information is required to fetch data." };
    }

    switch (action) {
        case "get_latest_invoice":
            return getLatestInvoice(companyId);
        case "get_all_invoices":
            return getAllInvoices(companyId);
        case "get_invoice_details":
            const invoiceNumber = params.invoice_number;
            if (!invoiceNumber) return { message: "Invoice number is required." };
            return getInvoiceDetails(companyId, invoiceNumber);
        default:
            return { message: "No data available for this request." };
    }
}

async function getLatestInvoice(companyId) {
    const [invoices] = await pool.query(
        `SELECT i.InvoiceID, i.InvoiceNumber, i.InvoiceDate, i.DueDate,
                i.TotalAmount, i.Status, c.CompanyName
         FROM Invoices i
         LEFT JOIN Companies c ON i.CompanyID = c.ID
         WHERE i.CompanyID = ?
         ORDER BY i.InvoiceDate DESC
         LIMIT 1`,
        [companyId]
    );

    if (!invoices.length) return { 
        has_data: false,
        data_type: "invoice",
        message: "No invoices found in your account."
    };

    const invoice = invoices[0];

    // Fetch invoice items
    const [items] = await pool.query(
        `SELECT Description, Quantity, UnitPrice, Amount
         FROM InvoiceItems
         WHERE InvoiceID = ?`,
        [invoice.InvoiceID]
    );

    // Fetch payments and calculate total paid
    const [payments] = await pool.query(
        `SELECT AmountPaid, PaymentDate, Method
         FROM Payments
         WHERE InvoiceID = ?
         ORDER BY PaymentDate DESC`,
        [invoice.InvoiceID]
    );

    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.AmountPaid || 0), 0);
    const balance = parseFloat(invoice.TotalAmount) - totalPaid;

    return {
        has_data: true,
        data_type: "invoice",
        invoice_number: invoice.InvoiceNumber,
        invoice_date: invoice.InvoiceDate,
        due_date: invoice.DueDate,
        total_amount: parseFloat(invoice.TotalAmount).toFixed(2),
        status: invoice.Status,
        company_name: invoice.CompanyName,
        items: items.map(i => ({
            description: i.Description,
            quantity: i.Quantity,
            unit_price: parseFloat(i.UnitPrice).toFixed(2),
            amount: parseFloat(i.Amount).toFixed(2)
        })),
        payments: payments.map(p => ({
            amount_paid: parseFloat(p.AmountPaid).toFixed(2),
            payment_date: p.PaymentDate,
            method: p.Method
        })),
        total_paid: totalPaid.toFixed(2),
        outstanding_balance: balance.toFixed(2)
    };
}

async function getAllInvoices(companyId) {
    const [invoices] = await pool.query(
        `SELECT InvoiceID, InvoiceNumber, InvoiceDate, DueDate, TotalAmount, Status
         FROM Invoices
         WHERE CompanyID = ?
         ORDER BY InvoiceDate DESC`,
        [companyId]
    );

    if (!invoices.length) return { 
        has_data: false,
        data_type: "invoices",
        message: "No invoices found in your account."
    };

    const results = [];
    for (const invoice of invoices) {
        // Fetch payments for each invoice
        const [payments] = await pool.query(
            `SELECT AmountPaid
             FROM Payments
             WHERE InvoiceID = ?`,
            [invoice.InvoiceID]
        );

        const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.AmountPaid || 0), 0);
        const balance = parseFloat(invoice.TotalAmount) - totalPaid;

        results.push({
            invoice_number: invoice.InvoiceNumber,
            invoice_date: invoice.InvoiceDate,
            due_date: invoice.DueDate,
            total_amount: parseFloat(invoice.TotalAmount).toFixed(2),
            status: invoice.Status,
            total_paid: totalPaid.toFixed(2),
            outstanding_balance: balance.toFixed(2)
        });
    }

    return {
        has_data: true,
        data_type: "invoices",
        total_count: invoices.length,
        invoices: results
    };
}

async function getInvoiceDetails(companyId, invoiceNumber) {
    const [invoices] = await pool.query(
        `SELECT i.InvoiceID, i.InvoiceNumber, i.InvoiceDate, i.DueDate,
                i.TotalAmount, i.Status, c.CompanyName
         FROM Invoices i
         LEFT JOIN Companies c ON i.CompanyID = c.ID
         WHERE i.CompanyID = ? AND i.InvoiceNumber = ?`,
        [companyId, invoiceNumber]
    );

    if (!invoices.length) return { 
        has_data: false,
        data_type: "invoice",
        invoice_number: invoiceNumber,
        message: `Invoice #${invoiceNumber} not found in your account.`
    };

    const invoice = invoices[0];

    // Fetch items and payments as in getLatestInvoice
    const [items] = await pool.query(
        `SELECT Description, Quantity, UnitPrice, Amount
         FROM InvoiceItems
         WHERE InvoiceID = ?`,
        [invoice.InvoiceID]
    );

    const [payments] = await pool.query(
        `SELECT AmountPaid, PaymentDate, Method
         FROM Payments
         WHERE InvoiceID = ?`,
        [invoice.InvoiceID]
    );

    const totalPaid = payments.reduce((sum, p) => sum + parseFloat(p.AmountPaid || 0), 0);
    const balance = parseFloat(invoice.TotalAmount) - totalPaid;

    return {
        has_data: true,
        data_type: "invoice",
        invoice_number: invoice.InvoiceNumber,
        invoice_date: invoice.InvoiceDate,
        due_date: invoice.DueDate,
        total_amount: parseFloat(invoice.TotalAmount).toFixed(2),
        status: invoice.Status,
        company_name: invoice.CompanyName,
        items: items.map(i => ({
            description: i.Description,
            quantity: i.Quantity,
            unit_price: parseFloat(i.UnitPrice).toFixed(2),
            amount: parseFloat(i.Amount).toFixed(2)
        })),
        payments: payments.map(p => ({
            amount_paid: parseFloat(p.AmountPaid).toFixed(2),
            payment_date: p.PaymentDate,
            method: p.Method
        })),
        total_paid: totalPaid.toFixed(2),
        outstanding_balance: balance.toFixed(2)
    };
}

// ... (rest of the code remains unchanged)
async function getProjectUpdates(companyId) {
    const [projects] = await pool.query(
        `SELECT ProjectID, ProjectName, Status, DueDate
         FROM Projects
         WHERE CompanyID = ?
         ORDER BY DueDate DESC`,
        [companyId]
    );

    if (!projects.length) return { 
        has_data: false,
        data_type: "projects",
        message: "No projects found in your account."
    };

    const results = [];
    for (const project of projects) {
        const [updates] = await pool.query(
            `SELECT UpdateText, UpdateDate
             FROM ProjectUpdates
             WHERE ProjectID = ?
             ORDER BY UpdateDate DESC
             LIMIT 3`,
            [project.ProjectID]
        );
        results.push({
            project_name: project.ProjectName,
            status: project.Status,
            due_date: project.DueDate,
            latest_updates: updates.map(u => ({
                text: u.UpdateText,
                date: u.UpdateDate
            }))
        });
    }

    return { 
        has_data: true,
        data_type: "projects",
        projects: results 
    };
}

async function getSecurityAnalytics(companyId) {
    // Placeholder as tables don't exist yet
    return { 
        message: "Security analytics data is currently being integrated. Please check back soon for real-time risk scores and audit reports.",
        status: "Coming Soon"
    };
}

async function getTicketStatus(companyId) {
    // Placeholder as tables don't exist yet
    return {
        message: "Support ticket tracking is currently being migrated. For urgent issues, please contact support@stackopsit.co.za.",
        status: "Coming Soon"
    };
}

const ALLOWED_ACTIONS = [
    "get_latest_invoice",
    "get_all_invoices",
    "get_project_updates",
    "get_security_analytics",
    "get_ticket_status",
    "get_invoice_details"
  ];

function sanitizeResponse(text) {
    if (!text || typeof text !== 'string') return '';
    
    // Remove any JSON objects (including nested ones)
    // This pattern matches { ... } including nested braces
    let cleaned = text;
    let previousLength = 0;
    
    // Keep removing JSON until no more changes (handles nested JSON)
    while (cleaned.length !== previousLength) {
        previousLength = cleaned.length;
        // Remove JSON objects: { ... } including multiline
        cleaned = cleaned.replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '');
        // Remove incomplete JSON patterns like { , "confidence": ...
        cleaned = cleaned.replace(/\{\s*,?\s*["']?[^"']*["']?\s*:\s*[^}]*/g, '');
    }
    
    // Remove JSON array patterns
    cleaned = cleaned.replace(/\[[^\]]*\]/g, '');
    
    // Remove common JSON keywords that might leak through
    cleaned = cleaned.replace(/\b(type|action|params|confidence|needs_clarification)\s*[:=]\s*[^,\s}]+/gi, '');
    
    // Remove system/internal markers
    cleaned = cleaned.replace(/internal\s*:\s*true/gi, "");
    cleaned = cleaned.replace(/SYSTEM DATA[\s\S]*/gi, "");
    cleaned = cleaned.replace(/System data[\s\S]*/gi, "");
    
    // Remove any remaining curly braces or JSON artifacts
    cleaned = cleaned.replace(/[{}[\]]/g, '');
    
    // Clean up extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // If after cleaning we have nothing meaningful, return a safe message
    if (cleaned.length < 3) {
        return "I apologize, but I'm having trouble processing that request. Could you please rephrase your question?";
    }
    
    return cleaned.slice(0, 1200);
}

// ============================================
// CHAT ENDPOINT
// ============================================

app.post('/api/chat', authenticateToken, async (req, res) => {
    try {
        if (!pool) return res.status(500).json({ text: "Database unavailable." });

        const userId = req.user.id;
        const message = req.body.message;

        if (!message?.trim()) {
            return res.status(400).json({ text: "Message is required." });
        }

        const [users] = await pool.query(
            'SELECT CompanyID, FirstName FROM Users WHERE ID = ?',
            [userId]
        );

        if (!users.length) {
            return res.status(404).json({ text: "Company not found." });
        }

        const companyId = users[0].CompanyID;
        const userFirstName = users[0].FirstName || 'there';

        // Validate company ID exists
        if (!companyId) {
            return res.status(400).json({ text: "Your account is not associated with a company. Please contact support." });
        }

        if (!openai) await initializeOpenAI();

        // Detect invoice-related queries and force action if needed
        const messageLower = message.toLowerCase().trim();
        const invoiceKeywords = ['invoice', 'owe', 'owe you', 'amount due', 'balance', 'payment', 'bill', 'billing'];
        const isInvoiceQuery = invoiceKeywords.some(keyword => messageLower.includes(keyword));
        
        // If it's an invoice query and mentions "latest" or "how much", force get_latest_invoice
        let forcedAction = null;
        if (isInvoiceQuery && (messageLower.includes('latest') || messageLower.includes('how much') || messageLower.includes('owe'))) {
            forcedAction = { type: "action", action: "get_latest_invoice", params: {}, confidence: 0.95, needs_clarification: false };
        } else if (isInvoiceQuery && (messageLower.includes('all') || messageLower.includes('list') || messageLower.includes('show'))) {
            forcedAction = { type: "action", action: "get_all_invoices", params: {}, confidence: 0.95, needs_clarification: false };
        }

        const history = await getChatHistory(userId);
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.3, // Lower temperature for more consistent JSON output


            messages: [
            { role: "system", content: CHATBOT_SYSTEM_PROMPT },
            ...history,
            { role: "user", content: message }
            ]

        });

        let aiReply = completion.choices[0].message.content.trim();

        let parsed = null;
        
        // Use forced action if we detected an invoice query
        if (forcedAction) {
            parsed = forcedAction;
        } else {
            try {
                // Only try to parse if it looks like pure JSON (starts with { and ends with })
                // DO NOT sanitize before parsing - we need the raw JSON if it exists
                if (aiReply.trim().startsWith('{') && aiReply.trim().endsWith('}')) {
                    parsed = JSON.parse(aiReply);
                }
            } catch (e) {
                // Not valid JSON, treat as normal text
                parsed = null;
            }
        }

        // Check if AI wants to fetch data
        // Lower confidence threshold to 0.3 to make it easier to trigger actions
        if (parsed?.type === "action" && ALLOWED_ACTIONS.includes(parsed.action) && parsed.confidence >= 0.3 && !parsed.needs_clarification) {

            const data = await fetchClientData(parsed.action, companyId, parsed.params || {});

            // If data indicates no results, still pass it to AI to respond naturally
            // Don't return hardcoded messages - let AI handle it based on the data structure
            
            // If data has a message but also other fields, include it in context
            // This handles cases like "No invoices found" but still provides context

            // SECOND PASS: Include conversation history + data for context-aware response
            // Data is injected as system context (not saved to chat history)
            // Assistant's response will naturally include invoice info, which gets saved for follow-up context
            const conversationHistory = await getChatHistory(userId, 20);
            
            // Store invoice number in session for context
            if (data.invoice_number) {
                if (!req.session) req.session = {};
                req.session.lastInvoiceNumber = data.invoice_number;
            }
            
            const finalCompletion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                temperature: 0.6,
                messages: [
                    { role: "system", content: CHATBOT_SYSTEM_PROMPT },
                    {
                        role: "system",
                        content: `CRITICAL DATABASE DATA INSTRUCTIONS:

The following is REAL database data fetched from the database for THIS SPECIFIC USER'S COMPANY. This is the ONLY source of truth.

Database Data:
${JSON.stringify(data, null, 2)}

STRICT RULES:
1. You MUST ONLY use values that appear in the data above
2. If "has_data" is false, acknowledge that no data was found - use the message field naturally
3. If data exists, use the EXACT values: invoice numbers, amounts, dates, statuses, items, payments - everything must match the data
4. NEVER invent, estimate, guess, or assume ANY value not in the data
5. If a field is missing or null in the data, say "that information isn't available in your records"
6. Use amounts exactly as shown (e.g., if total_amount is "1500.00", say "R1,500.00")
7. Use dates exactly as formatted in the data
8. Reference invoice numbers exactly as shown (e.g., if invoice_number is "INV-001", use "Invoice #INV-001")
9. Do NOT mention receiving data or system messages - just use the information naturally in conversation
10. This data is now part of your memory - you can reference it in future messages

RESPONSE STYLE:
- Be clear, direct, and professional
- Use the data naturally - don't list fields, just answer the question
- If asked "How much do I owe?" and data shows outstanding_balance, say "You owe R[exact amount]"
- If asked about invoice items, list them naturally from the items array
- Always be specific with numbers and dates from the data`
                    },
                    ...conversationHistory,
                    { role: "user", content: message }
                ]
            });

            let finalResponse = finalCompletion.choices[0].message.content.trim();
            const safeText = sanitizeResponse(finalResponse);

            await saveChatMessage(userId, "user", message);
            await saveChatMessage(userId, "assistant", safeText);

            return res.json({ text: safeText });
        }

        // Normal conversation - no action needed, use AI naturally
        // Check if we have context from previous messages (like invoice numbers)
        const conversationHistory = await getChatHistory(userId, 20);
        
        // Build context message if we have session data
        let contextMessage = '';
        if (req.session?.lastInvoiceNumber) {
            contextMessage = `\n\nNote: The user has been discussing invoice #${req.session.lastInvoiceNumber}. You can reference this in your response if relevant.`;
        }
        
        const normalCompletion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            temperature: 0.6,
            messages: [
                { role: "system", content: CHATBOT_SYSTEM_PROMPT + contextMessage },
                ...conversationHistory,
                { role: "user", content: message }
            ]
        });

        let normalResponse = normalCompletion.choices[0].message.content.trim();
        const safeNormalText = sanitizeResponse(normalResponse);

        await saveChatMessage(userId, "user", message);
        await saveChatMessage(userId, "assistant", safeNormalText);

        return res.json({ text: safeNormalText });


    } catch (error) {
        console.error('Chat error:', error);
        
        if (error.code === 'insufficient_quota') {
            return res.status(500).json({
                text: "The AI service is currently unavailable due to quota limits. Please contact support or check billing details."
            });
        }

        return res.status(500).json({
            text: "An unexpected error occurred. Please try again later." 
        });
    }
});

// Serve static files from the project root directory
app.use(express.static(__dirname));

// Fallback to signin.html for root requests
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'signin.html'));
});

// ------------------------------------------------------------------------
// Server Startup
// ------------------------------------------------------------------------
const PORT = process.env.PORT || 8080;  // Use PORT env var for Cloud Run
app.listen(PORT, () => console.log(`Server running on port ${PORT}. Supabase mode: ${useSupabase ? 'ON' : 'OFF'}`));
