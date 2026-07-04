   const express = require('express');
   const cors = require('cors');

   const app = express();
   const PORT = 3000; // Local port for testing

   app.use(cors()); // Allow cross-origin for your frontend
   app.use(express.json());

   // Proxy endpoint for N8N chat
   app.get('/api/chat', async (req, res) => {
       const message = req.query.message || ''; // Get message from query param
       const n8nUrl = `https://mudindivhathu.app.n8n.cloud/webhook/a0b7e8d0-1c69-4b5d-8065-39ddfcd762b1/chat${message ? `?message=${encodeURIComponent(message)}` : ''}`;

       try {
           const response = await fetch(n8nUrl, { method: 'GET' }); // Built-in fetch
           if (!response.ok) {
               throw new Error(`N8N error: ${response.status}`);
           }
           const data = await response.text(); // N8N returns plain text
           res.send(data);
       } catch (error) {
           console.error('Proxy error:', error);
           res.status(500).send('Oops! Something went wrong. Please try again.');
       }
   });

   app.listen(PORT, () => {
       console.log(`Server running on http://localhost:${PORT}`);
   });
   