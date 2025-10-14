const { Pool } = require('pg');

// Simple connection test
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path = event.path.replace('/.netlify/functions/api', '');

  try {
    // Test different endpoints
    if (event.httpMethod === 'GET' && path === '/schedule') {
      const { date } = event.queryStringParameters || {};
      console.log('Schedule request for date:', date);
      
      // Simple response without database
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(['09:00', '10:00', '11:00', '14:00', '15:00'])
      };
    }

    if (event.httpMethod === 'GET' && path === '/test') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'API is working!', timestamp: new Date().toISOString() })
      };
    }

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

    // Default response
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Route not found', path: path })
    };

  } catch (error) {
    console.error('FUNCTION ERROR:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Function error', 
        message: error.message 
      })
    };
  }
};
