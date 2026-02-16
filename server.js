const bcrypt = require('bcryptjs');
const express = require('express');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const OpenAI = require('openai');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const { Webhook } = require('svix');
const SVGtoPDF = require('svg-to-pdfkit');

// invoice payment endpoints 
require("dotenv").config();


const app = express();
// FIND THIS AT THE TOP OF YOUR server.js AND REPLACE IT:
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString(); // This saves the exact raw string for signature check
    }
}));
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Rate limiting for chatbot - simple in-memory store (consider Redis for production)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute per user

// Rate limiting middleware for chatbot
function chatRateLimit(req, res, next) {
    const userId = req.user?.id;
    if (!userId) return next();
    
    const now = Date.now();
    const userKey = `chat_${userId}`;
    const userRequests = rateLimitStore.get(userKey) || [];
    
    // Remove requests outside the time window
    const recentRequests = userRequests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
    
    if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
        return res.status(429).json({ 
            text: "Rate limit exceeded. Please wait a moment before sending another message.",
            buttons: null
        });
    }
    
    recentRequests.push(now);
    rateLimitStore.set(userKey, recentRequests);
    next();
}

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

/**
 * Generate PayFast signature
 * @param {Object} data - The data to sign
 * @param {string} passphrase - PayFast passphrase
 * @returns {string} - MD5 signature
 */

