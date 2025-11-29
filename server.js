const bcrypt = require('bcryptjs');
const express = require('express');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

if (process.env.NODE_ENV !== 'production') {
    try {
        require('dotenv').config();
    } catch (err) {
        console.warn('Unable to load local .env file:', err.message);
    }
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const { createClient } = require('@supabase/supabase-js');

let useSupabase = (process.env.USE_SUPABASE || 'false').toString().toLowerCase() === 'true';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;

if (useSupabase) {
    if (!supabaseUrl || !supabaseKey) {
        console.warn('Supabase credentials are missing. Falling back to MySQL.');
        useSupabase = false;
    } else {
        try {
            supabase = createClient(supabaseUrl, supabaseKey);
        } catch (error) {
            console.error('Failed to initialize Supabase client. Falling back to MySQL.', error);
            useSupabase = false;
        }
    }
}

let pool = null;

if (!useSupabase) {
    const requiredMySqlVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
    const missingMySqlVars = requiredMySqlVars.filter((key) => !process.env[key]);

    if (missingMySqlVars.length > 0) {
        console.warn(`MySQL credentials incomplete (${missingMySqlVars.join(', ')}). Supabase mode will be used instead.`);
        useSupabase = true;
    } else {
        try {
            pool = mysql.createPool({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0
            });
        } catch (error) {
            console.error('Failed to create MySQL pool. Supabase mode enabled instead.', error);
            useSupabase = true;
        }
    }
}

if (!useSupabase && !pool) {
    console.warn('MySQL pool unavailable. Enabling Supabase mode.');
    useSupabase = true;
}

if (useSupabase && !supabase) {
    console.error('Supabase mode requested but supabase client is unavailable.');
}

function formatDateToMySQL(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

//connecting to nodemailer to send emails from contact form to Go daddies email 
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtpout.secureserver.net',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (process.env.SMTP_SECURE || 'true') === 'true',
    auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
    }
});

// function to send email to admin email 
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

async function getUserByEmail(email) {
    try {
        if (useSupabase) {
            const { data, error } = await supabase
                .from('users') 
                .select('*')
                .eq('email', email) 
                .maybeSingle(); 

            if (error && error.code !== 'PGRST116') {
                console.error('Supabase getUserByEmail error:', error);
                throw error;
            }
            return data || null;
        } else {
            if (!pool) {
                throw new Error('MySQL pool is not available.');
            }
            const [rows] = await pool.query('SELECT * FROM Users WHERE Email = ?', [email]);
            return rows[0] || null;
        }
    } catch (err) {
        console.error('getUserByEmail error:', err);
        throw err;
    }
}

async function checkMfaCode(user_id, code) {
    try {
        const now = new Date().toISOString(); 

        if (useSupabase) {
            const { data, error } = await supabase
                .from('mfa_codes')
                .select('*')
                .eq('user_id', user_id)
                .eq('code', code)
                .gt('expires_at', now) 
                .maybeSingle(); 

            if (error) throw error;
            return data;

        } else {
            if (!pool) {
                throw new Error('MySQL pool is not available.');
            }
            const [codes] = await pool.query('SELECT * FROM mfa_codes WHERE user_id = ? AND code = ? AND expires_at > NOW()', [user_id, code]);
            return codes[0]; 
        }
    } catch (err) {
        console.error('checkMfaCode error:', err);
        throw err;
    }
}

async function insertMfaCode(user_id, code, expires_at) {
    try {
        if (useSupabase) {
            const { error } = await supabase
                .from('mfa_codes')
                .upsert({
                    user_id: user_id,
                    code: code,
                    expires_at: expires_at.toISOString()
                }, { onConflict: 'user_id' });

            if (error) {
                console.error('Supabase insertMfaCode error:', error);
                throw error;
            }
        } else {
            if (!pool) {
                throw new Error('MySQL pool is not available.');
            }
            await pool.query(
                'INSERT INTO mfa_codes (user_id, code, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE code = VALUES(code), expires_at = VALUES(expires_at)',
                [user_id, code, expires_at]
            );
        }
    } catch (err) {
        console.error('insertMfaCode error:', err);
        throw err;
    }
}

