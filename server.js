const bcrypt = require('bcryptjs');
const express = require('express');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
// Use the Service Role Key for server-side operations
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);
// CORRECT: Defined globally and used consistently (lowercase 'u')
const useSupabase = process.env.USE_SUPABASE === 'true'; 

// Create a connection pool to the database
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Helper function to format dates for MySQL in UTC
function formatDateToMySQL(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

// Configure Nodemailer for email sending
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (process.env.SMTP_SECURE || 'true') === 'true', // true for 465, false for 587
    auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
    }
});

// Helper function to send email
const sendEmail = async (to, subject, body, isHtml = false) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: subject,
    };
    
    if (isHtml) {
        mailOptions.html = body;
    } else {
        mailOptions.text = body;
    }
    
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}`);
    } catch (error) {
        console.error(`Failed to send email to ${to}:`, error);
    }
};

// Helper function to get user by email (works for MySQL and Supabase)
async function getUserByEmail(email) {
    if (useSupabase) { // FIXED: useSupabase
        // Supabase version (using PascalCase for consistency)
        const { data, error } = await supabase
            .from('Users') 
            .select('*')
            .eq('Email', email) 
            .maybeSingle(); 

        if (error && error.code !== 'PGRST116') { // Ignore 'no rows found' error
            console.error('Supabase getUserByEmail error:', error);
            throw error;
        }
        return data || null;
    } else {
        // MySQL version
        try {
            const [rows] = await pool.query('SELECT * FROM Users WHERE Email = ?', [email]);
            return rows[0] || null;
        } catch (err) {
            console.error('MySQL getUserByEmail error:', err);
            throw err;
        }
    }
}

// NEW FUNCTION: Helper function to check MFA Code (works for MySQL and Supabase)
async function checkMfaCode(user_id, code) {
    const now = new Date().toISOString(); 

    if (useSupabase) { // FIXED: useSupabase
        // Supabase table mfa_codes: SELECT * FROM mfa_codes WHERE user_id = ? AND code = ? AND expires_at > NOW()
        const { data, error } = await supabase
            .from('mfa_codes')
            .select('*')
            .eq('user_id', user_id)
            .eq('code', code)
            .gt('expires_at', now) 
            .maybeSingle(); 

        if (error) throw error;
        return data; // Returns object or null

    } else {
        // MySQL: SELECT * FROM mfa_codes WHERE user_id = ? AND code = ? AND expires_at > NOW()
        const [codes] = await pool.query('SELECT * FROM mfa_codes WHERE user_id = ? AND code = ? AND expires_at > NOW()', [user_id, code]);
        return codes[0]; 
    }
}

// Insert or update MFA code
async function insertMfaCode(user_id, code, expires_at) {
    if (useSupabase) { // FIXED: useSupabase
        // Supabase: Upsert ensures either insert new or update existing
        const { error } = await supabase
            .from('mfa_codes')
            .upsert({
                user_id: user_id,
                code: code,
                expires_at: expires_at.toISOString() // Supabase uses ISO date
            }, { onConflict: 'user_id' }); // column to check conflict

        if (error) {
            console.error('Supabase insertMfaCode error:', error);
            throw error;
        }
    } else {
        // MySQL version
        try {
            await pool.query(
                'INSERT INTO mfa_codes (user_id, code, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE code = VALUES(code), expires_at = VALUES(expires_at)',
                [user_id, code, expires_at]
            );
        } catch (err) {
            console.error('MySQL insertMfaCode error:', err);
            throw err;
        }
    }
}

// Seed initial availability data for the next 30 days
async function seedAvailability() {
    console.log('Checking for existing appointments...');

    let count = 0;

    if (useSupabase) { // FIXED: useSupabase
        // Supabase: SELECT COUNT(*)
        const { count: supabaseCount, error } = await supabase
            .from('appointment')
            .select('*', { count: 'exact' });

        if (error) throw error;
        count = supabaseCount;

    } else {
        // MySQL: SELECT COUNT(*)
        const [rows] = await pool.query('SELECT COUNT(*) AS count FROM appointment');
        count = rows[0].count;
    }

    if (count === 0) {
        console.log('No appointments found. Seeding availability data...');

        // FULL LOGIC TO GENERATE DATES AND TIMES
        const today = new Date();
        const dates = [];
        // Generate dates for the next 7 days
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            // Format to YYYY-MM-DD (important for MySQL/Supabase date fields)
            dates.push(date.toISOString().split('T')[0]); 
        }
        
        // Define standard available times
        const times = ['09:00:00', '10:00:00', '11:00:00', '14:00:00', '15:00:00']; 

        const insertions = [];

        for (const date of dates) {
            for (const time of times) {
                if (useSupabase) { // FIXED: useSupabase
                    // Supabase: INSERT INTO
                    insertions.push({ date, time, isAvailable: true });
                } else {
                    // MySQL: INSERT INTO
                    await pool.query('INSERT INTO appointment (date, time, isAvailable) VALUES (?, ?, ?)', [date, time, true]);
                }
            }
        }

        if (useSupabase && insertions.length > 0) {
            const { error: insertError } = await supabase
                .from('appointment')
                .insert(insertions);

            if (insertError) throw insertError;
        }

        console.log(`Seeded ${dates.length * times.length} available slots.`);
    } else {
        console.log(`Found ${count} existing appointments. Skipping seed.`);
    }
}
// Run the seeding function on server startup
seedAvailability(); 

// Serve the signup.html file when the user visits /admin/register
app.get('/admin/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

// API endpoint to get available time slots for a given date
app.get('/api/schedule', async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).send('Date is required.');
    }

    try {
        let availableTimes;

        if (useSupabase) { // FIXED: useSupabase
            // Supabase: SELECT time WHERE date = ? AND isAvailable = TRUE AND clientName IS NULL
            const { data, error } = await supabase
                .from('appointment')
                .select('time')
                .eq('date', date)
                .eq('isAvailable', true)
                .is('clientName', null);

            if (error) throw error;

            availableTimes = data.map(row => row.time);
        } else {
            // MySQL: SELECT time WHERE ...
            const [rows] = await pool.query(
                'SELECT time FROM appointment WHERE date = ? AND isAvailable = TRUE AND clientName IS NULL',
                [date]
            );
            availableTimes = rows.map(row => row.time);
        }

        res.json(availableTimes);

    } catch (error) {
        console.error('Error fetching schedule:', error);
        res.status(500).send('Server error.');
    }
})

// API endpoint to book a consultation
app.post('/api/book', async (req, res) => {
    const { date, time, name, email, service, message } = req.body;
    
    // 💡 Declared outside conditional blocks
    let updateSuccessful = false;
    let result; 

    try {
        if (useSupabase) { // FIXED: useSupabase
            // NOTE: Supabase requires adding .select() to UPDATE calls 
            // to reliably return the number of affected rows (data array).
            const { data, error } = await supabase
                .from('appointment')
                .update({ isAvailable: false, clientName: name, email, service, message })
                .eq('date', date)
                .eq('time', time)
                .eq('isAvailable', true)
                .select(); // Crucial for checking affected rows

            if (error) throw error;
            
            // Supabase check: if data array is empty, no row was updated
            if (data && data.length > 0) {
                updateSuccessful = true;
            }

        } else {
            // MySQL block
            [result] = await pool.query(
                'UPDATE appointment SET isAvailable = FALSE, clientName = ?, email = ?, service = ?, message = ? WHERE date = ? AND time = ? AND isAvailable = TRUE',
                [name, email, service, message, date, time]
            );
            
            // Check MySQL affectedRows 
            if (result.affectedRows > 0) {
                updateSuccessful = true;
            }
        }
        
        // --- Centralized Conflict/Failure Check ---
        if (!updateSuccessful) {
            return res.status(409).send('The selected time slot is no longer available. Please choose another.');
        }

        // --- Success Logic (Runs ONLY if updateSuccessful is true) ---
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
        
        const adminNotification = `New Consultation Booking:\n\n- Name: ${name}\n- Email: ${email}\n- Date: ${date}\n- Time: ${time}\n- Service: ${service}\n- Notes: ${message || 'N/A'}`;
        
        await sendEmail(email, 'Booking Confirmation', clientConfirmation, true);
        await sendEmail(process.env.EMAIL_USER, 'New Consultation Booking', adminNotification);
        
        res.status(200).send('Booking successful!');
        
    } catch (error) {
        console.error('Booking error:', error);
        res.status(500).send('Failed to book consultation.');
    }
});

// API endpoint for admin to get all bookings
app.get('/api/admin/bookings', async (req, res) => {
    // Admin authentication/authorization check should be here

    try {
        let bookings;

        if (useSupabase) { // FIXED: useSupabase
            // Supabase: SELECT date, time, clientName as name, email, service, message WHERE clientName IS NOT NULL ORDER BY date DESC, time ASC
            const { data, error } = await supabase
                .from('appointment')
                .select('date, time, clientName:clientName, email, service, message') 
                .not('clientName', 'is', null)
                .order('date', { ascending: false })
                .order('time', { ascending: true });

            if (error) throw error;
            bookings = data;
        } else {
            // MySQL: SELECT ... WHERE clientName IS NOT NULL ORDER BY ...
            const [rows] = await pool.query('SELECT date, time, clientName as name, email, service, message FROM appointment WHERE clientName IS NOT NULL ORDER BY date DESC, time ASC');
            bookings = rows;
        }

        res.json(bookings);
    } catch (error) {
        console.error('Error fetching admin bookings:', error);
        res.status(500).send('Server error.');
    }
});

// API endpoint for admin to manage availability
app.post('/api/admin/availability', async (req, res) => {
    // Admin authentication/authorization check should be here

    const { date, time } = req.body;
    let { isAvailable } = req.body; 
    
    // CRITICAL FIX: Ensure isAvailable is a strict boolean, accounting for potential 
    // string input (e.g., "true" or "false") from client-side JavaScript/AJAX.
    if (isAvailable !== undefined) {
        // If it's the string "true" or the boolean true, set it to true. Otherwise, set it to false.
        isAvailable = (isAvailable === true || isAvailable === 'true');
    }

    if (!date || !time || isAvailable === undefined) {
        return res.status(400).send('Missing required availability data.');
    }

    try {
        if (useSupabase) { // FIXED: useSupabase
            // Supabase: UPDATE appointment SET isAvailable = ?, clientName = NULL, ... WHERE date = ? AND time = ?
            const { error } = await supabase
                .from('appointment')
                .update({ isAvailable, clientName: null, email: null, service: null, message: null })
                .eq('date', date)
                .eq('time', time);

            if (error) throw error;
        } else {
            // MySQL: UPDATE appointment SET ... WHERE date = ? AND time = ?
            await pool.query(
                'UPDATE appointment SET isAvailable = ?, clientName = NULL, email = NULL, service = NULL, message = NULL WHERE date = ? AND time = ?',
                [isAvailable, date, time]
            );
        }

        res.status(200).send('Availability updated successfully.');
    } catch (error) {
        console.error('Error updating availability:', error);
        res.status(500).send('Server error.');
    }
});

// NEW: JWT authentication middleware to protect routes
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        // Return 401 Unauthorized for API calls
        if (req.originalUrl.startsWith('/api')) {
             return res.status(401).json({ success: false, message: 'Unauthorized: No token provided.' });
        }
        // Redirect for non-API routes (like HTML pages)
        return res.redirect('/signin.html');
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
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

// MODIFIED: Consolidated sign-in endpoint to handle password verification and MFA code sending
app.post('/api/auth/signin', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Step 1: Check if user exists (using wrapped function)
        const user = await getUserByEmail(email);
        
        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid email or password" });
        }
        
        // Step 2: Compare password
        const validPassword = await bcrypt.compare(password, user.passWord);
        
        if (!validPassword) {
            return res.status(400).json({ success: false, message: "Invalid email or password" });
        }
        
        // Step 3: Generate and store MFA code
        const mfaCode = Math.floor(100000 + Math.random() * 900000);
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + 10 * 60000); // 10 minutes
        
        await insertMfaCode(user.ID, mfaCode, expiresAt);
        
        // Step 4: Send email with MFA code
        await sendEmail(user.Email, 'Your MFA Code', `Your MFA code is ${mfaCode}. It will expire in 10 minutes.`);
        
        // Step 5: Respond to the client, telling them to verify the MFA code
        res.json({ success: true, message: "MFA code sent. Please check your email to verify your login." });
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// MODIFIED: MFA verification now issues the JWT token upon success
app.post('/api/auth/verify-mfa', async (req, res) => {
    try {
        const { email, code } = req.body;
        
        if (!email || !code) {
            return res.status(400).json({ success: false, message: 'Email and code are required.' });
        }
        
        // Step 1: Find user (using wrapped function)
        const user = await getUserByEmail(email);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        
        // Step 2: Check MFA code validity (using wrapped function)
        const validCode = await checkMfaCode(user.ID, code);

        if (!validCode) {
            return res.status(400).json({ success: false, message: 'Invalid or expired code.' });
        }
        
        // Step 3: Delete MFA code upon successful verification
        if (useSupabase) { // FIXED: useSupabase
            const { error } = await supabase
                .from('mfa_codes')
                .delete()
                .eq('user_id', user.ID);

            if (error) throw error;
        } else {
            await pool.query('DELETE FROM mfa_codes WHERE user_id = ?', [user.ID]);
        }

        // Step 4: Issue JWT token
        const accessToken = jwt.sign({ id: user.ID, email: user.Email, role: user.Role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

        // Step 5: Determine redirect and respond
        const adminEmails = ['takiesandani@gmail.com', 'info@stackopsit.co.za'];
        const isAdmin = adminEmails.includes(user.Email.toLowerCase());

        res.json({
            success: true,
            message: 'Authentication successful!',
            accessToken: accessToken,
            redirect: isAdmin ? '/Admin.html' : '/ClientPortal.html'
        });
        
    } catch (error) {
        console.error('MFA verification error:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
});


// NEW: Protect the Client Portal route with the authentication middleware
app.get('/ClientPortal.html', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'ClientPortal.html'));
});

// CRITICAL FIX: Wrapped the entire transaction logic for dual-database support
app.post('/api/admin/register-client', async (req, res) => {
    const {
        firstName, lastName, email, contact, password,
        companyName, website, industry, address, city, state, zipCode, country
    } = req.body;
    
    if (!firstName || !lastName || !email || !password || !companyName) {
        return res.status(400).json({ success: false, message: 'Missing required client or company details.' });
    }
    
    // Step 1: Hash the password (common to both DBs)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    let registrationSuccessful = false;

    try {
        if (useSupabase) { // FIXED: useSupabase Logic
            // Step 2a: Insert the company
            const { data: companyData, error: companyError } = await supabase
                .from('Companies')
                .insert([{ CompanyName: companyName, Website: website, Industry: industry, Address: address, City: city, State: state, ZipCode: zipCode, Country: country }])
                .select('ID') 
                .single();
                
            if (companyError) throw companyError;
            
            const companyId = companyData.ID;
            
            // Step 2b: Insert the user, linking to the new company
            const { error: userError } = await supabase
                .from('Users')
                .insert([{ 
                    FirstName: firstName, 
                    LastName: lastName, 
                    Email: email, 
                    Contact: contact, 
                    passWord: hashedPassword, 
                    isActive: true, 
                    Role: 'client', 
                    CompanyID: companyId 
                }]);
                
            if (userError) throw userError;
            registrationSuccessful = true;

        } else {
            // MySQL Transaction Logic
            const connection = await pool.getConnection();
            
            try {
                await connection.beginTransaction();

                // Step 2a: Insert the company
                const [companyResult] = await connection.query(
                    `INSERT INTO Companies (CompanyName, Website, Industry, Address, City, State, ZipCode, Country)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [companyName, website, industry, address, city, state, zipCode, country]
                );
                
                const companyId = companyResult.insertId;
                
                // Step 2b: Insert the user, linking to the new company
                await connection.query(
                    `INSERT INTO Users (FirstName, LastName, Email, Contact, passWord, isActive, Role, CompanyID)
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
        }
        
        if (registrationSuccessful) {
            // Step 3: Send confirmation email to the new client (common to both DBs)
            const loginLink = "https://stackopsit.co.za/ClientPortal.html";
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
                    .footer { text-align: center; font-size: 0.8em; color: #888; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
                    a { color: #007bff; text-decoration: none; }
                    .button { display: inline-block; padding: 10px 20px; margin-top: 15px; background-color: #007bff; color: white !important; text-decoration: none; border-radius: 5px; }
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
                                <p><strong>Password:</strong> The password you provided during registration (please change it immediately after first login).</p>
                            </div>
                            <p>Click here to get started:</p>
                            <p><a href="${loginLink}" class="button">Client Portal Login</a></p>
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
        // The MySQL rollback/release is handled inside the try/catch/finally block for MySQL
        console.error('Registration failed:', error);
        res.status(500).json({ success: false, message: 'Failed to register client. Please check the provided information.' });
    }
});

// Add a new GET endpoint to serve the forgot-password page
app.get('/forgot-password.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'forgot-password.html'));
});

// Endpoint to handle the password reset request (Step 1: Send token)
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    try {
        const user = await getUserByEmail(email);

        if (!user) {
            // Send a generic message to prevent user enumeration
            return res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
        }

        // Generate a password reset token
        const resetToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

        // WRAPPED: Store the token in the database (Insert/Update)
        if (useSupabase) { // FIXED: useSupabase
            const { error } = await supabase
                .from('password_resets')
                .upsert({
                    user_id: user.ID,
                    token: resetToken,
                    expires_at: expiresAt.toISOString()
                }, { onConflict: 'user_id' });

            if (error) throw error;
        } else {
            // MySQL version with ON DUPLICATE KEY UPDATE
            await pool.query(
                `INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at)`,
                [user.ID, resetToken, expiresAt] 
            );
        }

        // Create the password reset link
        const resetLink = `https://stackopsit.co.za/reset-password.html?token=${resetToken}`;

        // Send the email (common logic)
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