function generatePayFastSignature(data, passphrase = null) {
    let pfOutput = "";
    for (let key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key) && key !== "signature") {
            const value = data[key];
            if (value !== "" && value !== null && value !== undefined) {
                pfOutput += `${key}=${encodeURIComponent(String(value).trim()).replace(/%20/g, "+")}&`;
            }
        }
    }

    let getString = pfOutput.slice(0, -1);
    if (passphrase && passphrase.trim() !== "") {
        getString += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`;
    }

    return crypto.createHash("md5").update(getString).digest("hex");
}

/**
 * Generate PayFast payment link
 */


async function generatePayFastLink(paymentData) {
    try {
        const merchantId = await getSecret('PAYFAST_MERCHANT_ID');
        const merchantKey = await getSecret('PAYFAST_MERCHANT_KEY');
        const passphrase = await getSecret('PAYFAST_PASSPHRASE');
        const mode = await getSecret('PAYFAST_MODE') || 'live';
        
        const baseUrl = mode === 'sandbox' 
            ? 'https://sandbox.payfast.co.za/eng/process' 
            : 'https://www.payfast.co.za/eng/process';

        // Order of properties is important for consistency with signature loop
        const data = {
            merchant_id: merchantId,
            merchant_key: merchantKey,
            return_url: 'https://stackopsit.co.za/success',
            cancel_url: 'https://stackopsit.co.za/cancel',
            notify_url: 'https://stackops-backend-475222.uc.r.appspot.com/api/payfast/itn',
            name_first: paymentData.name_first,
            name_last: paymentData.name_last,
            email_address: paymentData.email_address,
            m_payment_id: paymentData.m_payment_id,
            amount: parseFloat(paymentData.amount).toFixed(2),
            item_name: paymentData.item_name,
            item_description: paymentData.item_description,
            custom_int1: paymentData.custom_int1,
            custom_str1: paymentData.custom_str1
        };

        const signature = generatePayFastSignature(data, passphrase);
        data.signature = signature;

        const queryString = Object.keys(data)
            .filter(key => data[key] !== "" && data[key] !== null && data[key] !== undefined)
            .map(key => `${key}=${encodeURIComponent(String(data[key]).trim()).replace(/%20/g, "+")}`)
            .join('&');

        return `${baseUrl}?${queryString}`;
    } catch (error) {
        console.error('Error generating PayFast link:', error);
        return null;
    }
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

// function to generate invoice PDF - REDESIGNED to match professional layout
async function generateInvoicePDF(invoiceData, items, companyData, clientData) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            let buffers = [];
            
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                let pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });
            
            doc.on('error', (err) => {
                reject(err);
            });

            const formatDate = (dateStr) => {
                const date = new Date(dateStr);
                return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString('en-ZA');
            };

            // ==================== HEADER SECTION ====================
            
            // Right side: Logo with black background (Narrow and Tall)
            const logoBoxWidth = 95;
            const logoBoxHeight = 100; // Decreased height
            const logoBoxX = 480; // Pushed more to the left
            
            doc.rect(logoBoxX, 0, logoBoxWidth, logoBoxHeight).fill('#000000');
            
            // StackOps logo in the black box
            const logoPath = path.join(__dirname, 'Images', 'Logos', 'RemovedStackOps.png');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, logoBoxX + 3, 30, { width: 80 });
            }

            // INVOICE title and Horizontal Line
            doc.fontSize(22).fillColor('#4a4a4a').font('Helvetica');
            const invoiceText = 'INVOICE';
            const invoiceWidth = doc.widthOfString(invoiceText);
            const invoiceX = logoBoxX - invoiceWidth - 70;
            const invoiceY = 30;
            
            doc.text(invoiceText, invoiceX, invoiceY + 10);
            
            // Horizontal line from beginning of page (full width: 0) to INVOICE - HEADER ZONE FULL WIDTH
            doc.moveTo(0, invoiceY + 18).lineTo(invoiceX - 10, invoiceY + 18).stroke('#333333');

            // Left side: Company info - starting straight from the beginning of the page (MARGIN 0)
            const startX = 0;
            doc.fontSize(10).fillColor('#333333').font('Helvetica');
            doc.text('Stackops IT Solutions Pty(Ltd)', startX, 75);
            doc.fontSize(9).text('Reg No: 2016/120370/07', startX, 90);
            doc.text('Mia Drive, Waterfall City', startX, 102);
            doc.text('Johannesburg, 1685', startX, 114);
            
            // QR Code to the right of company details
            const qrCodePath = path.join(__dirname, 'Images', 'QRCode.jpeg');
            if (fs.existsSync(qrCodePath)) {
                doc.image(qrCodePath, 170, 75, { width: 55, height: 55 });
            }
            
            // Horizontal line separator (only extends to 250 from left edge)
            doc.moveTo(startX, 135).lineTo(250, 135).stroke('#cccccc');
            
            // Contact details below company info
            doc.fontSize(8).fillColor('#666666');
            doc.text('Tel: 011 568 9337', startX + 110, 145);
            doc.text('Email: billing@stackopsit.co.za', startX + 110, 157);
            doc.text('Web: www.stackopsit.co.za', startX + 110, 169);
            
            // Horizontal line separator
            doc.moveTo(startX, 185).lineTo(250, 185).stroke('#cccccc');

            // ==================== BILL TO SECTION ====================
            
            doc.fontSize(8).fillColor('#333333').font('Helvetica-Bold');
            doc.text('Bill to', startX, 195);
            
            doc.fontSize(8).fillColor('#666666');
            doc.text(companyData.CompanyName, startX + 110, 195);
            doc.text(`${clientData.firstname} ${clientData.lastname}`, startX + 110, 210);
            doc.text(clientData.email || '', startX + 110, 225);

            // Horizontal line under Bill to section
            doc.moveTo(startX, 240).lineTo(250, 240).stroke('#cccccc');

            // Invoice details
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text('Invoice Ref:', startX, 250);
            doc.font('Helvetica').text(`#${invoiceData.InvoiceNumber || 'N/A'}`, startX + 70, 250);
            
            doc.font('Helvetica-Bold').text('Date:', startX, 265);
            doc.font('Helvetica').text(formatDate(invoiceData.InvoiceDate), startX + 70, 265);
            // Horizontal line separator before table (MAIN CONTENT STARTS HERE - MARGIN 20-575)
            doc.moveTo(20, 300).lineTo(575, 300).stroke('#cccccc');

            // ==================== INVOICE ITEMS TABLE ====================
            
            const tableTop = 340;
            const colWidths = {
                category: 100,
                deliverables: 160,
                frequency: 85,
                rate: 85,
                total: 85
            };
            
            const col1 = 20;
            const col2 = col1 + colWidths.category;
            const col3 = col2 + colWidths.deliverables;
            const col4 = col3 + colWidths.frequency;
            const col5 = col4 + colWidths.rate;

            // Table header
            const tableLeftEdge = 20;
            const tableRightEdge = 575;
            const headerHeight = 25;
            
            // Border lines - top and bottom
            doc.moveTo(tableLeftEdge, tableTop).lineTo(tableRightEdge, tableTop).stroke('#cccccc');
            doc.moveTo(tableLeftEdge, tableTop + headerHeight).lineTo(tableRightEdge, tableTop + headerHeight).stroke('#cccccc');
            
            // Left and right vertical lines
            doc.moveTo(tableLeftEdge, tableTop).lineTo(tableLeftEdge, tableTop + headerHeight).stroke('#cccccc');
            doc.moveTo(tableRightEdge, tableTop).lineTo(tableRightEdge, tableTop + headerHeight).stroke('#cccccc');
            
            // Vertical lines between columns
            doc.moveTo(col2, tableTop).lineTo(col2, tableTop + headerHeight).stroke('#cccccc');
            doc.moveTo(col3, tableTop).lineTo(col3, tableTop + headerHeight).stroke('#cccccc');
            doc.moveTo(col4, tableTop).lineTo(col4, tableTop + headerHeight).stroke('#cccccc');
            doc.moveTo(col5, tableTop).lineTo(col5, tableTop + headerHeight).stroke('#cccccc');
            
            doc.fontSize(8).fillColor('#000000').font('Helvetica-Bold');
            doc.text('SERVICE CATEGORY', col1 + 5, tableTop + 8);
            doc.text('DELIVERABLES', col2 + 5, tableTop + 8);
            doc.text('FREQUENCY', col3 + 5, tableTop + 8);
            doc.text('RATE', col4 + 5, tableTop + 8);
            doc.text('TOTAL', col5 + 5, tableTop + 8);

            // Table rows
            doc.font('Helvetica');
            let currentY = tableTop + headerHeight;
            const rowHeight = 25;

            items.forEach((item, index) => {
                const y = currentY + (index * rowHeight);
                
                doc.fontSize(8).fillColor('#333333');
                
                // Service Category
                doc.text((item.ServiceCategory || item.Description || ''), col1 + 5, y + 8, { 
                    width: colWidths.category - 10,
                    align: 'left'
                });
                
                // Deliverables
                doc.text((item.Deliverables || ''), col2 + 5, y + 8, { 
                    width: colWidths.deliverables - 10,
                    align: 'left'
                });
                
                // Frequency
                doc.text((item.Frequency || 'Once-off'), col3 + 5, y + 8, { 
                    width: colWidths.frequency - 10,
                    align: 'left'
                });
                
                // Rate
                doc.text((item.Rate || ''), col4 + 5, y + 8, { 
                    width: colWidths.rate - 10,
                    align: 'left'
                });
                
                // Total
                doc.text(`R${parseFloat(item.Total || item.UnitPrice || 0).toFixed(2)}`, col5 + 5, y + 8, { 
                    width: colWidths.total - 10,
                    align: 'left'
                });
                
                // Horizontal line for this cell/row
                doc.moveTo(tableLeftEdge, y + rowHeight).lineTo(tableRightEdge, y + rowHeight).stroke('#cccccc');

                // Vertical lines for each row to ensure they are continuous
                doc.moveTo(tableLeftEdge, y).lineTo(tableLeftEdge, y + rowHeight).stroke('#cccccc');
                doc.moveTo(col2, y).lineTo(col2, y + rowHeight).stroke('#cccccc');
                doc.moveTo(col3, y).lineTo(col3, y + rowHeight).stroke('#cccccc');
                doc.moveTo(col4, y).lineTo(col4, y + rowHeight).stroke('#cccccc');
                doc.moveTo(col5, y).lineTo(col5, y + rowHeight).stroke('#cccccc');
                doc.moveTo(tableRightEdge, y).lineTo(tableRightEdge, y + rowHeight).stroke('#cccccc');
            });

            const itemsEndY = currentY + (items.length * rowHeight);

            // Bottom border of table - perfectly aligned with vertical lines
            doc.moveTo(tableLeftEdge, itemsEndY).lineTo(tableRightEdge, itemsEndY).stroke('#cccccc');
            doc.moveTo(tableLeftEdge, itemsEndY).lineTo(tableLeftEdge, itemsEndY).stroke('#cccccc');
            doc.moveTo(tableRightEdge, itemsEndY).lineTo(tableRightEdge, itemsEndY).stroke('#cccccc');

            // ==================== BANKING DETAILS & TOTALS (Combined Section) ====================
            
            // Horizontal line separator before table (MAIN CONTENT STARTS HERE - MARGIN 20-575)
            //doc.moveTo(20, 300).lineTo(575, 300).stroke('#cccccc');

            const bankingY = itemsEndY + 20;
            const contentX = 20;
            
            // Banking details (left side)
            doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000');
            doc.text('BANKING DETAILS', contentX, bankingY);
            
            doc.fontSize(8).font('Helvetica').fillColor('#333333');
            doc.text('Bank: Standard Bank Business', contentX, bankingY + 16);
            doc.text('Account Name: StackOps IT Solutions', contentX, bankingY + 28);
            doc.text('Acc Number: 10255699752', contentX, bankingY + 40);
            doc.text('Branch Code: 050205', contentX, bankingY + 52);
            doc.text('Acc Type: Current', contentX, bankingY + 64);

            // Totals (right side, aligned with banking details)
            doc.fontSize(9).font('Helvetica').fillColor('#000000');
            const totalsRightX = 380;
            doc.text('SUB TOTAL:', totalsRightX, bankingY, { align: 'left', width: 80 });
            doc.text(`R${parseFloat(invoiceData.TotalAmount).toFixed(2)}`, totalsRightX + 85, bankingY, { align: 'left' });

            doc.text('VAT TAX:', totalsRightX, bankingY + 16, { align: 'left', width: 80 });
            doc.text('N/A', totalsRightX + 85, bankingY + 16, { align: 'left' });

            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('TOTAL:', totalsRightX, bankingY + 32, { align: 'left', width: 80 });
            doc.text(`R${parseFloat(invoiceData.TotalAmount).toFixed(2)}`, totalsRightX + 85, bankingY + 32, { align: 'left' });

            // ==================== TERMS & CONDITIONS ====================
            
            const termsY = bankingY + 110;
            const mainContentLeft = 20;
            const mainContentRight = 575;
            const mainContentWidth = mainContentRight - mainContentLeft;
            
            doc.moveTo(mainContentLeft, termsY - 30).lineTo(mainContentRight, termsY - 30).stroke('#cccccc');
            doc.moveTo(mainContentLeft, termsY - 120).lineTo(mainContentRight, termsY - 120).stroke('#cccccc');
            
            // Container size
            const boxWidth = 60;
            const boxHeight = 20;

            const boxX = 7;
            const boxY = termsY - 28;

            const svg = fs.readFileSync('Images/yoco.svg', 'utf8');

            SVGtoPDF(doc, svg, boxX + 6, boxY + 6, {
            width: boxWidth - 12,
            height: boxHeight - 12,
            preserveAspectRatio: 'xMidYMid meet'
            });

            const payfastPath = path.join(__dirname, 'Images', 'Payfast.jpg');
            if (fs.existsSync(payfastPath)) {
                doc.image(payfastPath, boxX + boxWidth + 2, boxY + 3, { 
                    width: boxWidth - 10, 
                    height: boxHeight - 5,
                    align: 'center',
                    valign: 'center'
                });
            }

            doc.moveTo(mainContentLeft, termsY - 5).lineTo(mainContentRight, termsY - 5).stroke('#cccccc');
            doc.moveTo(mainContentLeft, termsY + 180).lineTo(mainContentRight, termsY + 180).stroke('#cccccc');

    

            doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000');
            doc.text('TERMS & CONDITIONS', mainContentLeft, termsY);
            
            doc.fontSize(9).font('Helvetica').fillColor('#555555');
            
            // Build terms as one continuous flowing paragraph
            const termsTextStart = termsY + 16;
            const termsFont = 'Helvetica';
            const termsBold = 'Helvetica-Bold';
            const options = { width: mainContentWidth, align: 'justify', lineGap: 1, continued: true };

            doc.font(termsFont).text('All quotations are valid for 10 days from date of issue and subject to stock availability. Prices may change without prior notice. Ownership of goods remains with StackOps IT Solutions until payment is received in full. ', mainContentLeft, termsTextStart, options)
            .font(termsBold).text('Payment Terms: ', options)
            .font(termsFont).text('All quotations are based on cash payment into our bank account prior to processing any orders. No goods or services will be released until full cleared payment is received. (This is subject to specific projects). ', options)
            .font(termsBold).text('Proof of payment ', options)
            .font(termsFont).text('must be sent to ', options)
            .font(termsBold).text('sales@stackopsit.co.za ', options)
            .font(termsFont).text('to avoid delays. Orders will only be processed once full cleared payment reflects in StackOps IT Solutions Bank account. ', options)
            .font(termsBold).text('Confidentiality: ', options)
            .font(termsFont).text('This quotation is intended solely for the recipient and may not be shared with third parties without written consent from StackOps IT Solutions. SLA & Service Commitment: All services and deliveries are subject to StackOps Service Level Commitments unless otherwise agreed in writing. ', options)
            .font(termsBold).text('Support: ', options)
            .font(termsFont).text('Manufacturer warranties apply unless otherwise stated. We remain available for clarification or support regarding this quotation. ', options)
            .font(termsBold).text('Data Protection: ', options)
            .font(termsFont).text('All Client information is handled in strict compliance with the Protection of Personal Information Act(POPIA). Non-Liability for Delays: StackOps IT Solutions cannot be held liable for delays caused by suppliers, manufacturers, or circumstances beyond our control. Professional Procurement: StackOps IT Solutions (Pty) Ltd is a registered South African entity, fully compliant with CIPC, SARS, and applicable procurement regulations. ', options)
            .font(termsBold).text('Pricing: ', options)
            // Set continued to false for the final segment
            .font(termsFont).text('Prices quoted are exclusive of VAT (unless otherwise stated). Delivery, installation, and additional services are quoted separately where applicable. Acceptance: By accepting this quotation, the client acknowledges and agrees to the above terms and conditions.', { ...options, continued: false });
                        // ==================== FOOTER ====================
            
            // ==================== FOOTER ZONE (Own margins: 50-545 for equal padding) ====================
            
            const footerY = 750;
            const footerLeftMargin = 50;
            const footerRightMargin = 545;
            const footerContentWidth = footerRightMargin - footerLeftMargin;
            
            // Thank you message - centered within footer margins
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000');
            doc.text('THANK YOU FOR', footerLeftMargin, footerY + 20, { align: 'center', width: footerContentWidth });
            doc.text('YOUR BUSINESS', footerLeftMargin, footerY + 35, { align: 'center', width: footerContentWidth });

            // Small logo in bottom right corner - aligned to footer right margin
            const smallLogoPath = path.join(__dirname, 'Images', 'Logos', 'RemovedStackOpsONLY.png');
            if (fs.existsSync(smallLogoPath)) {
                doc.image(smallLogoPath, footerRightMargin + 28, 818, { width: 25, height: 25 });
            }

            // Add full-page invoice image
            doc.addPage();
            const invoiceImagePath = path.join(__dirname, 'Images', 'Invoice.png');
            if (fs.existsSync(invoiceImagePath)) {
                doc.image(invoiceImagePath, 0, 0, { width: 595, height: 842 });
            }

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

        // Create payfast_payments table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS payfast_payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                invoice_id INT,
                m_payment_id VARCHAR(100),
                pf_payment_id VARCHAR(100),
                payment_status VARCHAR(50),
                amount DECIMAL(10, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (invoice_id),
                INDEX (m_payment_id)
            )
        `);

        // Create yoco_payments table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS yoco_payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                invoice_id INT,
                yoco_checkout_id VARCHAR(100),
                redirect_url TEXT,
                amount INT,
                status VARCHAR(50),
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX (invoice_id),
                INDEX (yoco_checkout_id)
            )
        `);
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
                 JOIN Users u ON u.id = (
                     SELECT id FROM Users 
                     WHERE CompanyID = c.ID AND Role = 'Client' 
                     LIMIT 1
                 )
                 WHERE LOWER(i.Status) = 'paid' 
                   AND (i.PaidEmailSent = FALSE OR ? = TRUE)`, 
                [AUTOMATION_CONFIG.TEST_MODE]
            );

            // Group paid invoices by email to send consolidated confirmations
            const paidByEmail = {};
            for (const inv of paidInvoices) {
                if (!paidByEmail[inv.email]) {
                    paidByEmail[inv.email] = {
                        firstname: inv.firstname,
                        lastname: inv.lastname,
                        invoices: []
                    };
                }
                // Avoid duplicates in the group if multiple users share an email (though rare with Client role)
                if (!paidByEmail[inv.email].invoices.some(i => i.InvoiceID === inv.InvoiceID)) {
                    paidByEmail[inv.email].invoices.push(inv);
                }
            }
            
            for (const email in paidByEmail) {
                const data = paidByEmail[email];
                const invoiceNumbers = data.invoices.map(i => i.InvoiceNumber).join(', #');
                
                const totalPaid = data.invoices.reduce((sum, inv) => sum + parseFloat(inv.TotalAmount || 0), 0);
                const receiptHtml = `
                    <div style="margin-top: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #f9f9f9; max-width: 400px;">
                        <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 10px;">Payment Receipt</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr>
                                    <th style="text-align: left; padding: 5px 0;">Description</th>
                                    <th style="text-align: right; padding: 5px 0;">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.invoices.map(inv => `
                                    <tr>
                                        <td style="padding: 5px 0;">Invoice #${inv.InvoiceNumber}</td>
                                        <td style="text-align: right; padding: 5px 0;">R ${parseFloat(inv.TotalAmount).toFixed(2)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                            <tfoot>
                                <tr style="border-top: 2px solid #333; font-weight: bold;">
                                    <td style="padding: 10px 0 5px 0;">TOTAL PAID</td>
                                    <td style="text-align: right; padding: 10px 0 5px 0;">R ${totalPaid.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                `;

                console.log(`[Automation] Sending consolidated payment confirmation for Invoices #${invoiceNumbers} to ${email}`);
                const emailBody = `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                        <p>Dear ${data.firstname},</p> 
                        <p>I hope you are well.</p>
                        <p>This is a confirmation that your payment for <b>Invoice #${invoiceNumbers}</b> has been received and confirmed.</p>
                        <p>Thank you for your business!</p>
                        ${receiptHtml}
                        <p>Best regards,<br><b>StackOps IT Solutions Team</b></p>
                        <img
                            src="https://i.ibb.co/LWJ2qqY/Signature-Billing.jpg"
                            alt="StackOps IT Solutions"
                            width="400"
                            style="display:block; max-width:400px; width:100%; height:auto; margin-top:10px;"
                        >

                            <p style="
                                font-size:8.5px;
                                line-height:1.4;
                                color:#666666;
                                font-family:'Avenir Next LT Pro Light','Avenir Next',Avenir,Helvetica,Arial,sans-serif;
                                margin:0.5px 0 0 0;
                            ">
                                <strong>StackOps IT Solutions (Pty) Ltd</strong> |
                                <strong>Reg. No:</strong> 2016/120370/07 |
                                <strong>B-BBEE Level</strong>: 1 Contributor: 135% |
                                <strong>CSD Supplier:</strong> MAAA164124.
                                Legally registered in South Africa, providing IT support, cybersecurity, governance, infrastructure, consulting services,
                                and procurement of IT hardware in compliance with all applicable laws and regulations.
                                All client information is protected in accordance with the
                                <strong>Protection of Personal Information Act (POPIA)</strong> and our internal
                                privacy and security policies. We are committed to safeguarding your data and ensuring confidentiality, integrity, and lawful
                                processing at all times.
                                All information, proposals, and pricing are accurate at the time of sending and governed by our Master Service Agreement (MSA)
                                or client-specific contracts. Prices may be subject to change due to economic, regulatory, or supplier factors, with clients
                                notified in advance.
                                This email and attachments are confidential and intended solely for the named recipient(s). If received in error, please
                                notify the sender immediately, delete the message, and do not disclose, copy, or distribute its contents.
                                Unauthorized use of this communication is strictly prohibited.
                                Emails are not guaranteed virus-free; StackOps IT Solutions accepts no liability for any damage, loss, or unauthorized access
                                arising from this communication.
                                StackOps IT Solutions is committed to business continuity, data security, and reliable technology operations.
                                Our team provides professional, ethical, and transparent IT services, ensuring measurable value, operational efficiency,
                                and compliance with industry best practices.
                                <strong>View our Privacy Policy and Terms of Service here:</strong>
                                <a href="https://stackopsit.co.za/"
                                style="color:#1a73e8; text-decoration:underline;">
                                    StackOps IT Solutions | Your Complete IT Force
                                </a>
                            </p>
                    </div>
                `;
                
                try {
                    await sendBillingEmail(email, `Payment Confirmed - Invoice #${invoiceNumbers}`, emailBody, true);
                    for (const inv of data.invoices) {
                        await pool.query("UPDATE Invoices SET PaidEmailSent = TRUE WHERE InvoiceID = ?", [inv.InvoiceID]);
                    }
                } catch (e) {
                    console.error(`[Automation] Failed to send consolidated paid email to ${email}:`, e);
                }
            }

            // B. Handle OVERDUE reminders
            const [overdueInvoices] = await pool.query(
                `SELECT i.*, c.companyname as CompanyName, u.firstname, u.lastname, u.email 
                 FROM Invoices i
                 JOIN Companies c ON i.CompanyID = c.ID
                 JOIN Users u ON c.ID = u.CompanyID
                 WHERE LOWER(i.Status) = 'overdue' 
                   AND (i.LastReminderDate IS NULL OR i.LastReminderDate < ? OR ? = TRUE)
                   AND u.Role = 'Client'
                 GROUP BY i.InvoiceID
                 ORDER BY i.InvoiceID`,
                [todayStr, AUTOMATION_CONFIG.TEST_MODE]
            );

            // Group overdue invoices by email to send consolidated reminders
            const overdueByEmail = {};
            for (const inv of overdueInvoices) {
                if (!overdueByEmail[inv.email]) {
                    overdueByEmail[inv.email] = {
                        firstname: inv.firstname,
                        lastname: inv.lastname,
                        invoices: []
                    };
                }
                if (!overdueByEmail[inv.email].invoices.some(i => i.InvoiceID === inv.InvoiceID)) {
                    overdueByEmail[inv.email].invoices.push(inv);
                }
            }

            for (const email in overdueByEmail) {
                const data = overdueByEmail[email];
                const invoiceNumbers = data.invoices.map(i => i.InvoiceNumber).join(', #');
                
                let subject = `Overdue Payment Reminder - Invoice #${invoiceNumbers}`;
                let messagePrefix = `<p>This is a reminder that your payment for <b>Invoice #${invoiceNumbers}</b> is overdue.</p>`;
                let totalDue = 0;
                let hasUrgent = false;

                data.invoices.forEach(inv => {
                    totalDue += parseFloat(inv.TotalAmount);
                    const dueDate = new Date(inv.DueDate);
                    const diffDays = Math.ceil(Math.abs(now - dueDate) / (1000 * 60 * 60 * 24));
                    if (diffDays >= AUTOMATION_CONFIG.FINE_DAYS_THRESHOLD) {
                        hasUrgent = true;
                    }
                });

                if (hasUrgent) {
                    subject = `URGENT: Overdue Payment & Fine Warning - Invoice #${invoiceNumbers}`;
                    messagePrefix = `
                        <p style="color: red; font-weight: bold;">URGENT NOTICE</p>
                        <p>This is a final reminder that your payment for <b>Invoice #${invoiceNumbers}</b> is significantly overdue.</p>
                        <p>Please note that as per our terms, a fine is now being applied to your account due to the delay.</p>
                                  <img
                                    src="https://i.ibb.co/LWJ2qqY/Signature-Billing.jpg"
                                    alt="StackOps IT Solutions"
                                    width="400"
                                    style="display:block; max-width:400px; width:100%; height:auto; margin-top:10px;"
                                    >

                                    <p style="
                                        font-size:8.5px;
                                        line-height:1.4;
                                        color:#666666;
                                        font-family:'Avenir Next LT Pro Light','Avenir Next',Avenir,Helvetica,Arial,sans-serif;
                                        margin:0.5px 0 0 0;
                                    ">
                                        <strong>StackOps IT Solutions (Pty) Ltd</strong> |
                                        <strong>Reg. No:</strong> 2016/120370/07 |
                                        <strong>B-BBEE Level</strong>: 1 Contributor: 135% |
                                        <strong>CSD Supplier:</strong> MAAA164124.
                                        Legally registered in South Africa, providing IT support, cybersecurity, governance, infrastructure, consulting services,
                                        and procurement of IT hardware in compliance with all applicable laws and regulations.
                                        All client information is protected in accordance with the
                                        <strong>Protection of Personal Information Act (POPIA)</strong> and our internal
                                        privacy and security policies. We are committed to safeguarding your data and ensuring confidentiality, integrity, and lawful
                                        processing at all times.
                                        All information, proposals, and pricing are accurate at the time of sending and governed by our Master Service Agreement (MSA)
                                        or client-specific contracts. Prices may be subject to change due to economic, regulatory, or supplier factors, with clients
                                        notified in advance.
                                        This email and attachments are confidential and intended solely for the named recipient(s). If received in error, please
                                        notify the sender immediately, delete the message, and do not disclose, copy, or distribute its contents.
                                        Unauthorized use of this communication is strictly prohibited.
                                        Emails are not guaranteed virus-free; StackOps IT Solutions accepts no liability for any damage, loss, or unauthorized access
                                        arising from this communication.
                                        StackOps IT Solutions is committed to business continuity, data security, and reliable technology operations.
                                        Our team provides professional, ethical, and transparent IT services, ensuring measurable value, operational efficiency,
                                        and compliance with industry best practices.
                                        <strong>View our Privacy Policy and Terms of Service here:</strong>
                                        <a href="https://stackopsit.co.za/"
                                        style="color:#1a73e8; text-decoration:underline;">
                                            StackOps IT Solutions | Your Complete IT Force
                                        </a>
                                    </p>
                    `;
                }

                console.log(`[Automation] Sending consolidated overdue reminder for Invoices #${invoiceNumbers} to ${email}`);
                const emailBody = `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                        <p>Dear ${data.lastname},</p>
                        ${messagePrefix}
                        <p>Total Amount Due: R${totalDue.toFixed(2)}</p>
                        <p>Please settle this amount as soon as possible to avoid further action.</p>
                        <p>If you have already made payment, please ignore this email.</p>
                        <p>Best regards,<br><b>StackOps IT Solutions Team</b></p>
                        <img
                            src="https://i.ibb.co/LWJ2qqY/Signature-Billing.jpg"
                            alt="StackOps IT Solutions"
                            width="400"
                            style="display:block; max-width:400px; width:100%; height:auto; margin-top:10px;"
                            >

                            <p style="
                                font-size:8.5px;
                                line-height:1.4;
                                color:#666666;
                                font-family:'Avenir Next LT Pro Light','Avenir Next',Avenir,Helvetica,Arial,sans-serif;
                                margin:0.5px 0 0 0;
                            ">
                                <strong>StackOps IT Solutions (Pty) Ltd</strong> |
                                <strong>Reg. No:</strong> 2016/120370/07 |
                                <strong>B-BBEE Level</strong>: 1 Contributor: 135% |
                                <strong>CSD Supplier:</strong> MAAA164124.
                                Legally registered in South Africa, providing IT support, cybersecurity, governance, infrastructure, consulting services,
                                and procurement of IT hardware in compliance with all applicable laws and regulations.
                                All client information is protected in accordance with the
                                <strong>Protection of Personal Information Act (POPIA)</strong> and our internal
                                privacy and security policies. We are committed to safeguarding your data and ensuring confidentiality, integrity, and lawful
                                processing at all times.
                                All information, proposals, and pricing are accurate at the time of sending and governed by our Master Service Agreement (MSA)
                                or client-specific contracts. Prices may be subject to change due to economic, regulatory, or supplier factors, with clients
                                notified in advance.
                                This email and attachments are confidential and intended solely for the named recipient(s). If received in error, please
                                notify the sender immediately, delete the message, and do not disclose, copy, or distribute its contents.
                                Unauthorized use of this communication is strictly prohibited.
                                Emails are not guaranteed virus-free; StackOps IT Solutions accepts no liability for any damage, loss, or unauthorized access
                                arising from this communication.
                                StackOps IT Solutions is committed to business continuity, data security, and reliable technology operations.
                                Our team provides professional, ethical, and transparent IT services, ensuring measurable value, operational efficiency,
                                and compliance with industry best practices.
                                <strong>View our Privacy Policy and Terms of Service here:</strong>
                                <a href="https://stackopsit.co.za/"
                                style="color:#1a73e8; text-decoration:underline;">
                                    StackOps IT Solutions | Your Complete IT Force
                                </a>
                            </p>
                    </div>
                `;
                
                try {
                    await sendBillingEmail(email, subject, emailBody, true);
                    for (const inv of data.invoices) {
                        await pool.query("UPDATE Invoices SET LastReminderDate = ? WHERE InvoiceID = ?", [todayStr, inv.InvoiceID]);
                    }
                } catch (e) {
                    console.error(`[Automation] Failed to send consolidated overdue email to ${email}:`, e);
                }
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

app.get('/success', (req, res) => {
    res.sendFile(path.join(__dirname, 'success.html'));
});

app.get('/cancel', (req, res) => {
    res.redirect('/Home.html');
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
    const { date, time, name, email, service, message, companyName, title, phone } = req.body;
    
    let updateSuccessful = false;
    let result; 

    try {
        if (!pool) {
            throw new Error('MySQL pool is not available.');
        }
        [result] = await pool.query(
            'UPDATE appointment SET is_available = FALSE, clientname = ?, companyName = ?, title = ?, email = ?, phone = ?, service = ?, message = ? WHERE date = ? AND time = ? AND is_available = TRUE',
            [name, companyName || '', title || '', email, phone || '', service, message, date, time]
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
- Company: ${companyName || 'N/A'}
- Title: ${title || 'N/A'}
- Email: ${email}
- Phone: ${phone || 'N/A'}
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

// ==================== QUICK ADD CLIENT FOR INVOICING ====================
// This endpoint creates a lightweight client record without full registration
// Ideal for automation and quick invoice creation workflows
app.post('/api/admin/clients/quick-add', authenticateToken, async (req, res) => {
    const { name, email, companyId } = req.body;

    if (!name || !companyId) {
        return res.status(400).json({ error: 'Client name and company are required' });
    }

    const parts = name.trim().split(' ');
    const firstName = parts.shift();
    const lastName = parts.join(' ') || '';

    try {
        const [result] = await pool.query(
            `INSERT INTO Users (firstname, lastname, email, role, companyid, isactive)
             VALUES (?, ?, ?, 'invoice_client', ?, 1)`,
            [firstName, lastName, email || null, companyId]
        );

        res.json({
            success: true,
            client: {
                id: result.insertId,
                firstname: firstName,
                lastname: lastName,
                email
            }
        });

    } catch (err) {
        console.error('Quick add client error:', err);
        res.status(500).json({ error: 'Failed to create client' });
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

      // Insert items if provided - Updated to handle new structure
      if (Items && Items.length > 0) {
        for (const item of Items) {
          // Support both old and new formats
          if (item.ServiceCategory) {
            // New format: ServiceCategory, Deliverables, Frequency, Rate, Total
            await connection.query(
              `INSERT INTO InvoiceItems (InvoiceID, ServiceCategory, Deliverables, Frequency, Rate, Total)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [invoiceId, item.ServiceCategory, item.Deliverables, item.Frequency, item.Rate, item.Total]
            );
          } else {
            // Old format: Description, Quantity, UnitPrice (for backward compatibility)
            await connection.query(
              `INSERT INTO InvoiceItems (InvoiceID, Description, Quantity, UnitPrice)
               VALUES (?, ?, ?, ?)`,
              [invoiceId, item.Description, item.Quantity, item.UnitPrice]
            );
          }
        }
      }

      // NEW: Create Payment Links (PayFast and YOCO)
      let yocoPaymentUrl = null;
      let payfastPaymentUrl = null;
      
      // Fetch client details first for payment links
      const [clientRows] = await connection.query(
        'SELECT firstname, lastname, email FROM Users WHERE ID = ?', 
        [UserID]
      );
      const clientDataForLinks = clientRows[0];

      // 1. PayFast Integration (Primary)
      try {
        if (clientDataForLinks) {
          payfastPaymentUrl = await generatePayFastLink({
            amount: TotalAmount,
            item_name: `Invoice #${nextInvoiceNumber}`,
            item_description: `Payment for StackOps IT Solutions Invoice #${nextInvoiceNumber}`,
            name_first: clientDataForLinks.firstname,
            name_last: clientDataForLinks.lastname,
            email_address: clientDataForLinks.email,
            m_payment_id: `INV-${nextInvoiceNumber}-${invoiceId}`,
            custom_int1: invoiceId,
            custom_str1: nextInvoiceNumber.toString()
          });

          if (payfastPaymentUrl) {
            // Store in payfast_payments table
            await connection.query(
              "INSERT INTO payfast_payments (invoice_id, m_payment_id, amount, status) VALUES (?, ?, ?, 'pending')",
              [invoiceId, `INV-${nextInvoiceNumber}-${invoiceId}`, TotalAmount]
            );
          }
        }
      } catch (payfastError) {
        console.error("Error creating PayFast payment:", payfastError);
      }

      // 2. YOCO Integration (Secondary)
      try {
        const yocoSecretKey = await getSecret('YOCO_SECRET_KEY');
        if (yocoSecretKey) {
          const amountInCents = Math.round(parseFloat(TotalAmount) * 100);
          const yocoResponse = await fetch("https://payments.yoco.com/api/checkouts", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${yocoSecretKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              amount: amountInCents,
              currency: "ZAR",
              description: `Payment for Invoice #${nextInvoiceNumber}`,
              metadata: {
                invoiceId: invoiceId.toString()
              }
            })
          });

          const yocoData = await yocoResponse.json();
          if (yocoData.id && yocoData.redirectUrl) {
            yocoPaymentUrl = yocoData.redirectUrl;
            await connection.query(
              "INSERT INTO yoco_payments (invoice_id, yoco_checkout_id, redirect_url, amount, status) VALUES (?, ?, ?, ?, 'pending')",
              [invoiceId, yocoData.id, yocoPaymentUrl, amountInCents]
            );
          }
        }
      } catch (yocoError) {
        console.error("Error creating YOCO payment:", yocoError);
      }

      // Fetch company and client details for PDF and Email
      const [companyRows] = await connection.query(
        'SELECT companyname AS CompanyName, address, city, state, zipcode FROM Companies WHERE ID = ?', 
        [CompanyID]
      );
      
      const companyData = companyRows[0];
      const clientData = clientDataForLinks;

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

      // UPDATED: Send Email with Payment Links
      const emailBody = `
       <div style="
                font-family: 'Avenir Next LT Pro Light', 'Avenir Next', Avenir, Helvetica, Arial, sans-serif;
                line-height: 1.6;
                color: #333;
            ">
            <p>Dear ${clientData.lastname},</p>

            <p>I hope you are well.</p>

            <p>Please find attached invoice <strong>[#${nextInvoiceNumber}]</strong>.</p>

            <p><strong>Invoice Summary:</strong></p>

            <table style="width:100%; border-collapse:collapse; margin-top:20px; font-family:'Avenir Next LT Pro Light','Avenir Next',Avenir,Helvetica,Arial,sans-serif;">
                <tr>
                    <td style="padding:10px; border:1px solid #ddd; font-weight:600; width:150px;">Invoice Number:</td>
                    <td style="padding:10px; border:1px solid #ddd;">#${nextInvoiceNumber}</td>
                </tr>
                <tr>
                    <td style="padding:10px; border:1px solid #ddd; font-weight:600;">Invoice Date:</td>
                    <td style="padding:10px; border:1px solid #ddd;">${new Date(InvoiceDate).toLocaleDateString()}</td>
                </tr>
                <tr>
                    <td style="padding:10px; border:1px solid #ddd; font-weight:600;">Due Date:</td>
                    <td style="padding:10px; border:1px solid #ddd;">${new Date(DueDate).toLocaleDateString()}</td>
                </tr>
                <tr>
                    <td style="padding:10px; border:1px solid #ddd; font-weight:600;">Total Amount:</td>
                    <td style="padding:10px; border:1px solid #ddd;">R${parseFloat(TotalAmount).toFixed(2)}</td>
                </tr>
            </table>

            <p style="margin-top:20px;">
                To make payment quick and convenient, you may use the secure payment links below:
            </p>

            <div style="margin-top:20px; padding:15px; border:1px solid #eee; border-radius:8px; background-color:#fcfcfc;">
                <h3 style="margin-top:0; color:#333; font-size:16px;">Option 1: Pay via PayFast (Instant EFT, Cards, etc.)</h3>
                ${
                payfastPaymentUrl
                    ? `<p style="margin-top:10px;">
                    <a href="${payfastPaymentUrl}" target="_blank" style="display:inline-block; padding:10px 20px; background-color:#bf2026; color:white; text-decoration:none; border-radius:5px; font-weight:bold;">Pay Now via PayFast</a>
                    </p>`
                    : `<p style="margin-top:10px; color:red;">
                    Note: PayFast link could not be generated.
                    </p>`
                }
            </div>

            <div style="margin-top:20px; padding:15px; border:1px solid #eee; border-radius:8px; background-color:#fcfcfc;">
                <h3 style="margin-top:0; color:#333; font-size:16px;">Option 2: Pay via YOCO (Cards)</h3>
                ${
                yocoPaymentUrl
                    ? `<p style="margin-top:10px;">
                    <a href="${yocoPaymentUrl}" target="_blank" style="display:inline-block; padding:10px 20px; background-color:#0070ba; color:white; text-decoration:none; border-radius:5px; font-weight:bold;">Pay Now via YOCO</a>
                    </p>`
                    : `<p style="margin-top:10px; color:red;">
                    Note: YOCO link could not be generated.
                    </p>`
                }
            </div>

            <p style="margin-top:20px;">
                If you have any questions, please contact us at
                <a href="mailto:billing@stackopsit.co.za">billing@stackopsit.co.za</a>
                or 011 568 9337.
            </p>

            <p>
                Best regards,<br>
            </p>

            <img
            src="https://i.ibb.co/LWJ2qqY/Signature-Billing.jpg"
            alt="StackOps IT Solutions"
            width="400"
            style="display:block; max-width:400px; width:100%; height:auto; margin-top:10px;"
            >

            <p style="
                font-size:8.5px;
                line-height:1.4;
                color:#666666;
                font-family:'Avenir Next LT Pro Light','Avenir Next',Avenir,Helvetica,Arial,sans-serif;
                margin:0.5px 0 0 0;
            ">
                <strong>StackOps IT Solutions (Pty) Ltd</strong> |
                <strong>Reg. No:</strong> 2016/120370/07 |
                <strong>B-BBEE Level</strong>: 1 Contributor: 135% |
                <strong>CSD Supplier:</strong> MAAA164124.
                Legally registered in South Africa, providing IT support, cybersecurity, governance, infrastructure, consulting services,
                and procurement of IT hardware in compliance with all applicable laws and regulations.
                All client information is protected in accordance with the
                <strong>Protection of Personal Information Act (POPIA)</strong> and our internal
                privacy and security policies. We are committed to safeguarding your data and ensuring confidentiality, integrity, and lawful
                processing at all times.
                All information, proposals, and pricing are accurate at the time of sending and governed by our Master Service Agreement (MSA)
                or client-specific contracts. Prices may be subject to change due to economic, regulatory, or supplier factors, with clients
                notified in advance.
                This email and attachments are confidential and intended solely for the named recipient(s). If received in error, please
                notify the sender immediately, delete the message, and do not disclose, copy, or distribute its contents.
                Unauthorized use of this communication is strictly prohibited.
                Emails are not guaranteed virus-free; StackOps IT Solutions accepts no liability for any damage, loss, or unauthorized access
                arising from this communication.
                StackOps IT Solutions is committed to business continuity, data security, and reliable technology operations.
                Our team provides professional, ethical, and transparent IT services, ensuring measurable value, operational efficiency,
                and compliance with industry best practices.
                <strong>View our Privacy Policy and Terms of Service here:</strong>
                <a href="https://stackopsit.co.za/"
                style="color:#1a73e8; text-decoration:underline;">
                    StackOps IT Solutions | Your Complete IT Force
                </a>
            </p>

        </div>

      `;

      try {
        await sendBillingEmail(
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

//=====================================================================================================================================//
//                                                          Payment integration                                                        //
//=====================================================================================================================================//

// YOCO Payment Creation
app.post("/api/create-payment", authenticateToken, async (req, res) => {
    const { amount, description, invoiceId } = req.body;

    if (!amount || !invoiceId) {
        return res.status(400).json({ error: "Amount and Invoice ID are required" });
    }

    try {
        // 1. Get Secret Key
        const yocoSecretKey = getSecret('YOCO_SECRET_KEY');

        // 2. Create Yoco Checkout with Metadata
        const response = await fetch("https://payments.yoco.com/api/checkouts", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${yocoSecretKey.trim()}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                amount: Math.round(parseFloat(amount) * 100), // Convert to cents
                currency: "ZAR",
                description: description || `Payment for Invoice #${invoiceId}`,
                // THE FIX: We pass the invoiceId here. Yoco will send it back in the webhook.
                metadata: {
                    invoiceId: invoiceId.toString()
                },
                redirectUrl: `https://stackopsit.co.za/payment-success.html?invoiceId=${invoiceId}`
            })
        });

        const data = await response.json();

        if (data.id) {
            // 3. Save to database (we still save the checkout_id for logs, but we won't rely on it)
            await pool.query(
                "INSERT INTO yoco_payments (yoco_checkout_id, invoice_id, amount, description, status) VALUES (?, ?, ?, ?, ?)",
                [data.id, invoiceId, Math.round(parseFloat(amount) * 100), description, "pending"]
            );

            res.json({ paymentUrl: data.redirectUrl });
        } else {
            throw new Error(data.errorMessage || "Failed to create Yoco checkout");
        }
    } catch (err) {
        console.error("❌ Payment Error:", err.message);
        res.status(500).json({ error: "Payment creation failed" });
    }
});

app.post("/api/payfast/itn", async (req, res) => {
  console.log("[PAYFAST ITN] 📥 Notification received");

  const data = req.body;

  try {
    const passphrase = await getSecret("PAYFAST_PASSPHRASE");

    /* ===============================
       1️⃣ VERIFY PAYFAST SIGNATURE
    =============================== */
    const receivedSignature = data.signature;
    const verificationData = { ...data };
    delete verificationData.signature;

    const generatedSignature = generatePayFastSignature(
      verificationData,
      passphrase
    );

    if (receivedSignature !== generatedSignature) {
      console.error("[PAYFAST ITN] ❌ Invalid signature");
      return res.sendStatus(200); // PayFast requires 200
    }

    /* ===============================
       2️⃣ EXTRACT PAYFAST DATA
    =============================== */
    const {
      m_payment_id,
      pf_payment_id,
      payment_status,
      amount_gross,
      custom_int1: invoiceId
    } = data;

    if (!m_payment_id || !invoiceId) {
      console.error("[PAYFAST ITN] ❌ Missing payment or invoice reference");
      return res.sendStatus(200);
    }

    console.log(
      `[PAYFAST ITN] Status=${payment_status} | Invoice=${invoiceId}`
    );

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      /* ===============================
         3️⃣ ENSURE payfast_payments EXISTS
      =============================== */
      const [existingPayment] = await connection.query(
        "SELECT payment_status FROM payfast_payments WHERE m_payment_id = ?",
        [m_payment_id]
      );

      if (!existingPayment.length) {
        await connection.query(
          `INSERT INTO payfast_payments
           (m_payment_id, invoice_id, pf_payment_id, amount, payment_status, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [
            m_payment_id,
            invoiceId,
            pf_payment_id || null,
            parseFloat(amount_gross),
            payment_status
          ]
        );
      } else {
        await connection.query(
          `UPDATE payfast_payments
           SET pf_payment_id = ?,
               payment_status = ?,
               updated_at = NOW()
           WHERE m_payment_id = ?`,
          [pf_payment_id, payment_status, m_payment_id]
        );
      }

      /* ===============================
         4️⃣ PROCESS SUCCESSFUL PAYMENT
      =============================== */
      if (payment_status === "COMPLETE") {

        // 🔒 Prevent double processing
        const [alreadyPaid] = await connection.query(
          "SELECT 1 FROM Payments WHERE InvoiceID = ? AND Method = 'PayFast' LIMIT 1",
          [invoiceId]
        );

        if (!alreadyPaid.length) {

          // ✅ Mark invoice as PAID (overrides Pending / Overdue)
          await connection.query(
            "UPDATE Invoices SET Status = 'Paid' WHERE InvoiceID = ?",
            [invoiceId]
          );

          // ✅ Insert payment history
          await connection.query(
            `INSERT INTO Payments
             (InvoiceID, AmountPaid, PaymentDate, Method)
             VALUES (?, ?, NOW(), 'PayFast')`,
            [invoiceId, parseFloat(amount_gross)]
          );

          console.log(`[PAYFAST ITN] ✅ Invoice ${invoiceId} marked as PAID`);

          // 📧 Send Confirmation Email (Immediately)
          // This also prevents the morning automation from sending it again
          const [details] = await connection.query(
            `SELECT i.InvoiceNumber, u.email, u.firstname
             FROM Invoices i
             JOIN Companies c ON i.CompanyID = c.ID
             JOIN Users u ON c.ID = u.CompanyID
             WHERE i.InvoiceID = ? AND u.Role = 'Client'
             LIMIT 1`,
            [invoiceId]
          );

          if (details.length) {
            const targetClient = details[0];
            const receiptHtml = `
              <div style="margin-top: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #f9f9f9; max-width: 400px;">
                <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 10px;">Payment Receipt</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr>
                      <th style="text-align: left; padding: 5px 0;">Description</th>
                      <th style="text-align: right; padding: 5px 0;">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style="padding: 5px 0;">Invoice #${targetClient.InvoiceNumber}</td>
                      <td style="text-align: right; padding: 5px 0;">R ${parseFloat(amount_gross).toFixed(2)}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr style="border-top: 2px solid #333; font-weight: bold;">
                      <td style="padding: 10px 0 5px 0;">TOTAL PAID</td>
                      <td style="text-align: right; padding: 10px 0 5px 0;">R ${parseFloat(amount_gross).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
                <p style="font-size: 12px; color: #666; margin-top: 15px; font-style: italic;">Payment Method: PayFast Online Payment</p>
              </div>
            `;

            try {
              await sendBillingEmail(
                targetClient.email,
                `Payment Received - Invoice #${targetClient.InvoiceNumber}`,
                `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                 <p>Dear ${targetClient.firstname},</p>
                 <p>We have successfully received your payment for <strong>Invoice #${targetClient.InvoiceNumber}</strong> via PayFast. Thank you for your business!</p>
                 <p>Please allow us <strong>24 hours</strong> to process your payment. We will send a final confirmation once the process is complete.</p>
                 ${receiptHtml}
                 <p>
                    If you have any questions, please contact us at
                    <a href="mailto:billing@stackopsit.co.za">billing@stackopsit.co.za</a>
                    or 011 568 9337.
                 </p>
                 <img
                src="https://i.ibb.co/LWJ2qqY/Signature-Billing.jpg"
                alt="StackOps IT Solutions"
                width="400"
                style="display:block; max-width:400px; width:100%; height:auto; margin-top:10px;"
                >
                <p style="
                    font-size:8.5px;
                    line-height:1.4;
                    color:#666666;
                    font-family:'Avenir Next LT Pro Light','Avenir Next',Avenir,Helvetica,Arial,sans-serif;
                    margin:0.5px 0 0 0;
                ">
                    <strong>StackOps IT Solutions (Pty) Ltd</strong> |
                    <strong>Reg. No:</strong> 2016/120370/07 |
                    <strong>B-BBEE Level</strong>: 1 Contributor: 135% |
                    <strong>CSD Supplier:</strong> MAAA164124.
                    Legally registered in South Africa, providing IT support, cybersecurity, governance, infrastructure, consulting services,
                    and procurement of IT hardware in compliance with all applicable laws and regulations.
                    All client information is protected in accordance with the
                    <strong>Protection of Personal Information Act (POPIA)</strong> and our internal
                    privacy and security policies. We are committed to safeguarding your data and ensuring confidentiality, integrity, and lawful
                    processing at all times.
                    All information, proposals, and pricing are accurate at the time of sending and governed by our Master Service Agreement (MSA)
                    or client-specific contracts. Prices may be subject to change due to economic, regulatory, or supplier factors, with clients
                    notified in advance.
                    This email and attachments are confidential and intended solely for the named recipient(s). If received in error, please
                    notify the sender immediately, delete the message, and do not disclose, copy, or distribute its contents.
                    Unauthorized use of this communication is strictly prohibited.
                    Emails are not guaranteed virus-free; StackOps IT Solutions accepts no liability for any damage, loss, or unauthorized access
                    arising from this communication.
                    StackOps IT Solutions is committed to business continuity, data security, and reliable technology operations.
                    Our team provides professional, ethical, and transparent IT services, ensuring measurable value, operational efficiency,
                    and compliance with industry best practices.
                    <strong>View our Privacy Policy and Terms of Service here:</strong>
                    <a href="https://stackopsit.co.za/"
                    style="color:#1a73e8; text-decoration:underline;">
                        StackOps IT Solutions | Your Complete IT Force
                    </a>
                </p>
                </div>`,
                true
              );
              // Mark as sent to prevent morning automation
              await connection.query("UPDATE Invoices SET PaidEmailSent = TRUE WHERE InvoiceID = ?", [invoiceId]);
            } catch (e) {
              console.error(`[PAYFAST ITN] Failed to send confirmation email:`, e);
            }
          }
        }
      }

      await connection.commit();
      return res.sendStatus(200);
    } catch (dbErr) {
      await connection.rollback();
      console.error("[PAYFAST ITN] ❌ DATABASE ERROR:", dbErr);
      return res.sendStatus(200);
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[PAYFAST ITN] ❌ ITN ERROR:", err);
    return res.sendStatus(200);
  }
});



app.post("/webhook/yoco", express.raw({ type: "application/json" }), async (req, res) => {
  console.log("[YOCO WEBHOOK] 📥 Event received");

  try {
    const event = Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString("utf8"))
      : req.body;

    console.log("[YOCO WEBHOOK] Event type:", event?.type);

    // Yoco sometimes uses event.payload and sometimes event.data.payment
    const payment = event?.payload || event?.data?.payment;

    if (!payment) {
      console.error("[YOCO WEBHOOK] ❌ Invalid payload - Full event:", JSON.stringify(event, null, 2));
      return res.sendStatus(200);
    }

    // Invoice ID from metadata (we set this in checkout creation)
    let invoiceId = payment?.metadata?.invoiceId || payment?.metadata?.invoice_id;
    let invoiceIds = payment?.metadata?.invoice_ids ? payment.metadata.invoice_ids.split(',') : [];

    // Fallback: If no invoice ID in metadata, try to find it via checkout ID
    if (!invoiceId && invoiceIds.length === 0) {
      const checkoutId = payment.checkoutId || payment.id;
      if (checkoutId) {
        console.log(`[YOCO WEBHOOK] 🔍 Searching for invoices linked to checkout ${checkoutId}`);
        const [linkedPayments] = await pool.query(
          "SELECT invoice_id FROM yoco_payments WHERE yoco_checkout_id = ?",
          [checkoutId]
        );
        if (linkedPayments.length > 0) {
          invoiceIds = linkedPayments.map(p => p.invoice_id);
          console.log(`[YOCO WEBHOOK] Found ${invoiceIds.length} linked invoices: ${invoiceIds.join(', ')}`);
        }
      }
    } else if (invoiceId && invoiceIds.length === 0) {
      invoiceIds = [invoiceId];
    }

    // Yoco status can be 'paid' or 'succeeded'
    const isPaid = payment.status === "paid" || payment.status === "succeeded";
    
    if (!isPaid) {
      console.log(`[YOCO WEBHOOK] ℹ️ Payment status: ${payment.status}`);
      return res.sendStatus(200);
    }

    if (invoiceIds.length === 0) {
       console.error("[YOCO WEBHOOK] ❌ No invoices found to process. Event:", JSON.stringify(event, null, 2));
       return res.sendStatus(200);
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const processedInvoices = [];
      let targetClient = null;
      const paymentReceiptItems = [];

      for (const invId of invoiceIds) {
        const [existing] = await connection.query(
          "SELECT status FROM yoco_payments WHERE invoice_id = ? LIMIT 1",
          [invId]
        );

        if (existing.length && existing[0].status === "paid") {
          console.log(`[YOCO WEBHOOK] ℹ️ Invoice ${invId} already processed`);
          continue;
        }

        await connection.query(
          "UPDATE Invoices SET Status = 'Paid' WHERE InvoiceID = ?",
          [invId]
        );

        await connection.query(
          "UPDATE yoco_payments SET status = 'paid', updated_at = NOW() WHERE invoice_id = ?",
          [invId]
        );

        const [paymentRow] = await connection.query(
          "SELECT amount FROM yoco_payments WHERE invoice_id = ? LIMIT 1",
          [invId]
        );

        let amountPaid = 0;
        if (paymentRow.length) {
          amountPaid = paymentRow[0].amount / 100;
          await connection.query(
            "INSERT INTO Payments (InvoiceID, AmountPaid, PaymentDate, Method) VALUES (?, ?, NOW(), 'YOCO')",
            [invId, amountPaid]
          );
        }

        const [details] = await connection.query(
          `SELECT i.InvoiceNumber, u.email, u.firstname
           FROM Invoices i
           JOIN Companies c ON i.CompanyID = c.ID
           JOIN Users u ON c.ID = u.CompanyID
           WHERE i.InvoiceID = ? AND u.Role = 'Client'
           LIMIT 1`,
          [invId]
        );

        console.log(`[YOCO WEBHOOK] 🎉 SUCCESS: Invoice ${invId} PAID`);

        if (details.length) {
          processedInvoices.push(details[0].InvoiceNumber);
          if (!targetClient) targetClient = details[0];
          paymentReceiptItems.push({
            number: details[0].InvoiceNumber,
            amount: amountPaid
          });
        }
      }

      if (targetClient && processedInvoices.length > 0) {
        const invoiceNumbers = processedInvoices.length > 1 
          ? processedInvoices.join(', #') 
          : processedInvoices[0];

        const totalPaid = paymentReceiptItems.reduce((sum, item) => sum + item.amount, 0);
        const receiptHtml = `
          <div style="margin-top: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #f9f9f9; max-width: 400px;">
            <h3 style="margin-top: 0; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 10px;">Payment Receipt</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr>
                  <th style="text-align: left; padding: 5px 0;">Description</th>
                  <th style="text-align: right; padding: 5px 0;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${paymentReceiptItems.map(item => `
                  <tr>
                    <td style="padding: 5px 0;">Invoice #${item.number}</td>
                    <td style="text-align: right; padding: 5px 0;">R ${item.amount.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr style="border-top: 2px solid #333; font-weight: bold;">
                  <td style="padding: 10px 0 5px 0;">TOTAL PAID</td>
                  <td style="text-align: right; padding: 10px 0 5px 0;">R ${totalPaid.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            <p style="font-size: 12px; color: #666; margin-top: 15px; font-style: italic;">Payment Method: YOCO Card Payment</p>
          </div>
        `;

        try {
          await sendBillingEmail(
            targetClient.email,
            `Payment Received - Invoice #${invoiceNumbers}`,
            `<p>Dear ${targetClient.firstname},</p>
             <p>We have successfully received your payment for <strong>Invoice #${invoiceNumbers}</strong>. Thank you for your business!</p>
             <p>Please allow us <strong>24 hours</strong> to process your payment. We will send a final confirmation once the process is complete.</p>
             ${receiptHtml}
             <p>
                If you have any questions, please contact us at
                <a href="mailto:billing@stackopsit.co.za">billing@stackopsit.co.za</a>
                or 011 568 9337.
             </p>
             <img
            src="https://i.ibb.co/LWJ2qqY/Signature-Billing.jpg"
            alt="StackOps IT Solutions"
            width="400"
            style="display:block; max-width:400px; width:100%; height:auto; margin-top:10px;"
            >

            <p style="
                font-size:8.5px;
                line-height:1.4;
                color:#666666;
                font-family:'Avenir Next LT Pro Light','Avenir Next',Avenir,Helvetica,Arial,sans-serif;
                margin:0.5px 0 0 0;
            ">
                <strong>StackOps IT Solutions (Pty) Ltd</strong> |
                <strong>Reg. No:</strong> 2016/120370/07 |
                <strong>B-BBEE Level</strong>: 1 Contributor: 135% |
                <strong>CSD Supplier:</strong> MAAA164124.
                Legally registered in South Africa, providing IT support, cybersecurity, governance, infrastructure, consulting services,
                and procurement of IT hardware in compliance with all applicable laws and regulations.
                All client information is protected in accordance with the
                <strong>Protection of Personal Information Act (POPIA)</strong> and our internal
                privacy and security policies. We are committed to safeguarding your data and ensuring confidentiality, integrity, and lawful
                processing at all times.
                All information, proposals, and pricing are accurate at the time of sending and governed by our Master Service Agreement (MSA)
                or client-specific contracts. Prices may be subject to change due to economic, regulatory, or supplier factors, with clients
                notified in advance.
                This email and attachments are confidential and intended solely for the named recipient(s). If received in error, please
                notify the sender immediately, delete the message, and do not disclose, copy, or distribute its contents.
                Unauthorized use of this communication is strictly prohibited.
                Emails are not guaranteed virus-free; StackOps IT Solutions accepts no liability for any damage, loss, or unauthorized access
                arising from this communication.
                StackOps IT Solutions is committed to business continuity, data security, and reliable technology operations.
                Our team provides professional, ethical, and transparent IT services, ensuring measurable value, operational efficiency,
                and compliance with industry best practices.
                <strong>View our Privacy Policy and Terms of Service here:</strong>
                <a href="https://stackopsit.co.za/"
                style="color:#1a73e8; text-decoration:underline;">
                    StackOps IT Solutions | Your Complete IT Force
                </a>
            </p>
             `,
            true
          );
          // Mark as sent so the automation doesn't send it again
          for (const invId of invoiceIds) {
            await connection.query("UPDATE Invoices SET PaidEmailSent = TRUE WHERE InvoiceID = ?", [invId]);
          }
        } catch (e) {
          console.error(`[YOCO WEBHOOK] Failed to send consolidated email:`, e);
        }
      }

      await connection.commit();
      return res.sendStatus(200);
    } catch (dbErr) {
      await connection.rollback();
      console.error("[YOCO WEBHOOK] ❌ DB Error:", dbErr);
      return res.sendStatus(200);
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("[YOCO WEBHOOK] ❌ Webhook Error:", err);
    return res.sendStatus(200);
  }
});


//===========================================================================================================//
//                                       DUO API INTEGRATION                                                 //
//===========================================================================================================//
/**
 * Helper: Sign Duo Request
 * Essential for authenticating with Duo's Admin API.
 */
function signDuoRequest(method, host, path, params, skey, date) {
    // 1. Sort the keys alphabetically (Duo requirement)
    const sortedKeys = Object.keys(params).sort();
    
    // 2. Map to 'key=value' format with URL encoding
    const paramString = sortedKeys
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
        .join('&');
        
    // 3. Create the canonical string for hashing
    const canon = [date, method.toUpperCase(), host.toLowerCase(), path, paramString].join('\n');
    
    // 4. Return the HMAC-SHA1 signature
    return crypto.createHmac('sha1', skey).update(canon).digest('hex');
}

// Helper: Map Duo Edition to Marketing Name
function mapDuoEditionToMarketingName(edition) {
    if (!edition) return 'Unknown';

    const editionMap = {
        ENTERPRISE: 'Essentials',
        PLATFORM: 'Advantage',
        BEYOND: 'Premier',
        PERSONAL: 'Free'
    };

    return editionMap[edition.toUpperCase()] || edition;
}

/**
 * Main Task: Sync Duo Data
 * Fetches user counts and editions for all active clients.
 */
async function syncDuoData() {
    console.log('[Duo Sync] Awakening Engine... 🤖');
    try {
        const ikey = await getSecret('DUO_IKEY');
        const skey = await getSecret('DUO_SKEY');
        if (!ikey || !skey) return;

        const [clients] = await pool.query("SELECT * FROM client_duo_stats WHERE status = 'active' OR status = 'Active'");
        
        for (const client of clients) {
            const date = new Date().toUTCString();
            const host = client.duo_api_hostname.trim();
            const accId = client.duo_account_id.trim();

            // --- PART A: FETCH USED LICENSES (Active Users) ---
            const userPath = "/admin/v1/users";
            const userParams = { account_id: accId };
            const userSig = signDuoRequest("GET", host, userPath, userParams, skey, date);
            const userUrl = `https://${host}${userPath}?account_id=${encodeURIComponent(accId)}`;

            let userCount = client.used_licenses; 
            try {
                const userRes = await fetch(userUrl, {
                    headers: {
                        'Date': date,
                        'Authorization': 'Basic ' + Buffer.from(`${ikey}:${userSig}`).toString('base64')
                    }
                });
                const userData = await userRes.json();
                if (userData.stat === 'OK') {
                    userCount = userData.metadata?.total_objects || 0;
                }
            } catch (e) { console.error(`[Duo Sync] User count error:`, e.message); }

            // --- PART B: FETCH EDITION ---
            const edPath = "/admin/v1/billing/edition";
            const edParams = { account_id: accId };
            const edSig = signDuoRequest("GET", host, edPath, edParams, skey, date);
            const edUrl = `https://${host}${edPath}?account_id=${encodeURIComponent(accId)}`;

            let edition = client.edition;
            try {
                const edRes = await fetch(edUrl, {
                    headers: {
                        'Date': date,
                        'Authorization': 'Basic ' + Buffer.from(`${ikey}:${edSig}`).toString('base64')
                    }
                });
                const edData = await edRes.json();
                if (edData.stat === 'OK') {
                    edition = edData.response?.edition || edition;
                }
            } catch (e) { console.warn(`[Duo Sync] Edition fetch error:`, e.message); }

            // --- PART D: FETCH TOTAL LICENSES (The New Working Endpoint!) ---
            const limitPath = "/admin/v1/billing/user_limit";
            const limitParams = { account_id: accId };
            const limitSig = signDuoRequest("GET", host, limitPath, limitParams, skey, date);
            const limitUrl = `https://${host}${limitPath}?account_id=${encodeURIComponent(accId)}`;

            let totalLicenses = client.total_licenses;

            try {
                const limitRes = await fetch(limitUrl, {
                    headers: {
                        'Date': date,
                        'Authorization': 'Basic ' + Buffer.from(`${ikey}:${limitSig}`).toString('base64')
                    }
                });

                const limitData = await limitRes.json();

                if (limitData.stat === 'OK') {
                    // Mapping 'user_limit' from API to 'total_licenses' in DB
                    totalLicenses = limitData.response?.user_limit || totalLicenses;
                    // Note: current_user_count is also available here if Part A fails
                    userCount = limitData.response?.current_user_count || userCount;
                } else {
                    console.error(`[Duo Sync] Limit API Error for ${client.name}:`, limitData.message);
                }
            } catch (e) {
                console.error(`[Duo Sync] Limit fetch failure:`, e.message);
            }

            // --- PART C: UPDATE DATABASE ---
            await pool.query(
                "UPDATE client_duo_stats SET used_licenses = ?, total_licenses = ?, edition = ?, last_updated = NOW() WHERE id = ?",
                [userCount, totalLicenses, edition, client.id]
            );
            console.log(`[Duo Sync Success] ${client.name} -> Used: ${userCount}, Total: ${totalLicenses} 📊`);
        }
    } catch (error) {
        console.error('[Duo Sync] Critical Failure:', error);
    }
}

/**
 * Endpoint: Get Duo Stats for Logged-in Client
 * Route: GET /api/duo-stats
 */
app.get('/api/duo-stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id; // From JWT token

        const [rows] = await pool.query(
            `SELECT cds.used_licenses, cds.total_licenses, cds.edition, cds.last_updated, cds.duo_account_id, cds.status 
             FROM client_duo_stats cds
             JOIN user_duo_accounts uda ON cds.id = uda.duo_id
             WHERE uda.user_id = ?`,
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "No Duo stats found for this account." });
        }

        const stats = rows[0];

        // --- MATH ENGINE START ---
        const used = stats.used_licenses || 0;
        const total = stats.total_licenses || 0;
        const remaining = Math.max(0, total - used); // Use Math.max to avoid negative numbers if over-limit
        const percentUsed = total > 0 ? Math.round((used / total) * 100) : 0;
        // --- MATH ENGINE END ---

        // Format the date for the client's local timezone
        const formattedDate = new Date(stats.last_updated).toLocaleString();

        res.json({
            used_licenses: used,
            total_licenses: total,
            remaining_licenses: remaining, // 🆕 The requested field
            usage_percent: percentUsed,    // 🆕 Great for UI progress bars
            edition: mapDuoEditionToMarketingName(stats.edition),
            status: stats.status,
            last_sync: formattedDate,
            account_id: stats.duo_account_id
        });

    } catch (error) {
        console.error('Error fetching Duo stats:', error);
        res.status(500).json({ error: 'Failed to retrieve Duo security data.' });
    }
});

