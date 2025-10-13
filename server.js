const bcrypt = require('bcryptjs');
const express = require('express');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken'); // New: Import jsonwebtoken
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

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
    
    // Use the 'html' property for HTML emails, and 'text' for plain text
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

// Seed initial availability data for the next 30 days
const seedAvailability = async () => {
    try {
        const [rows] = await pool.query('SELECT COUNT(*) AS count FROM appointment');
        if (rows[0].count === 0) {
            const today = new Date();
            const allTimes = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
            
            for (let i = 0; i < 30; i++) {
                const date = new Date(today);
                date.setDate(today.getDate() + i);
                
                const dayOfWeek = date.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) { // Skip weekends
                    continue;
                }
                
                for (const time of allTimes) {
                    await pool.query('INSERT INTO appointment (date, time, isAvailable) VALUES (?, ?, ?)', [date, time, true]);
                }
            }
            console.log("Initial availability data seeded.");
        }
    } catch (error) {
        console.error("Error seeding data:", error);
    }
};

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
        const [rows] = await pool.query('SELECT time FROM appointment WHERE date = ? AND isAvailable = TRUE AND clientName IS NULL', [date]);
        const availableTimes = rows.map(row => row.time.substring(0, 5));
        res.json(availableTimes);
    } catch (error) {
        res.status(500).send('Server error.');
    }
});

