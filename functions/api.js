const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Configure Nodemailer
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (process.env.SMTP_SECURE || 'true') === 'true',
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
        return true;
    } catch (error) {
        console.error(`Failed to send email to ${to}:`, error);
        return false;
    }
};

// Helper function to format dates for PostgreSQL
function formatDateToPostgreSQL(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

// Seed initial availability data for the next 30 days
const seedAvailability = async () => {
    try {
        const result = await pool.query('SELECT COUNT(*) AS count FROM appointment');
        if (parseInt(result.rows[0].count) === 0) {
            const today = new Date();
            const allTimes = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
            
            for (let i = 0; i < 30; i++) {
                const date = new Date(today);
                date.setDate(today.getDate() + i);
                
                const dayOfWeek = date.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    continue;
                }
                
                for (const time of allTimes) {
                    await pool.query(
                        'INSERT INTO appointment (date, time, isAvailable) VALUES ($1, $2, $3)',
                        [date.toISOString().split('T')[0], time, true]
                    );
                }
            }
            console.log("Initial availability data seeded.");
        }
    } catch (error) {
        console.error("Error seeding data:", error);
    }
};

// Initialize on first run
seedAvailability();

exports.handler = async (event, context) => {
    // Handle CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    const path = event.path.replace('/.netlify/functions/api', '').replace('/api', '');
    
    try {
        // API endpoint to get available time slots for a given date
        if (event.httpMethod === 'GET' && path === '/schedule') {
            const { date } = event.queryStringParameters;
            if (!date) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Date is required.' })
                };
            }
            
            const result = await pool.query(
                'SELECT time FROM appointment WHERE date = $1 AND isAvailable = TRUE AND clientName IS NULL', 
                [date]
            );
            const availableTimes = result.rows.map(row => row.time.substring(0, 5));
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(availableTimes)
            };
        }

        // API endpoint to book a consultation
        if (event.httpMethod === 'POST' && path === '/book') {
            const { date, time, name, email, service, message } = JSON.parse(event.body);
            
            const result = await pool.query(
                `UPDATE appointment SET isAvailable = FALSE, clientName = $1, email = $2, service = $3, message = $4 
                 WHERE date = $5 AND time = $6 AND isAvailable = TRUE`,
                [name, email, service, message, date, time]
            );
            
            if (result.rowCount === 0) {
                return {
                    statusCode: 409,
                    headers,
                    body: JSON.stringify({ error: 'The selected time slot is no longer available. Please choose another.' })
                };
            }
            
            const clientConfirmation = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
                        .content { padding: 20px; }
                        .footer { margin-top: 20px; padding: 20px; background: #f4f4f4; font-size: 12px; }
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
                            <p>Legally registered in South Africa, providing IT support, cybersecurity, governance, infrastructure, consulting services, and procurement of IT hardware in compliance with all applicable laws and regulations. All client information is protected in accordance with the Protection of Personal Information Act (POPIA) and our internal privacy and security policies. We are committed to safeguarding your data and ensuring confidentiality, integrity, and lawful processing at all times.</p>
                        </div>
                    </div>
                </body>
                </html>
            `;
            
            const adminNotification = `New Consultation Booking:\n\n- Name: ${name}\n- Email: ${email}\n- Date: ${date}\n- Time: ${time}\n- Service: ${service}\n- Notes: ${message || 'N/A'}`;
            
            await sendEmail(email, 'Booking Confirmation', clientConfirmation, true);
            await sendEmail(process.env.EMAIL_USER, 'New Consultation Booking', adminNotification);
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ message: 'Booking successful!' })
            };
        }

        // API endpoint for admin to get all bookings
        if (event.httpMethod === 'GET' && path === '/admin/bookings') {
            const result = await pool.query(
                'SELECT date, time, clientName as name, email, service, message FROM appointment WHERE clientName IS NOT NULL ORDER BY date DESC, time ASC'
            );
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(result.rows)
            };
        }

        // API endpoint for admin to manage availability
        if (event.httpMethod === 'POST' && path === '/admin/availability') {
            const { date, time, isAvailable } = JSON.parse(event.body);
            
            const result = await pool.query(
                'UPDATE appointment SET isAvailable = $1, clientName = NULL, email = NULL, service = NULL, message = NULL WHERE date = $2 AND time = $3',
                [isAvailable, date, time]
            );
            
            if (result.rowCount === 0 && isAvailable) {
                await pool.query(
                    'INSERT INTO appointment (date, time, isAvailable) VALUES ($1, $2, $3)',
                    [date, time, true]
                );
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ message: 'Availability updated.' })
            };
        }

        // Consolidated sign-in endpoint
        if (event.httpMethod === 'POST' && path === '/auth/signin') {
            const { email, password } = JSON.parse(event.body);

            const result = await pool.query("SELECT * FROM Users WHERE email = $1", [email]);
            
            if (result.rows.length === 0) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, message: "Invalid email or password" })
                };
            }
            
            const user = result.rows[0];
            const validPassword = await bcrypt.compare(password, user.password);
            
            if (!validPassword) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, message: "Invalid email or password" })
                };
            }
            
            const mfaCode = Math.floor(100000 + Math.random() * 900000);
            const createdAt = new Date();
            const expiresAt = new Date(createdAt.getTime() + 10 * 60000);
            
            await pool.query(
                `INSERT INTO mfa_codes (user_id, code, created_at, expires_at)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (user_id) 
                 DO UPDATE SET code = $2, created_at = $3, expires_at = $4`,
                [user.id, mfaCode, createdAt, expiresAt]
            );
            
            await sendEmail(user.email, 'Your MFA Code', `Your MFA code is ${mfaCode}. It will expire in 10 minutes.`);
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: "MFA code sent. Please check your email to verify your login." })
            };
        }

        // MFA verification endpoint
        if (event.httpMethod === 'POST' && path === '/auth/verify-mfa') {
            const { email, code } = JSON.parse(event.body);
            
            if (!email || !code) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Email and code are required.' })
                };
            }
            
            const usersResult = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);
            if (usersResult.rows.length === 0) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ success: false, message: 'User not found.' })
                };
            }
            
            const user = usersResult.rows[0];
            const codesResult = await pool.query(
                'SELECT * FROM mfa_codes WHERE user_id = $1 AND code = $2 AND expires_at > NOW()',
                [user.id, code]
            );
            
            if (codesResult.rows.length === 0) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Invalid or expired code.' })
                };
            }
            
            await pool.query('DELETE FROM mfa_codes WHERE user_id = $1', [user.id]);
            
            const accessToken = jwt.sign(
                { id: user.id, email: user.email, role: user.role }, 
                process.env.ACCESS_TOKEN_SECRET, 
                { expiresIn: '1h' }
            );

            const adminEmails = ['takiesandani@gmail.com', 'info@stackopsit.co.za'];
            const isAdmin = adminEmails.includes(user.email.toLowerCase());

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Authentication successful!',
                    accessToken: accessToken,
                    redirect: isAdmin ? '/Admin.html' : '/ClientPortal.html'
                })
            };
        }

        // Register client endpoint
        if (event.httpMethod === 'POST' && path === '/admin/register-client') {
            const {
                firstName, lastName, email, contact, password,
                companyName, website, industry, address, city, state, zipCode, country
            } = JSON.parse(event.body);
            
            if (!firstName || !lastName || !email || !password || !companyName) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Missing required client or company details.' })
                };
            }
            
            const client = await pool.connect();
            
            try {
                await client.query('BEGIN');
                
                // Insert company
                const companyResult = await client.query(
                    `INSERT INTO Companies (CompanyName, Website, Industry, Address, City, State, ZipCode, Country)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                    [companyName, website, industry, address, city, state, zipCode, country]
                );
                
                const companyId = companyResult.rows[0].id;
                
                // Hash password
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(password, salt);
                
                // Insert user
                await client.query(
                    `INSERT INTO Users (FirstName, LastName, Email, Contact, password, isActive, Role, CompanyID)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [firstName, lastName, email, contact, hashedPassword, true, 'client', companyId]
                );
                
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
                await client.query('COMMIT');
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ success: true, message: 'Client and company registered successfully. Login credentials emailed.' })
                };
                
            } catch (error) {
                await client.query('ROLLBACK');
                console.error('Registration failed:', error);
                
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Failed to register client. Please check the provided information.' })
                };
            } finally {
                client.release();
            }
        }

        // Forgot password endpoint
        if (event.httpMethod === 'POST' && path === '/auth/forgot-password') {
            const { email } = JSON.parse(event.body);
            if (!email) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Email is required.' })
                };
            }

            try {
                const usersResult = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);
                if (usersResult.rows.length === 0) {
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' })
                    };
                }

                const user = usersResult.rows[0];
                const resetToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
                const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

                await pool.query(
                    `INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)
                     ON CONFLICT (user_id) 
                     DO UPDATE SET token = $2, expires_at = $3`,
                    [user.id, resetToken, expiresAt]
                );

                const resetLink = `https://stackopsit.co.za/reset-password.html?token=${resetToken}`;

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

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ success: true, message: 'If an account with that email exists, a password reset link has been sent.' })
                };
            } catch (error) {
                console.error('Forgot password error:', error);
                
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Server error. Please try again.' })
                };
            }
        }

        // Reset password endpoint
        if (event.httpMethod === 'POST' && path === '/auth/reset-password') {
            const { token, newPassword } = JSON.parse(event.body);

            if (!token || !newPassword) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Token and new password are required.' })
                };
            }

            const client = await pool.connect();

            try {
                await client.query('BEGIN');

                const tokensResult = await client.query(
                    'SELECT user_id FROM password_resets WHERE token = $1 AND expires_at > NOW()',
                    [token]
                );

                if (tokensResult.rows.length === 0) {
                    await client.query('ROLLBACK');
                    
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ success: false, message: 'Invalid or expired token.' })
                    };
                }

                const userId = tokensResult.rows[0].user_id;
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(newPassword, salt);

                await client.query('UPDATE Users SET password = $1 WHERE id = $2', [hashedPassword, userId]);
                await client.query('DELETE FROM password_resets WHERE token = $1', [token]);
                await client.query('COMMIT');

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ success: true, message: 'Password has been successfully updated!' })
                };

            } catch (error) {
                await client.query('ROLLBACK');
                console.error('Password reset error:', error);
                
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Failed to reset password.' })
                };
            } finally {
                client.release();
            }
        }

        // Contact message endpoint
        if (event.httpMethod === 'POST' && path === '/contact-message') {
            const { firstName, lastName, company, email, contact, service, message } = JSON.parse(event.body);

            if (
                !firstName?.trim() ||
                !lastName?.trim() ||
                !company?.trim() ||
                !email?.trim() ||
                !contact?.trim() ||
                !service?.trim() ||
                !message?.trim()
            ) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, message: 'All fields are required.' })
                };
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
                await sendEmail(process.env.EMAIL_USER, `New Inquiry: ${company} - ${service}`, emailBody, true);

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ success: true })
                };
            } catch (error) {
                console.error('Contact message error:', error);
                
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Failed to send message.' })
                };
            }
        }

        // Route not found
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({ error: 'Route not found' })
        };

    } catch (error) {
        console.error('API Error:', error);
        
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error', details: error.message })
        };
    }
};