// Trigger immediately on startup (for testing)
setTimeout(() => {
    console.log('[Test] Running DUO sync on startup...');
    syncDuoData();
}, 1000);

// Hourly loop
setInterval(syncDuoData, 60 * 60 * 1000);

// ====================================================================================================//
//                                 GOOGLE CLOUD SECRET MANAGER SETUP                                   //
// ====================================================================================================//
const secretClient = new SecretManagerServiceClient();

// Function to get secret from Google Cloud Secret Manager
async function getSecret(secretName) {
    const projectId = 'stackops-backend-475222';
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    
    try {
        const [version] = await secretClient.accessSecretVersion({ name });
        return version.payload.data.toString().trim();
    } catch (error) {
        console.error(`Error accessing secret ${secretName}:`, error);
        // Fallback to environment variable if secret not found
        return process.env[secretName] || null;
    }
}
// ====================================================================================================//
//                                       CHATBOT CONFIGURATION                                         //
// ====================================================================================================//



// Initialize OpenAI client with secret from Secret Manager
let openai = null;
let openaiInitializationAttempted = false;
let openaiInitializationError = null;
const OPENAI_INIT_RETRY_DELAY = 60000; // Retry after 1 minute on failure

async function initializeOpenAI() {
    // Prevent multiple simultaneous initialization attempts
    if (openaiInitializationAttempted && openai) {
        return openai;
    }
    
    // If we've already failed recently, don't retry immediately
    if (openaiInitializationError && Date.now() - openaiInitializationError.timestamp < OPENAI_INIT_RETRY_DELAY) {
        return null;
    }
    
    try {
        openaiInitializationAttempted = true;
        const apiKey = await getSecret('OPENAI_API_KEY');
        if (!apiKey) {
            console.error('OpenAI API key not found in Secret Manager or environment variables');
            openaiInitializationError = { timestamp: Date.now(), error: 'API key not found' };
            openaiInitializationAttempted = false; // Allow retry
            return null;
        }
        openai = new OpenAI({ 
            apiKey: apiKey,
            timeout: 30000, // 30 second timeout
            maxRetries: 2
        });
        openaiInitializationError = null; // Clear any previous errors
        console.log('OpenAI client initialized successfully');
        return openai;
    } catch (error) {
        console.error('Error initializing OpenAI:', error);
        openaiInitializationError = { timestamp: Date.now(), error: error.message };
        openaiInitializationAttempted = false; // Allow retry after delay
        return null;
    }
}

