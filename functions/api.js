const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

// PostgreSQL connection pool
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

exports.handler = async (event, context) => {
  console.log('=== FUNCTION CALLED ===');
  console.log('Path:', event.path);
  console.log('Method:', event.httpMethod);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path = event.path.replace('/.netlify/functions/api', '');

  try {
    // Test endpoint
    if (event.httpMethod === 'GET' && path === '/test') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          message: 'API is working!', 
          timestamp: new Date().toISOString()
        })
      };
    }

    // Test database connection
    if (event.httpMethod === 'GET' && path === '/test-db') {
      try {
        const result = await pool.query('SELECT NOW() as current_time');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            databaseTime: result.rows[0].current_time,
            message: 'Database connection successful!' 
          })
        };
      } catch (dbError) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            success: false, 
            error: 'Database connection failed',
            details: dbError.message 
          })
        };
      }
    }

    // Schedule endpoint
    if (event.httpMethod === 'GET' && path === '/schedule') {
      const { date } = event.queryStringParameters || {};
      console.log('Schedule request for date:', date);
      
      if (!date) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Date is required' })
        };
      }

      try {
        // Return mock data for testing
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(['09:00', '10:00', '11:00', '14:00', '15:00'])
        };
      } catch (error) {
        console.error('Schedule error:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to fetch schedule' })
        };
      }
    }

    // Book endpoint
    if (event.httpMethod === 'POST' && path === '/book') {
      try {
        const body = JSON.parse(event.body);
        const { date, time, name, email, service, message } = body;
        
        console.log('Booking received:', { date, time, name, email });
        
        // For now, just return success
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ message: 'Booking successful! (Test mode)' })
        };
      } catch (error) {
        console.error('Booking error:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Booking failed' })
        };
      }
    }

    // Auth signin endpoint
    if (event.httpMethod === 'POST' && path === '/auth/signin') {
      try {
        const { email, password } = JSON.parse(event.body);
        console.log('Signin attempt for:', email);
        
        // For testing, return success with MFA required
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            success: true, 
            message: "MFA code sent. Please check your email to verify your login." 
          })
        };
      } catch (error) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ success: false, message: 'Signin failed' })
        };
      }
    }

    // Default - route not found
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ 
        error: 'Route not found', 
        path: path,
        availableEndpoints: [
          'GET /api/test',
          'GET /api/test-db', 
          'GET /api/schedule?date=YYYY-MM-DD',
          'POST /api/book',
          'POST /api/auth/signin'
        ]
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        message: error.message 
      })
    };
  }
};