async function seedAvailability() {
    try {
        console.log('Checking for existing appointments...');

        let count = 0;

        if (useSupabase) {
            const { count: supabaseCount, error } = await supabase
                .from('appointment')
                .select('*', { count: 'exact' });

            if (error) throw error;
            count = supabaseCount;

        } else {
            if (!pool) {
                throw new Error('MySQL pool is not available.');
            }
            const [rows] = await pool.query('SELECT COUNT(*) AS count FROM Appointment');
            count = rows[0].count;
        }

        if (count === 0) {
            console.log('No appointments found. Seeding availability data...');

            const today = new Date();
            const dates = [];
            for (let i = 0; i < 7; i++) {
                const date = new Date(today);
                date.setDate(today.getDate() + i);
                dates.push(date.toISOString().split('T')[0]); 
            }
            
            const times = ['09:00:00', '10:00:00', '11:00:00', '14:00:00', '15:00:00']; 

            const insertions = [];

            for (const date of dates) {
                for (const time of times) {
                    if (useSupabase) {
                        insertions.push({ date, time, isavailable: true });
                    } else {
                        if (!pool) {
                            throw new Error('MySQL pool is not available.');
                        }
                        await pool.query('INSERT INTO Appointment (date, time, isavailable) VALUES (?, ?, ?)', [date, time, true]);
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
    } catch (err) {
        console.error('seedAvailability error:', err);
        throw err;
    }
}

if (useSupabase) {
    seedAvailability().catch((error) => console.error('Seed availability failed:', error));
} else {
    console.warn('Supabase disabled. Seed process skipped to avoid MySQL write attempts without a verified connection.');
}

// Serve static files from the root directory (for CSS, JS, images)
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Home.html'));
});

app.get('/admin/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

app.get('/api/schedule', async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).send('Date is required.');
    }

    try {
        let availableTimes;

        if (useSupabase) {
            const { data, error } = await supabase
                .from('appointment')
                .select('time')
                .eq('date', date)
                .eq('isavailable', true)
                .is('clientname', null);

            if (error) throw error;

            availableTimes = data.map(row => row.time);
        } else {
            if (!pool) {
                throw new Error('MySQL pool is not available.');
            }
            const [rows] = await pool.query(
                'SELECT time FROM appointment WHERE date = ? AND isavailable = TRUE AND clientname IS NULL',
                [date]
            );
            availableTimes = rows.map(row => row.time);
        }

        res.json(availableTimes);

    } catch (error) {
        console.error('Error fetching schedule:', error);
        res.status(500).send('Failed to load time slots.');
    }
})