// Initialize OpenAI on startup
initializeOpenAI().catch(err => {
    console.error('Failed to initialize OpenAI:', err);
});

// ============================================
// SYSTEM PROMPT
// ============================================
const CHATBOT_SYSTEM_PROMPT = `You are StackOn, AI Assistant for Stack Ops IT Solutions. Communicate as a team member using "we", "us", "our". Be professional, friendly, concise (1-3 lines).

CORE RULES:
1. NEVER hallucinate client data - only use data explicitly provided in system messages
2. Dates, amounts, invoice numbers must match database exactly - never infer or guess
3. Present data naturally: "Invoice #12345, R5,000.00 due January 15" not "invoice_number: 12345, total_amount: 5000"
4. Always end responses with relevant buttons: [[View Latest Invoice]] [[Make Payments]] [[Project Updates]] [[Ticket Status]]
5. When user needs data, output ONLY pure JSON: {"type":"action","action":"get_latest_invoice","params":{},"confidence":0.9,"needs_clarification":false}
6. NEVER mix JSON with text - no "I will fetch..." or "Here's the request..." - JSON only

ACTIONS: get_latest_invoice, get_all_invoices, get_invoice_details, get_project_updates, get_security_analytics, get_ticket_status, get_payment_info

BUTTONS: [[View Latest Invoice]] [[View All Invoices]] [[Make Payments]] [[Project Updates]] [[Security Analytics]] [[Ticket Status]]

If data unavailable, say: "I don't have that information. Would you like me to check your records?"`;