// API endpoint to book a consultation
app.post('/api/book', async (req, res) => {
    const { date, time, name, email, service, message } = req.body;
    try {
        const [result] = await pool.query(
            'UPDATE appointment SET isAvailable = FALSE, clientName = ?, email = ?, service = ?, message = ? WHERE date = ? AND time = ? AND isAvailable = TRUE',
            [name, email, service, message, date, time]
        );
        
        if (result.affectedRows === 0) {
            return res.status(409).send('The selected time slot is no longer available. Please choose another.');
        }
        
        const clientConfirmation = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    /* Your styles here */
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="content">
                        <p>Hello ${name},</p>
                        <p>Your consultation with Stackops IT Solutions has been successfully booked for ${date} at ${time}. We look forward to speaking with you!</p>
                        <p>Best regards,</p>
                    </div>
                    
                    <a href="https://ibb.co/svhskdP8"><img src="https://i.ibb.co/JRNr0wdD/Email-Message.png" alt="Email-Message" border="0"></a>
                    
                    <div class="footer">
                        <p>StackOps IT Solutions (Pty) Ltd | Reg. No: 2016/120370/07 | B-BBEE Level: 1 Contributor: 135% | CSD Supplier: MAAA1641244</p>
                        <p>Legally registered in South Africa, providing IT support, cybersecurity, governance, infrastructure, consulting services, and procurement of IT hardware in compliance with all applicable laws and regulations. All client information is protected in accordance with the Protection of Personal Information Act (POPIA) and our internal privacy and security policies. We are committed to safeguarding your data and ensuring confidentiality, integrity, and lawful processing at all times. All information, proposals, and pricing are accurate at the time of sending and governed by our Master Service Agreement (MSA) or client-specific contracts. Prices may be subject to change due to economic, regulatory, or supplier factors, with clients notified in advance. This email and attachments are confidential and intended solely for the named recipient(s). If received in error, please notify the sender immediately, delete the message, and do not disclose, copy, or distribute its contents. Unauthorized use of this communication is strictly prohibited. Emails are not guaranteed virus-free; StackOps IT Solutions accepts no liability for any damage, loss, or unauthorized access arising from this communication. StackOps IT Solutions is committed to business continuity, data security, and reliable technology operations. Our team provides professional, ethical, and transparent IT services, ensuring measurable value, operational efficiency, and compliance with industry best practices.</p>
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
    try {
        const [rows] = await pool.query('SELECT date, time, clientName as name, email, service, message FROM appointment WHERE clientName IS NOT NULL ORDER BY date DESC, time ASC');
        res.json(rows);
    } catch (error) {
        res.status(500).send('Failed to fetch bookings.');
    }
});

// API endpoint for admin to manage availability
app.post('/api/admin/availability', async (req, res) => {
    const { date, time, isAvailable } = req.body;
    try {
        const [result] = await pool.query(
            'UPDATE appointment SET isAvailable = ?, clientName = NULL, email = NULL, service = NULL, message = NULL WHERE date = ? AND time = ?',
            [isAvailable, date, time]
        );
        
        if (result.affectedRows === 0) {
            // If no rows were updated, it means the slot doesn't exist. Let's create it.
            if (isAvailable) {
                await pool.query('INSERT INTO appointment (date, time, isAvailable) VALUES (?, ?, ?)', [date, time, true]);
            }
        }
        res.status(200).send('Availability updated.');
    } catch (error) {
        console.error('Admin availability update error:', error);
        res.status(500).send('Failed to update availability.');
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

        // Step 1: Check if user exists
        const [results] = await pool.query("SELECT * FROM Users WHERE email = ?", [email]);
        
        if (results.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid email or password" });
        }
        
        const user = results[0];
        
        // Step 2: Compare password
        const validPassword = await bcrypt.compare(password, user.passWord);
        
        if (!validPassword) {
            return res.status(400).json({ success: false, message: "Invalid email or password" });
        }
        
        // Step 3: Generate and store MFA code
        const mfaCode = Math.floor(100000 + Math.random() * 900000);
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + 10 * 60000); // 10 minutes
        
        await pool.query(
            `INSERT INTO mfa_codes (user_id, code, created_at, expires_at)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE code = ?, created_at = ?, expires_at = ?`,
            [user.ID, mfaCode, createdAt, expiresAt, mfaCode, createdAt, expiresAt]
        );
        
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
        
        const [users] = await pool.query('SELECT * FROM Users WHERE Email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const user = users[0];
        
        const [codes] = await pool.query(
            'SELECT * FROM mfa_codes WHERE user_id = ? AND code = ? AND expires_at > NOW()',
            [user.ID, code]
        );
        
        if (codes.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or expired code.' });
        }
        
        await pool.query('DELETE FROM mfa_codes WHERE user_id = ?', [user.ID]);
        
        const accessToken = jwt.sign({ id: user.ID, email: user.Email, role: user.Role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

        // Only allow admin access for specific emails
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

// Add this new endpoint to your existing Express app
app.post('/api/admin/register-client', async (req, res) => {
    const {
        firstName, lastName, email, contact, password,
        companyName, website, industry, address, city, state, zipCode, country
    } = req.body;
    
    if (!firstName || !lastName || !email || !password || !companyName) {
        return res.status(400).json({ success: false, message: 'Missing required client or company details.' });
    }
    
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        // Step 1: Insert the company
        const [companyResult] = await connection.query(
            `INSERT INTO Companies (CompanyName, Website, Industry, Address, City, State, ZipCode, Country)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyName, website, industry, address, city, state, zipCode, country]
        );
        
        const companyId = companyResult.insertId;
        
        // Step 2: Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Step 3: Insert the user, linking to the new company
        await connection.query(
            `INSERT INTO Users (FirstName, LastName, Email, Contact, passWord, isActive, Role, CompanyID)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [firstName, lastName, email, contact, hashedPassword, 1, 'client', companyId]
        );
        
        // Step 4: Send confirmation email to the new client
        const loginLink = "https://stackopsit.co.za/ClientPortal.html";
        const emailBody = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .email-container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
                .header { background-color: #f4f4f4; padding: 10px 20px; text-align: center; border-radius: 8px 8px 0 0; }
                .header h2 { margin: 0; color: #555; }
                .content { padding: 20px; }
                .credentials { background-color: #e9e9e9; padding: 15px; border-left: 5px solid #007bff; margin: 20px 0; }
                .credentials p { margin: 5px 0; }
                .footer { text-align: center; font-size: 0.8em; color: #888; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
                a { color: #007bff; text-decoration: none; }
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
                            <p><strong>Password:</strong> ${password}</p>
                        </div>
                        <p>Please log in and change your password immediately to secure your account.</p>
                        <p>Click here to get started: <a href="${loginLink}">Client Portal Login</a></p>
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
        
        await connection.commit();
        res.status(200).json({ success: true, message: 'Client and company registered successfully. Login credentials emailed.' });
        
    } catch (error) {
        await connection.rollback();
        console.error('Registration failed:', error);
        res.status(500).json({ success: false, message: 'Failed to register client. Please check the provided information.' });
    } finally {
        connection.release();
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
        const [users] = await pool.query('SELECT * FROM Users WHERE Email = ?', [email]);
        if (users.length === 0) {
            // Send a generic message to prevent user enumeration
            return res.status(200).json({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' });
        }

        const user = users[0];

        // Generate a password reset token
        const resetToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

        // Store the token in the database
        await pool.query(
            `INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE token = ?, expires_at = ?`,
            [user.ID, resetToken, expiresAt, resetToken, expiresAt]
        );

        // Create the password reset link
        const resetLink = `https://stackopsit.co.za/reset-password.html?token=${resetToken}`;

        // Send the email
        const emailBody = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; }
                    .email-container { max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
                    .content { padding: 20px; }
                    .button { display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="email-container">
                    <div class="content">
                        <p>Hello,</p>
                        <p>You have requested to reset your password. Please click the button below to proceed:</p>
                        <p><a href="${resetLink}" class="button">Reset Password</a></p>
                        <p>This link will expire in 1 hour. If you did not request this, please ignore this email.</p>
                        <p>Best regards,<br>The StackOps IT Team</p>
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
        const [tokens] = await pool.query(
            'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()',
            [token]
        );

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

        const userId = tokens[0].user_id;

        // Hash the new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update the user's password
        await connection.query('UPDATE Users SET passWord = ? WHERE ID = ?', [hashedPassword, userId]);

        // Delete the used token
        await connection.query('DELETE FROM password_resets WHERE token = ?', [token]);

        await connection.commit();

        res.status(200).json({ success: true, message: 'Password has been successfully updated!' });

    } catch (error) {
        await connection.rollback();
        console.error('Password reset error:', error);
        res.status(500).json({ success: false, message: 'Failed to reset password.' });
    } finally {
        connection.release();
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


// ------------------------------------------------------------------
// CRITICAL FIX FOR CLOUD RUN STARTUP PROBE
// ------------------------------------------------------------------

const startServer = async () => {
    let connection;
    try {
        // 1. Check Database Connection & Run Seed Logic
        // Get a connection to explicitly ensure the DB is reachable via the Cloud SQL Proxy
        connection = await pool.getConnection(); 
        console.log("Database connection established successfully.");
        connection.release(); // Release the connection back to the pool

        // Now that connectivity is confirmed, run the seed logic
        await seedAvailability(); 

        // 2. Start the Express Server
        // Use 8080 as the standard port for Cloud Run
        const PORT = process.env.PORT || 8080; 
        
        app.listen(PORT, () => {
            console.log(`Server successfully running on port ${PORT}`);
        });

    } catch (error) {
        // If the server fails to connect to the DB or initialize, log it and exit
        console.error("FATAL: Server failed to start due to error:", error);
        if (connection) connection.release();
        // Exiting with code 1 tells the container scheduler to treat this as a failed start
        process.exit(1); 
    }
};

// Start the sequence
startServer();
