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

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path = event.path.replace('/.netlify/functions/api', '');

  // Simple test endpoint
  if (path === '/test' || path === '') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        message: 'API is working!', 
        timestamp: new Date().toISOString(),
        yourPath: path
      })
    };
  }

  return {
    statusCode: 404,
    headers,
    body: JSON.stringify({ 
      error: 'Route not found', 
      path: path,
      available: ['/test', '/schedule', '/book']
    })
  };
};