async function saveChatMessage(userId, role, content) {
    try {
        await pool.query(
            "INSERT INTO ChatHistory (UserID, Role, Content) VALUES (?, ?, ?)",
            [userId, role, content.slice(0, 2000)]
        );
    } catch (error) {
        console.error('Error saving chat message:', error);
        // Don't throw - allow conversation to continue even if history save fails
    }
}

async function getChatHistory(userId, limit = 12) {
    try {
        // Fixed query - more efficient ordering
        const [rows] = await pool.query(
            `SELECT Role, Content FROM ChatHistory
             WHERE UserID = ?
             ORDER BY ID ASC
             LIMIT ?`,
            [userId, limit]
        );

        return rows.map(r => ({
            role: r.Role,
            content: r.Content
        }));
    } catch (error) {
        console.error('Error getting chat history:', error);
        return []; // Return empty array on error to allow conversation to continue
    }
}

// Store and retrieve user context from database
async function getUserContext(userId) {
    try {
        const [rows] = await pool.query(
            `SELECT ContextData FROM UserContext WHERE UserID = ? LIMIT 1`,
            [userId]
        );
        
        if (rows.length > 0 && rows[0].ContextData) {
            return JSON.parse(rows[0].ContextData);
        }
        return {};
    } catch (error) {
        // If table doesn't exist, return empty context
        if (error.code === 'ER_NO_SUCH_TABLE') {
            return {};
        }
        console.error('Error getting user context:', error);
        return {};
    }
}