// Endpoint to verify the token and serve the password change page
app.get('/reset-password.html', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send('Invalid or missing token.');
    }

    try {
        let tokens;
        const now = new Date().toISOString();

        if (useSupabase) { // FIXED: useSupabase
            const { data, error } = await supabase
                .from('password_resets')
                .select('*')
                .eq('token', token)
                .gt('expires_at', now)
                .maybeSingle();

            if (error) throw error;
            tokens = data ? [data] : [];
        } else {
            // MySQL version
            [tokens] = await pool.query(
                'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()',
                [token]
            );
        }

        if (tokens.length === 0) {
            return res.status(400).send('Invalid or expired password reset link.');
        }

        // Token is valid, serve the password reset form
        res.sendFile(path.join(__dirname, 'reset-password.html'));
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).send('Server error. Please try again.');
    }
});

// Endpoint to handle the password update (Step 2: Update password)
app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }

    try {
        let userId;

        if (useSupabase) { // FIXED: useSupabase
            // Step 1: Find the user and token
            const now = new Date().toISOString();
            const { data: tokenData, error: tokenError } = await supabase
                .from('password_resets')
                .select('user_id')
                .eq('token', token)
                .gt('expires_at', now)
                .maybeSingle();

            if (tokenError) throw tokenError;

            if (!tokenData) {
                return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
            }
            userId = tokenData.user_id;

            // Step 2: Hash the new password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            // Step 3: Update the user's password
            const { error: updateError } = await supabase
                .from('Users')
                .update({ passWord: hashedPassword })
                .eq('ID', userId);

            if (updateError) throw updateError;

            // Step 4: Delete the used token
            const { error: deleteError } = await supabase
                .from('password_resets')
                .delete()
                .eq('token', token);
            
            if (deleteError) throw deleteError;

        } else {
            // ORIGINAL MYSQL LOGIC (using transaction)
            const connection = await pool.getConnection();

            try {
                await connection.beginTransaction();

                // Find the user and token
                const [tokens] = await connection.query(
                    'SELECT user_id FROM password_resets WHERE token = ? AND expires_at > NOW()',
                    [token]
                );

                if (tokens.length === 0) {
                    await connection.rollback();
                    return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
                }

                userId = tokens[0].user_id;

                // Hash the new password
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(newPassword, salt);

                // Update the user's password
                await connection.query('UPDATE Users SET passWord = ? WHERE ID = ?', [hashedPassword, userId]);

                // Delete the used token
                await connection.query('DELETE FROM password_resets WHERE token = ?', [token]);

                await connection.commit();
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        }
        
        res.status(200).json({ success: true, message: 'Password has been successfully updated!' });

    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ success: false, message: 'Failed to reset password.' });
    }
});


app.post('/api/contact-message', async (req, res) => {
    const { firstName, lastName, company, email, contact, service, message } = req.body;

    // Trim all fields before validation
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
        // Send to your admin email
       // The fourth argument 'true' tells the helper function to use the 'html' property
        await sendEmail(process.env.EMAIL_USER, `New Inquiry: ${company} - ${service}`, emailBody, true);

        res.json({ success: true });
    } catch (error) {
        console.error('Contact message error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message.' });
    }
});


// ------------------------------------------------------------------------
// Server Startup
// ------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}. Supabase mode: ${useSupabase ? 'ON' : 'OFF'}`));