// function to book a consultation from consultation.html page 
app.post('/api/book', async (req, res) => {
    const { date, time, name, email, service, message } = req.body;
    
    let updateSuccessful = false;
    let result; 

    try {
        if (useSupabase) {
            const { data, error } = await supabase
                .from('appointment')
                .update({ isavailable: false, clientname: name, email, service, message })
                .eq('date', date) 
                .eq('time', time)
                .eq('isavailable', true)
                .select();

            if (error) throw error;
            
            if (data && data.length > 0) {
                updateSuccessful = true;
            }

        } else {
            if (!pool) {
                throw new Error('MySQL pool is not available.');
            }
            [result] = await pool.query(
                'UPDATE appointment SET isavailable = FALSE, clientname = ?, email = ?, service = ?, message = ? WHERE date = ? AND time = ? AND isavailable = TRUE',
                [name, email, service, message, date, time]
            );
            
            if (result.affectedRows > 0) {
                updateSuccessful = true;
            }
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
        await sendEmail(process.env.EMAIL_USER, 'New Consultation Booking', adminNotification);
        
        res.status(200).send('Booking successful!');
        
    } catch (error) {
        console.error('Booking error:', error);
        res.status(500).send('Failed to book consultation.');
    }
});

// functions to 
app.get('/api/admin/bookings', async (req, res) => {
    try {
        let bookings;

        if (useSupabase) {
            const { data, error } = await supabase
                .from('appointment')
                .select('date, time, clientname as name, email, service, message') 
                .not('clientname', 'is', null)
                .order('date', { ascending: false })
                .order('time', { ascending: true });

            if (error) throw error;
            bookings = data;
        } else {
            if (!pool) {
                throw new Error('MySQL pool is not available.');
            }
            const [rows] = await pool.query('SELECT date, time, clientname as name, email, service, message FROM appointment WHERE clientname IS NOT NULL ORDER BY date DESC, time ASC');
            bookings = rows;
        }

        res.json(bookings);
    } catch (error) {
        console.error('Error fetching admin bookings:', error);
        res.status(500).send('Server error.');
    }
});

// managing admin availability 
app.post('/api/admin/availability', async (req, res) => {
    const { date, time } = req.body;
    let { isAvailable } = req.body; 
    
    if (isAvailable !== undefined) {
        isAvailable = (isAvailable === true || isAvailable === 'true');
    }

    if (!date || !time || isAvailable === undefined) {
        return res.status(400).send('Missing required availability data.');
    }

    try {
        if (useSupabase) {
            const { error } = await supabase
                .from('appointment')
                .update({ isavailable: isAvailable, clientname: null, email: null, service: null, message: null }) // eslint-disable-line no-undef
                .eq('date', date)
                .eq('time', time);

            if (error) throw error;
        } else {
            if (!pool) {
                throw new Error('MySQL pool is not available.');
            }
            await pool.query(
                'UPDATE appointment SET isavailable = ?, clientname = NULL, email = NULL, service = NULL, message = NULL WHERE date = ? AND time = ?',
                [isAvailable, date, time]
            );
        }

        res.status(200).send('Availability updated successfully.');
    } catch (error) {
        console.error('Error updating availability:', error);
        res.status(500).send('Server error.');
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

app.post('/api/auth/signin', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await getUserByEmail(email);
        
        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid email or password" });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.status(400).json({ success: false, message: "Invalid email or password" });
        }
        
        const mfaCode = Math.floor(100000 + Math.random() * 900000);
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + 10 * 60000);
        
        await insertMfaCode(user.id, mfaCode, expiresAt);
        
        await sendEmail(user.email, 'Your MFA Code', `Your MFA code is ${mfaCode}. It will expire in 10 minutes.`);
        
        res.json({ success: true, message: "MFA code sent. Please check your email to verify your login." });
    } catch (err) {
        console.error("Server error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post('/api/auth/verify-mfa', async (req, res) => {
    try {
        const { email, code } = req.body;
        
        if (!email || !code) {
            return res.status(400).json({ success: false, message: 'Email and code are required.' });
        }
        
        const user = await getUserByEmail(email);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        
        const validCode = await checkMfaCode(user.id, code);

        if (!validCode) {
            return res.status(400).json({ success: false, message: 'Invalid or expired code.' });
        }
        
        if (useSupabase) {
            const { error } = await supabase
                .from('mfa_codes')
                .delete()
                .eq('user_id', user.id);

            if (error && error.code !== 'PGRST116') throw error; // Ignore if no rows found
        } else {
            await pool.query('DELETE FROM mfa_codes WHERE user_id = ?', [user.id]);
        }

        const accessToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

        const adminEmails = ['takiesandani@gmail.com', 'info@stackopsit.co.za'];
        const isAdmin = adminEmails.includes(user.email.toLowerCase());

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


app.get('/ClientPortal.html', authenticateToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'ClientPortal.html'));
});

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
        if (useSupabase) {
            const { data: companyData, error: companyError } = await supabase
                .from('companies')
                .insert([{ companyname: companyName, website: website, industry: industry, address: address, city: city, state: state, zipcode: zipCode, country: country }])
                .select('id') 
                .single();

            if (companyError) throw companyError;
            
            const companyId = companyData.id;
            
            const { error: userError } = await supabase
                .from('users')
                .insert([{ 
                    firstname: firstName,
                    lastname: lastName,
                    email: email, 
                    contact: contact, 
                    password: hashedPassword, 
                    isactive: true, 
                    role: 'client',
                    companyid: companyId 
                }]);
                
            if (userError) throw userError;
            registrationSuccessful = true;

        } else {
            const connection = await pool.getConnection();
            
            try {
                await connection.beginTransaction();

                const [companyResult] = await connection.query(
                    `INSERT INTO Companies (companyname, website, industry, address, city, state, zipcode, country)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [companyName, website, industry, address, city, state, zipCode, country]
                );
                
                const companyId = companyResult.insertId;
                
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
        }
        
        if (registrationSuccessful) {
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
        console.error('Registration failed:', error);
        res.status(500).json({ success: false, message: 'Failed to register client. Please check the provided information.' });
    }
});

app.get('/forgot-password.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'forgot-password.html'));
});

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

        if (useSupabase) {
            const { error } = await supabase
                .from('password_resets') // eslint-disable-line no-undef
                .upsert({
                    user_id: user.id,
                    token: resetToken,
                    expires_at: expiresAt.toISOString()
                }, { onConflict: 'user_id' });

            if (error) throw error;
        } else {
            await pool.query(
                `INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at)`,
                [user.id, resetToken, expiresAt] 
            );
        }

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

app.get('/reset-password.html', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send('Invalid or missing token.');
    }

    try {
        let tokens;
        const now = new Date().toISOString();

        if (useSupabase) {
            const { data, error } = await supabase 
                .from('password_resets')
                .select('*') 
                .eq('token', token)
                .gt('expires_at', now)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') throw error;
            tokens = data ? [data] : [];
        } else {
            if (!pool) {
                throw new Error('MySQL pool is not available.');
            }
            [tokens] = await pool.query(
                'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()',
                [token]
            );
        }

        if (tokens.length === 0) {
            return res.status(400).send('Invalid or expired password reset link.');
        }

        res.sendFile(path.join(__dirname, 'reset-password.html'));
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).send('Server error. Please try again.');
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }

    try {
        let userId;

        if (useSupabase) {
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

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);

            const { error: updateError } = await supabase
                .from('users')
                .update({ password: hashedPassword })
                .eq('id', userId);

            if (updateError) throw updateError;

            const { error: deleteError } = await supabase
                .from('password_resets')
                .delete()
                .eq('token', token);
            
            if (deleteError && deleteError.code !== 'PGRST116') throw deleteError;

        } else {
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

                await connection.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

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
        await sendEmail(process.env.EMAIL_USER, `New Inquiry: ${company} - ${service}`, emailBody, true);

        res.json({ success: true });
    } catch (error) {
        console.error('Contact message error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}. Supabase mode: ${useSupabase ? 'ON' : 'OFF'}`));