async function saveUserContext(userId, context) {
    try {
        const contextJson = JSON.stringify(context);
        await pool.query(
            `INSERT INTO UserContext (UserID, ContextData, UpdatedAt) 
             VALUES (?, ?, NOW()) 
             ON DUPLICATE KEY UPDATE ContextData = ?, UpdatedAt = NOW()`,
            [userId, contextJson, contextJson]
        );
    } catch (error) {
        // If table doesn't exist, silently fail (graceful degradation)
        if (error.code === 'ER_NO_SUCH_TABLE') {
            console.warn('UserContext table does not exist. Context will not be persisted.');
            return;
        }
        console.error('Error saving user context:', error);
        // Don't throw - context is not critical
    }
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
        case "get_project_updates":
            return getProjectUpdates(companyId);
        case "get_security_analytics":
            return getSecurityAnalytics(companyId);
        case "get_ticket_status":
            return getTicketStatus(companyId);
        case "get_payment_info":
            return getPaymentInfo(companyId, params.invoice_number || null);
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
    
    // Format dates - convert ISO strings to YYYY-MM-DD format
    const formatDate = (dateValue) => {
        if (!dateValue) return '';
        if (dateValue instanceof Date) {
            return dateValue.toISOString().split('T')[0];
        }
        const dateStr = String(dateValue);
        // If it's an ISO string like "2026-01-09T00:00:00.000Z", extract just the date part
        if (dateStr.includes('T')) {
            return dateStr.split('T')[0];
        }
        return dateStr;
    };
    
    const invoiceDate = formatDate(invoice.InvoiceDate);
    const dueDate = formatDate(invoice.DueDate);
    
    console.log('DEBUG getLatestInvoice: Date formatting:', {
        InvoiceNumber_raw: invoice.InvoiceNumber,
        InvoiceNumber_formatted: String(invoice.InvoiceNumber || ''),
        InvoiceDate_raw: invoice.InvoiceDate,
        InvoiceDate_formatted: invoiceDate,
        DueDate_raw: invoice.DueDate,
        DueDate_formatted: dueDate
    });

    return {
        has_data: true,
        data_type: "invoice",
        invoice_number: String(invoice.InvoiceNumber || ''),
        invoice_date: invoiceDate,
        due_date: dueDate,
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
    
    // Format dates - convert ISO strings to YYYY-MM-DD format
    const formatDate = (dateValue) => {
        if (!dateValue) return '';
        if (dateValue instanceof Date) {
            return dateValue.toISOString().split('T')[0];
        }
        const dateStr = String(dateValue);
        // If it's an ISO string like "2026-01-09T00:00:00.000Z", extract just the date part
        if (dateStr.includes('T')) {
            return dateStr.split('T')[0];
        }
        return dateStr;
    };
    
    const invoiceDate = formatDate(invoice.InvoiceDate);
    const dueDate = formatDate(invoice.DueDate);
    
    console.log('DEBUG getInvoiceDetails: Date formatting:', {
        InvoiceNumber_raw: invoice.InvoiceNumber,
        InvoiceNumber_formatted: String(invoice.InvoiceNumber || ''),
        InvoiceDate_raw: invoice.InvoiceDate,
        InvoiceDate_formatted: invoiceDate,
        DueDate_raw: invoice.DueDate,
        DueDate_formatted: dueDate
    });

    return {
        has_data: true,
        data_type: "invoice",
        invoice_number: String(invoice.InvoiceNumber || ''),
        invoice_date: invoiceDate,
        due_date: dueDate,
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
        `SELECT ProjectID, ProjectName, Status, EndDate
         FROM Projects
         WHERE CompanyID = ?
         ORDER BY EndDate DESC`,
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
    return {
        message: "Support ticket tracking is currently being migrated. For urgent issues, please contact support@stackopsit.co.za.",
        status: "Coming Soon"
    };
}

async function getPaymentInfo(companyId, invoiceNumber = null) {
    try {
        // Get latest invoice if no invoice number provided
        if (!invoiceNumber) {
            const latestInvoice = await getLatestInvoice(companyId);
            if (!latestInvoice.has_data) {
                return {
                    has_data: false,
                    data_type: "payment_info",
                    message: "No invoices found. Payment information will be available once you have an invoice."
                };
            }
            invoiceNumber = latestInvoice.invoice_number;
        }

        // Get company details for payment reference
        let companyName = 'Your Company';
        try {
            const [companies] = await pool.query('SELECT CompanyName FROM Companies WHERE ID = ?', [companyId]);
            companyName = companies[0]?.CompanyName || 'Your Company';
        } catch (error) {
            console.error('Error fetching company name:', error);
        }

        // Try to get payment info from database (CompanySettings table) or use defaults
        let paymentConfig = {
            bank_name: process.env.PAYMENT_BANK_NAME || "Standard Bank",
            account_name: process.env.PAYMENT_ACCOUNT_NAME || "Stack Ops IT Solutions",
            account_number: process.env.PAYMENT_ACCOUNT_NUMBER || "1234567890",
            branch_code: process.env.PAYMENT_BRANCH_CODE || "051001",
            swift_code: process.env.PAYMENT_SWIFT_CODE || "SBZAJJXXX",
            payment_link_base: process.env.PAYMENT_LINK_BASE || "https://payments.stackopsit.co.za/invoice/"
        };

        // Try to get from CompanySettings table if it exists
        try {
            const [settings] = await pool.query(
                `SELECT SettingKey, SettingValue FROM CompanySettings 
                 WHERE CompanyID = ? AND SettingKey IN ('bank_name', 'account_name', 'account_number', 'branch_code', 'swift_code', 'payment_link_base')`,
                [companyId]
            );
            
            settings.forEach(setting => {
                if (paymentConfig.hasOwnProperty(setting.SettingKey)) {
                    paymentConfig[setting.SettingKey] = setting.SettingValue;
                }
            });
        } catch (error) {
            // Table might not exist, use environment variables or defaults
            if (error.code !== 'ER_NO_SUCH_TABLE') {
                console.error('Error fetching payment settings:', error);
            }
        }

        return {
            has_data: true,
            data_type: "payment_info",
            invoice_number: invoiceNumber,
            company_name: companyName,
            payment_reference: `INV-${invoiceNumber}`,
            bank_name: paymentConfig.bank_name,
            account_name: paymentConfig.account_name,
            account_number: paymentConfig.account_number,
            branch_code: paymentConfig.branch_code,
            payment_link: paymentConfig.payment_link_base + invoiceNumber,
            swift_code: paymentConfig.swift_code,
            instructions: `Please use invoice number ${invoiceNumber} as your payment reference when making payment.`
        };
    } catch (error) {
        console.error('Error in getPaymentInfo:', error);
        throw error;
    }
}

const ALLOWED_ACTIONS = [
    "get_latest_invoice",
    "get_all_invoices",
    "get_project_updates",
    "get_security_analytics",
    "get_ticket_status",
    "get_invoice_details",
    "get_payment_info"
];

function sanitizeResponse(text) {
    if (!text || typeof text !== 'string') {
        return "I apologize, but I'm having trouble processing that request. Could you please rephrase your question?";
    }
    
    let trimmed = text.trim();
    
    // Reject pure JSON responses
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
            JSON.parse(trimmed);
            return "I apologize, but I encountered an issue processing that. Could you please rephrase your question?";
        } catch (e) {
            // Not valid JSON, continue
        }
    }
    
    // Remove only action JSON patterns that leaked through - be very specific
    let cleaned = text.replace(/\{\s*"type"\s*:\s*"action"[^}]*\}/g, '');
    
    // Remove system markers
    cleaned = cleaned.replace(/SYSTEM\s*DATA[\s\S]*?(\n\n|$)/gi, "");
    cleaned = cleaned.replace(/Database\s*Data[\s\S]*?(\n\n|$)/gi, "");
    
    // Clean whitespace
    cleaned = cleaned.replace(/\s{3,}/g, ' ').trim();
    
    // Validate result
    if (cleaned.length < 3 || cleaned.includes('"type"') && cleaned.includes('"action"')) {
        return "I apologize, but I'm having trouble processing that request. Could you please rephrase your question?";
    }
    
    return cleaned.slice(0, 1500);
}

//==================================================================================================================================//
//                                                        Chatbot setup here                                                        //                
//==================================================================================================================================//

// Chatbot helper functions
function getClientData(clientId) {
    return new Promise(async (resolve, reject) => {
        try {
            // Get client from Users table
            const [users] = await pool.query(`
                SELECT 
                    ID AS id,
                    CompanyID AS companyId,
                    FirstName AS firstName,
                    LastName AS lastName,
                    Email AS email,
                    Contact AS contact
                FROM Users 
                WHERE ID = ? AND Role = 'client'
            `, [clientId]);
            
            if (users.length === 0) {
                return reject(new Error('Client not found'));
            }

            const companyId = users[0].companyId;
            
            const [projects] = await pool.query('SELECT * FROM Projects WHERE CompanyID = ?', [companyId]);
            const [invoices] = await pool.query('SELECT * FROM Invoices WHERE CompanyID = ?', [companyId]);
            
            // Get Duo Stats
            const [duoRows] = await pool.query(`
                SELECT cds.used_licenses, cds.total_licenses, cds.edition, cds.last_updated, cds.status 
                FROM client_duo_stats cds
                JOIN user_duo_accounts uda ON cds.id = uda.duo_id
                WHERE uda.user_id = ?
            `, [clientId]);

            resolve({
                client: {
                    id: users[0].id,
                    companyId: companyId,
                    name: `${users[0].firstName} ${users[0].lastName}`.trim(),
                    email: users[0].email,
                    phone: users[0].contact
                },
                projects: projects,
                invoices: invoices,
                duoStats: duoRows.length > 0 ? duoRows[0] : null
            });
        } catch (err) {
            reject(err);
        }
    });
}

function detectPaymentIntent(message) {
    const paymentKeywords = [
        'pay', 'payment', 'make payment', 'pay invoice', 'settle',
        'pay now', 'payment link', 'how to pay', 'where to pay',
        'want to pay', 'pay my invoice', 'clear my balance'
    ];
    
    const lowerMessage = message.toLowerCase();
    return paymentKeywords.some(keyword => lowerMessage.includes(keyword));
}

async function createPaymentLink(invoiceId, clientId, companyId, amount, description) {
    try {
        const [invoices] = await pool.query(
            'SELECT * FROM Invoices WHERE InvoiceID = ? AND CompanyID = ?',
            [invoiceId, companyId]
        );

        if (invoices.length === 0) {
            throw new Error('Invoice not found');
        }

        const invoice = invoices[0];

        if (invoice.Status === 'Paid') {
            throw new Error('Invoice is already paid');
        }

        // Get Yoco secret key
        const yocoSecretKey = process.env.YOCO_SECRET_KEY || await getSecret('YOCO_SECRET_KEY');
        if (!yocoSecretKey) {
            throw new Error('YOCO secret key not configured');
        }

        const response = await fetch('https://payments.yoco.com/api/checkouts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${yocoSecretKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: Math.round(parseFloat(amount) * 100),
                currency: 'ZAR',
                description: description || `Invoice #${invoiceId} Payment`,
                metadata: {
                    invoiceId: invoiceId.toString(),
                    client_id: clientId.toString()
                }
            })
        });

        if (!response.ok) {
            throw new Error('Failed to create payment link');
        }

        const data = await response.json();

        // Store in yoco_payments table
        await pool.query(
            "INSERT INTO yoco_payments (invoice_id, yoco_checkout_id, redirect_url, amount, status) VALUES (?, ?, ?, ?, 'pending')",
            [invoiceId, data.id, data.redirectUrl, Math.round(parseFloat(amount) * 100)]
        );

        return {
            success: true,
            paymentUrl: data.redirectUrl,
            checkoutId: data.id,
            amount: amount,
            invoiceId: invoiceId
        };

    } catch (error) {
        console.error('Payment link creation error:', error);
        throw error;
    }
}

async function createBulkPaymentLink(clientId, companyId, invoiceIds) {
    try {
        const [invoices] = await pool.query(
            `SELECT * FROM Invoices 
            WHERE InvoiceID IN (?) AND CompanyID = ? AND Status IN ('Unpaid', 'Overdue')`,
            [invoiceIds, companyId]
        );

        if (invoices.length === 0) {
            throw new Error('No unpaid invoices found');
        }

        const totalAmount = invoices.reduce((sum, inv) => sum + parseFloat(inv.TotalAmount), 0);
        const yocoSecretKey = process.env.YOCO_SECRET_KEY || await getSecret('YOCO_SECRET_KEY');
        
        if (!yocoSecretKey) {
            throw new Error('YOCO secret key not configured');
        }

        const response = await fetch('https://payments.yoco.com/api/checkouts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${yocoSecretKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: Math.round(totalAmount * 100),
                currency: 'ZAR',
                description: `Bulk Payment for ${invoices.length} Invoices`,
                metadata: {
                    invoice_ids: invoiceIds.join(','),
                    client_id: clientId.toString()
                }
            })
        });

        if (!response.ok) {
            throw new Error('Failed to create bulk payment link');
        }

        const data = await response.json();

        // Store each invoice payment
        for (const invoice of invoices) {
            await pool.query(
                "INSERT INTO yoco_payments (invoice_id, yoco_checkout_id, redirect_url, amount, status) VALUES (?, ?, ?, ?, 'pending')",
                [invoice.InvoiceID, data.id, data.redirectUrl, Math.round(parseFloat(invoice.TotalAmount) * 100)]
            );
        }

        return {
            success: true,
            paymentUrl: data.redirectUrl,
            checkoutId: data.id,
            totalAmount: totalAmount,
            invoiceCount: invoices.length
        };

    } catch (error) {
        console.error('Bulk payment link creation error:', error);
        throw error;
    }
}

// Chatbot endpoint
app.post('/api/chat', authenticateToken, chatRateLimit, async (req, res) => {
    const { message } = req.body;
    const clientId = req.user.id;
    
    if (!message) {
        return res.status(400).json({ 
            success: false,
            error: 'Message is required' 
        });
    }
    
    try {
        const clientData = await getClientData(clientId);
        
        const unpaidInvoices = clientData.invoices.filter(
            inv => inv.Status === 'Unpaid' || inv.Status === 'Overdue'
        );
        const totalOwed = unpaidInvoices.reduce(
            (sum, inv) => sum + parseFloat(inv.TotalAmount), 0
        );
        
        const wantsToMakePayment = detectPaymentIntent(message);
        
        if (wantsToMakePayment && unpaidInvoices.length > 0) {
            let paymentResponse = '';
            let paymentUrl = null;
            
            if (unpaidInvoices.length === 1) {
                const invoice = unpaidInvoices[0];
                try {
                    const payment = await createPaymentLink(
                        invoice.InvoiceID,
                        clientId,
                        clientData.client.companyId,
                        invoice.TotalAmount,
                        `Payment for Invoice #${invoice.InvoiceID}`
                    );
                    
                    paymentUrl = payment.paymentUrl;
                    paymentResponse = `I've generated a secure payment link for your invoice #${invoice.InvoiceID} (R${parseFloat(invoice.TotalAmount).toFixed(2)}).`;
                    
                } catch (error) {
                    console.error('Payment link generation error:', error);
                    paymentResponse = `I encountered an issue generating your payment link. Please contact support or try again later.`;
                }
            } else {
                try {
                    const invoiceIds = unpaidInvoices.map(inv => inv.InvoiceID);
                    const payment = await createBulkPaymentLink(
                        clientId,
                        clientData.client.companyId,
                        invoiceIds
                    );
                    
                    paymentUrl = payment.paymentUrl;
                    paymentResponse = `I've generated a payment link to settle all your outstanding invoices (${payment.invoiceCount} invoices totaling R${payment.totalAmount.toFixed(2)}).`;
                    
                } catch (error) {
                    console.error('Bulk payment link generation error:', error);
                    paymentResponse = `I encountered an issue generating your payment link. Please contact support or try again later.`;
                }
            }
            
            return res.json({
                success: true,
                message: paymentResponse,
                hasPaymentLink: true,
                paymentUrl: paymentUrl,
                totalAmount: totalOwed.toFixed(2),
                invoiceCount: unpaidInvoices.length
            });
        }
        
        const systemPrompt = `You are a helpful assistant for StackOn, a project management company. 
You have access to the following client data:

CLIENT INFO:
- Name: ${clientData.client.name}
- Email: ${clientData.client.email}
- Phone: ${clientData.client.phone}

PROJECTS (${clientData.projects.length} total):
${clientData.projects.map(p => `- "${p.Name}" - Status: ${p.Status} - ${p.Description}`).join('\n') || 'No projects yet'}

INVOICES (${clientData.invoices.length} total):
${clientData.invoices.map(i => `- Invoice #${i.InvoiceID}: R${i.TotalAmount} (${i.Status.toUpperCase()}) - Due: ${i.DueDate}`).join('\n') || 'No invoices yet'}

TOTAL OWED: R${totalOwed.toFixed(2)}

CISCO DUO STATS:
${clientData.duoStats ? `
- Edition: ${clientData.duoStats.edition}
- Status: ${clientData.duoStats.status}
- Used Licenses: ${clientData.duoStats.used_licenses}
- Total Licenses: ${clientData.duoStats.total_licenses}
- Remaining Licenses: ${Math.max(0, clientData.duoStats.total_licenses - clientData.duoStats.used_licenses)}
- Last Updated: ${clientData.duoStats.last_updated}
` : 'No Cisco Duo information available for this account.'}

Answer questions about their projects, invoices, payments, account status, and Cisco Duo license usage. 
Be friendly, helpful, and professional. Use South African Rand (R) for currency.

IMPORTANT: If they ask about making a payment, tell them you can generate a secure payment link for them instantly.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: message }
            ],
            temperature: 0.7,
            max_tokens: 500
        });
        
        const aiResponse = completion.choices[0].message.content;
        
        res.json({
            success: true,
            message: aiResponse,
            clientName: clientData.client.name,
            hasPaymentLink: false
        });
        
    } catch (error) {
        console.error('❌ Chat error:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Failed to process your message', 
            details: error.message 
        });
    }
});

//==================================================================================================================================//
//                                         public Chatbot setup here                                                                //                
//==================================================================================================================================//

// Serve static files from the project root directory
app.use(express.static(__dirname));

// Fallback to signin.html for root requests
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'signin.html'));
});

// ==================== TEST INVOICE PDF ENDPOINT (No Auth Required) ====================
app.get('/test-invoice-pdf', async (req, res) => {
    try {
        const testInvoiceData = {
            InvoiceNumber: '11',
            InvoiceDate: '2026-02-05',
            DueDate: '2026-02-12',
            TotalAmount: 100.00
        };

        const testItems = [
            {
                ServiceCategory: 'Security Audit',
                Deliverables: '0324 Audition',
                Frequency: 'Once-off',
                Rate: '12 hours',
                Total: 10.00
            },
            {
                ServiceCategory: 'Penetration Testing',
                Deliverables: 'Network Pen Test',
                Frequency: 'Once-off',
                Rate: '8 hours',
                Total: 40.00
            },
            {
                ServiceCategory: 'Vulnerability Assessment',
                Deliverables: 'Web App VA',
                Frequency: 'Once-off',
                Rate: '10 hours',
                Total: 50.00
            }
        ];

        const testCompanyData = {
            CompanyName: 'Sands Web',
            address: 'Waterfall City',
            city: 'Johannesburg',
            state: 'GP',
            zipcode: '1685'
        };

        const testClientData = {
            firstname: 'Sands',
            lastname: 'MusiQ',
            email: 'sandanindivhuwo17@gmail.com'
        };

        const pdfBuffer = await generateInvoicePDF(testInvoiceData, testItems, testCompanyData, testClientData);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="test-invoice.pdf"');
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Error generating test PDF:', error);
        res.status(500).json({ error: 'Failed to generate test PDF', details: error.message });
    }
});

// Serve test HTML page
app.get('/test-invoice', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Invoice PDF Test</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                    background: #f5f5f5;
                }
                .container {
                    max-width: 800px;
                    margin: 0 auto;
                    background: white;
                    padding: 30px;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                h1 {
                    color: #333;
                }
                .button {
                    display: inline-block;
                    background: #007bff;
                    color: white;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 4px;
                    margin: 10px 0;
                    border: none;
                    cursor: pointer;
                    font-size: 16px;
                }
                .button:hover {
                    background: #0056b3;
                }
                .instructions {
                    background: #e7f3ff;
                    border-left: 4px solid #2196F3;
                    padding: 15px;
                    margin: 20px 0;
                }
                .pdf-viewer {
                    margin-top: 30px;
                    width: 100%;
                    height: 800px;
                    border: 1px solid #ddd;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📋 Invoice PDF Test</h1>
                <p>Click the button below to preview the invoice PDF with sample data:</p>
                
                <a href="/test-invoice-pdf" target="_blank" class="button">View Test Invoice PDF</a>
                
                <div class="instructions">
                    <strong>ℹ️ How to use:</strong>
                    <ul>
                        <li>Click "View Test Invoice PDF" to open the PDF in your browser</li>
                        <li>Check the layout, spacing, and formatting</li>
                        <li>No authentication required - this is for local testing only</li>
                        <li>Edit the test data in the endpoint to test different scenarios</li>
                        <li>Make changes to the generateInvoicePDF function and reload to see updates</li>
                    </ul>
                </div>

                <h2>Live Preview:</h2>
                <iframe src="/test-invoice-pdf" class="pdf-viewer"></iframe>
            </div>
        </body>
        </html>
    `);
});

// ------------------------------------------------------------------------
// Server Startup
// ------------------------------------------------------------------------
const PORT = process.env.PORT || 8080;  // Use PORT env var for Cloud Run
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}. Supabase mode: ${useSupabase ? 'ON' : 'OFF'}`);
    console.log(`📋 Test Invoice PDF at: http://localhost:${PORT}/test-invoice`);
    
});
