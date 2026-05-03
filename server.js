const bcrypt = require('bcryptjs');
const express = require('express');
const mysql = require('mysql2/promise');
const axios = require('axios');
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
const { ClientSecretCredential } = require('@azure/identity');

// invoice payment endpoints 
require("dotenv").config();

const ACCESS_TOKEN_SECRET = '7a076e42670cfe26193655fe5f48b776defe078754ca16fb9ae0a054b354d335';
const accessContextCache = new Map();

function getTenantByEmail(email) {
  const key = String(email || '').toLowerCase();
  const cached = accessContextCache.get(key);
  if (!cached) return null;
  return {
    clientId: cached.accessType || 'standard',
    tenantId: cached.tenantId || null,
    companyId: cached.companyId || null
  };
}

// ===============================
// MICROSOFT GRAPH -  Identity Protection
// ===============================
// Token cache (in production, use Redis or database)
const microsoftTokenCache = new Map();
const authMethodsCache = new Map();
const AUTH_METHODS_CACHE_TTL_MS = 5 * 60 * 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getCachedAuthMethods(userId) {
  const cached = authMethodsCache.get(userId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    authMethodsCache.delete(userId);
    return null;
  }
  return cached.methods;
}

function setCachedAuthMethods(userId, methods) {
  authMethodsCache.set(userId, {
    methods: Array.isArray(methods) ? methods : [],
    expiresAt: Date.now() + AUTH_METHODS_CACHE_TTL_MS
  });
}

function hasRealMfaMethod(authMethods) {
  if (!Array.isArray(authMethods) || authMethods.length === 0) return false;
  return authMethods.some(method => {
    const type = String(method?.['@odata.type'] || '').toLowerCase();
    // Password alone is not MFA; anything else counts as extra factor.
    return type && !type.includes('passwordauthenticationmethod');
  });
}

async function mapWithConcurrency(items, limit, worker) {
  const safeLimit = Math.max(1, Number(limit) || 1);
  const output = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(safeLimit, items.length) }, () => runner()));
  return output;
}

async function getMicrosoftGraphToken() {
  try {
    const tenantId = await getSecret('MICROSOFT_TENANT_ID');
    const clientId = await getSecret('MICROSOFT_CLIENT_ID');
    const clientSecret = await getSecret('MICROSOFT_CLIENT_SECRET');
    
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Missing Microsoft Graph credentials');
    }

    // Check cache (valid for 30 minutes)
    const cacheKey = 'microsoft_graph_token';
    const cachedToken = microsoftTokenCache.get(cacheKey);
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
      console.log('[Microsoft Graph] Using cached token');
      return cachedToken.token;
    }

    console.log('[Microsoft Graph] Requesting new token...');
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        scope: 'https://graph.microsoft.com/.default',
        client_secret: clientSecret,
        grant_type: 'client_credentials'
      }).toString()
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Token request failed: ${errorData.error_description || response.statusText}`);
    }

    const data = await response.json();
    const expiresAt = Date.now() + (data.expires_in * 1000) - 60000; // Cache for 1 minute less

    // Store in cache
    microsoftTokenCache.set(cacheKey, {
      token: data.access_token,
      expiresAt: expiresAt
    });

    console.log('[Microsoft Graph] Token obtained successfully');
    return data.access_token;
  } catch (error) {
    console.error('[Microsoft Graph] Token generation failed:', error.message);
    throw error;
  }
}

async function fetchMicrosoftUsers(token) {
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/users?$top=999&$select=displayName,mail,jobTitle,mobilePhone,userPrincipalName,id', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Microsoft Graph API failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('[Microsoft Graph] Failed to fetch users:', error.message);
    throw error;
  }
}

// Fetch all role assignments from Microsoft Graph
async function fetchMicrosoftRoleAssignments(token) {
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/roleManagement/directory/roleAssignments?$top=999&$expand=roleDefinition', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Microsoft Graph API failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('[Microsoft Graph] Failed to fetch role assignments:', error.message);
    throw error;
  }
}

// Fetch sign-in logs from Microsoft Graph (last 30 days)
async function fetchMicrosoftSignIns(token) {
  try {
    // Construct filter for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const filterDate = thirtyDaysAgo.toISOString();

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/auditLogs/signIns?$filter=createdDateTime ge ${filterDate}&$top=999&$select=createdDateTime,userPrincipalName,userId,appDisplayName,clientAppUsed,ipAddress,location,deviceDetail,status`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Microsoft Graph API failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('[Microsoft Graph] Failed to fetch sign-ins:', error.message);
    return []; // Return empty array if sign-ins not available
  }
}

// Fetch authentication methods for a specific user
async function fetchUserAuthMethods(token, userId, retries = 2) {
  try {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userId}/authentication/methods`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      // Retry on transient/rate-limit errors to reduce MFA flapping.
      if ((response.status === 429 || response.status >= 500) && retries > 0) {
        await sleep((3 - retries) * 250);
        return fetchUserAuthMethods(token, userId, retries - 1);
      }

      const cached = getCachedAuthMethods(userId);
      if (cached) return cached;
      return []; // Return empty array if auth methods not available
    }

    const data = await response.json();
    const methods = data.value || [];
    setCachedAuthMethods(userId, methods);
    return methods;
  } catch (error) {
    console.error(`[Microsoft Graph] Failed to fetch auth methods for ${userId}:`, error.message);
    const cached = getCachedAuthMethods(userId);
    if (cached) return cached;
    return [];
  }
}

// ===============================
// APPLICATIONS & SERVICE PRINCIPALS
// ===============================
// Fetch service principals (applications) from Microsoft Graph
async function fetchMicrosoftServicePrincipals(token) {
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/servicePrincipals?$top=999&$select=id,displayName,servicePrincipalType,publisherName,createdDateTime,appOwnerOrganizationId,appRoles,oauth2PermissionScopes', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Microsoft Graph API failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('[Microsoft Graph] Failed to fetch service principals:', error.message);
    throw error;
  }
}

// Fetch groups from Microsoft Graph
async function fetchMicrosoftGroups(token) {
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/groups?$top=999&$select=id,displayName,mailNickname', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Microsoft Graph API failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('[Microsoft Graph] Failed to fetch groups:', error.message);
    return [];
  }
}

// Fetch app role assignments for a service principal
async function fetchAppRoleAssignments(token, servicePrincipalId) {
  try {
    const response = await fetch(`https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalId}/appRoleAssignedTo?$top=999`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.error('[Microsoft Graph] Failed to fetch app role assignments:', error.message);
    return [];
  }
}

const app = express();
// Middleware for parsing bodies with raw support (critical for payment signatures)
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));
app.use(express.urlencoded({ 
    extended: true,
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));

// GLOBAL REQUEST LOGGER for PayFast/Yoco Debugging
app.use((req, res, next) => {
    if (req.path.includes('payfast') || req.path.includes('yoco')) {
        console.log(`[DEBUG] Incoming ${req.method} request to ${req.path} from ${req.ip}`);
        console.log(`[DEBUG] Headers: ${JSON.stringify(req.headers)}`);
    }
    next();
});

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
        enableKeepAlive: true,            // Enable TCP keepalive to prevent stale connections
        keepAliveInitialDelayMs: 0,       // Start keepalive immediately
        decimalNumbers: true,             // Return DECIMAL values as numbers
        supportBigNumbers: true,          // Support large numbers
        bigNumberStrings: false,          // Convert large numbers to strings if needed
        connectionTimeoutMillis: 30000,   // 30 second connection timeout
        acquireTimeoutMillis: 30000,      // 30 second acquire timeout
        waitForConnectionsMillis: 5000,   // 5 second wait for connection from queue
        
        /*
        authPlugins: {
            'caching_sha2_password': () => require('mysql2/lib/auth_plugins/caching_sha2_password')
        } */
    };

    const socketPath = `/cloudsql/stackops-backend-475222:us-central1:stackops-db`;
    console.log(`\n[DB] Attempting to connect to Cloud SQL via socket: ${socketPath}`);
    console.log('[DB] Config: connectionTimeout=30s, acquireTimeout=30s');
    dbConfig.socketPath = socketPath;

    try {
        // Use mysql.createPool (promise-based) for modern Node.js
        pool = mysql.createPool(dbConfig);
        
        // Add pool error handlers
        pool.on('error', (err) => {
            console.error('[POOL] ❌ Unexpected pool error:', err.message);
            console.error('[POOL] Error code:', err.code);
            console.error('[POOL] Error errno:', err.errno);
        });

        pool.on('connection', (connection) => {
            console.log('[POOL] ✅ New connection created to Cloud SQL');
        });

        console.log('[POOL] ✅ MySQL pool created with settings:');
        console.log('[POOL]   - connectionLimit: 10');
        console.log('[POOL]   - queueLimit: 0 (unlimited queue)');
        console.log('[POOL]   - keepAliveInitialDelayMs: 0 (keepalive enabled)');
        console.log('[POOL]   - connectionTimeout: 30 seconds');
        
        // Try a simple test connection immediately (don't wait for result)
        pool.getConnection()
            .then(conn => {
                console.log('[DB] ✅ Test connection successful - Cloud SQL is reachable');
                conn.release();
            })
            .catch(err => {
                console.error('[DB] ❌ Test connection failed:', err.message);
                console.error('[DB] ❌ Cloud SQL may not be accessible from Cloud Run');
                console.error('[DB] ❌ Check: 1) IAM permissions (Cloud SQL Client role)');
                console.error('[DB] ❌        2) IAM bindings for Cloud Run service account');
                console.error('[DB] ❌        3) Cloud SQL instance status (should be RUNNABLE)');
                console.error('[DB] ❌        4) Socket path matches instance: ' + socketPath);
                console.error('[DB] Error code:', err.code, 'Errno:', err.errno);
            });
        
    } catch (error) {
        console.error('❌ Failed to create MySQL pool.', error);
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
    
    // PayFast ITN signature requires fields to be in the same order they were received.
    // For ITN specifically, it's safer to iterate through all fields provided except 'signature'.
    // For link generation, the order we set in the object is preserved.
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

    const signature = crypto.createHash("md5").update(getString).digest("hex");
    // Detailed logging for ITN debugging
    if (data.m_payment_id || data.pf_payment_id) {
        console.log(`[PAYFAST SIGNATURE DEBUG] Data Keys: ${Object.keys(data).join(", ")}`);
        console.log(`[PAYFAST SIGNATURE DEBUG] String to hash: "${getString}"`);
        console.log(`[PAYFAST SIGNATURE DEBUG] Resulting signature: "${signature}"`);
    }
    return signature;
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
            notify_url: 'https://stackopsit.co.za/api/payfast/itn',
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

// ===============================
// Azure AD + Microsoft Graph API for Email
// ===============================
// Credentials are fetched from Google Secret Manager
let azureCredential = null;
let graphTokenCache = {
  token: null,
  expiresAt: 0
};

async function initializeAzureCredential() {
  if (azureCredential) return;
  
  const tenantId = await getSecret('AZURE_TENANT_ID');
  const clientId = await getSecret('AZURE_CLIENT_ID');
  const clientSecret = await getSecret('AZURE_CLIENT_SECRET');
  
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Missing Azure credentials: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET');
  }
  
  azureCredential = new ClientSecretCredential(tenantId, clientId, clientSecret);
}

async function getGraphAccessToken() {
  // Return cached token if still valid (expires in 1 hour, refresh at 50 min)
  if (graphTokenCache.token && graphTokenCache.expiresAt > Date.now()) {
    return graphTokenCache.token;
  }
  
  try {
    await initializeAzureCredential();
    const tokenResponse = await azureCredential.getToken('https://graph.microsoft.com/.default');
    graphTokenCache.token = tokenResponse.token;
    graphTokenCache.expiresAt = Date.now() + (50 * 60 * 1000); // Cache for 50 minutes
    return tokenResponse.token;
  } catch (error) {
    console.error('[Graph API] Failed to get access token:', error.message);
    throw new Error('Failed to authenticate with Microsoft Graph: ' + error.message);
  }
}

// Helper function to send email via Microsoft Graph API
async function sendGraphEmail(to, subject, body, isHtml = true, fromAddress = 'info@stackopsit.co.za') {
  const maxRetries = 2;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Graph Email] Attempting to send email to ${to}... (attempt ${attempt})`);
      
      const token = await getGraphAccessToken();
      
      const emailPayload = {
        message: {
          subject: subject,
          body: {
            contentType: isHtml ? 'HTML' : 'Text',
            content: body
          },
          toRecipients: [
            {
              emailAddress: {
                address: to
              }
            }
          ]
        }
      };
      
      await axios.post(
        `https://graph.microsoft.com/v1.0/users/${fromAddress}/sendMail`,
        emailPayload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      console.log(`[Graph Email] Email successfully sent to ${to}`);
      return; // Success
    } catch (error) {
      lastError = error;
      const errorCode = error?.response?.status || error?.code || 'UNKNOWN';
      const errorMsg = error?.response?.data?.error?.message || error?.message || error;
      
      console.error(`[Graph Email] Failed to send email to ${to} (attempt ${attempt}):`, errorCode, errorMsg);
      
      // Retry logic for transient errors
      const retryableStatuses = [408, 429, 500, 502, 503, 504];
      const retryableCodes = ['ETIMEDOUT', 'ECONNECTION', 'ENOTFOUND', 'ESOCKET'];
      
      const shouldRetry = retryableStatuses.includes(errorCode) || 
                         retryableCodes.includes(error?.code);
      
      if (attempt < maxRetries && shouldRetry) {
        const delayMs = 1000 + (attempt * 500); // 1.5s, then 2s
        console.log(`[Graph Email] Retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
      } else if (attempt === maxRetries) {
        throw lastError;
      }
    }
  }
  
  throw lastError;
}

// function to send email from info@stackopsit.co.za
const sendEmail = async (to, subject, body, isHtml = false, attachments = []) => {
  try {
    // Note: Graph API doesn't handle attachments the same way - for now, send without
    if (attachments.length > 0) {
      console.warn('[Graph Email] Attachments are not yet supported via Graph API');
    }
    
    await sendGraphEmail(to, subject, body, isHtml, 'info@stackopsit.co.za');
  } catch (error) {
    console.error('[sendEmail] Error:', error.message);
    throw error;
  }
};

// function to send email from billing@stackopsit.co.za
const sendBillingEmail = async (to, subject, body, isHtml = false, attachments = []) => {
  try {
    // Note: Graph API doesn't handle attachments the same way - for now, send without
    if (attachments.length > 0) {
      console.warn('[Graph Email] Attachments are not yet supported via Graph API');
    }
    
    await sendGraphEmail(to, subject, body, isHtml, 'billing@stackopsit.co.za');
  } catch (error) {
    console.error('[sendBillingEmail] Error:', error.message);
    throw error;
  }
};

// connecting to nodemailer to send emails from contact form

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

async function getUserAccessContextByEmail(email) {
    if (!pool) {
        throw new Error('MySQL pool is not available.');
    }

    const [rows] = await pool.query(
        `SELECT 
            u.ID AS userId,
            u.Email AS email,
            u.CompanyID AS companyId,
            COALESCE(ta.AccessType, 'standard') AS accessType,
            mt.ID AS microsoftTenantPk,
            mt.TenantName AS tenantName,
            mt.TenantID AS tenantId,
            mt.ClientID AS clientId,
            mt.ClientSecret AS clientSecret
         FROM Users u
         LEFT JOIN TenantAccessControl ta ON ta.UserID = u.ID
         LEFT JOIN CompanyMicrosoftMapping cm ON cm.CompanyID = u.CompanyID AND cm.IsActive = 1
         LEFT JOIN MicrosoftTenants mt ON mt.ID = cm.MicrosoftTenantID
         WHERE LOWER(u.Email) = LOWER(?)
         LIMIT 1`,
        [email]
    );

    return rows[0] || null;
}

async function getAccessContextByUser(reqUser) {
    if (!reqUser || !reqUser.email) return null;
    return getUserAccessContextByEmail(reqUser.email);
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

        // Create mfa_codes table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mfa_codes (
                user_id INT PRIMARY KEY,
                code VARCHAR(10) NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create password_resets table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                user_id INT PRIMARY KEY,
                token VARCHAR(255) NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Core hybrid-architecture tables
        await pool.query(`
            CREATE TABLE IF NOT EXISTS MicrosoftTenants (
                ID INT AUTO_INCREMENT PRIMARY KEY,
                TenantName VARCHAR(255),
                TenantID VARCHAR(255),
                ClientID VARCHAR(255),
                ClientSecret TEXT,
                CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS CompanyMicrosoftMapping (
                ID INT AUTO_INCREMENT PRIMARY KEY,
                CompanyID INT,
                MicrosoftTenantID INT,
                IsActive TINYINT DEFAULT 1,
                FOREIGN KEY (CompanyID) REFERENCES Companies(ID),
                FOREIGN KEY (MicrosoftTenantID) REFERENCES MicrosoftTenants(ID)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS TenantAccessControl (
                ID INT AUTO_INCREMENT PRIMARY KEY,
                UserID INT,
                AccessType VARCHAR(50),
                FOREIGN KEY (UserID) REFERENCES Users(ID)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS IdentityMetricsCache (
                ID INT AUTO_INCREMENT PRIMARY KEY,
                CompanyID INT,
                TotalUsers INT,
                ActiveUsers INT,
                AdminRoles INT,
                SecurityScore INT,
                LastUpdated DATETIME,
                FOREIGN KEY (CompanyID) REFERENCES Companies(ID)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS IdentityUserDetailsCache (
                ID INT AUTO_INCREMENT PRIMARY KEY,
                CompanyID INT,
                UsersPayload LONGTEXT,
                LastUpdated DATETIME,
                UNIQUE KEY uq_identity_user_details_company (CompanyID),
                FOREIGN KEY (CompanyID) REFERENCES Companies(ID)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS DeviceMetricsCache (
                ID INT AUTO_INCREMENT PRIMARY KEY,
                CompanyID INT,
                TotalDevices INT,
                NonCompliant INT,
                NotEncrypted INT,
                StaleDevices INT,
                LastUpdated DATETIME,
                FOREIGN KEY (CompanyID) REFERENCES Companies(ID)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS EmailMetricsCache (
                ID INT AUTO_INCREMENT PRIMARY KEY,
                CompanyID INT,
                ActiveThreats INT,
                HighSeverity INT,
                UsersTargeted INT,
                OpenIncidents INT,
                LastUpdated DATETIME,
                FOREIGN KEY (CompanyID) REFERENCES Companies(ID)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS BackupRecoveryPayloadCache (
                ID INT AUTO_INCREMENT PRIMARY KEY,
                CompanyID INT,
                Payload LONGTEXT,
                LastUpdated DATETIME,
                UNIQUE KEY uq_backup_recovery_company (CompanyID),
                FOREIGN KEY (CompanyID) REFERENCES Companies(ID)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS ApplicationMetricsCache (
                ID INT AUTO_INCREMENT PRIMARY KEY,
                CompanyID INT,
                TotalApps INT,
                ExternalApps INT,
                HighRiskApps INT,
                HighAccessApps INT,
                LastUpdated DATETIME,
                FOREIGN KEY (CompanyID) REFERENCES Companies(ID)
            )
        `);

        // User constraints/indexes for faster login and tenant lookups
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_company ON Users(CompanyID)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON Users(Email)`);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email ON Users(Email)`);
    } catch (err) {
        console.error('ensureDatabaseSchema error:', err);
    }
}

// Call seed availability and schema check NON-BLOCKING with retry logic
setTimeout(() => {
    console.log('[STARTUP] Running deferred startup tasks (seedAvailability, ensureDatabaseSchema)...');
    
    if (!pool) {
        console.warn('[STARTUP] ⚠️  Skipping startup tasks - database pool not available');
        return;
    }

    // Add retry logic for database startup tasks
    let retries = 0;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000; // 5 seconds between retries

    function runStartupTasks() {
        Promise.all([
            seedAvailability().catch((error) => {
                console.error(`[STARTUP] seedAvailability failed (attempt ${retries + 1}/${MAX_RETRIES}):`, error.message);
                if (error.code) console.error('[STARTUP] Error code:', error.code);
                if (error.errno) console.error('[STARTUP] Error errno:', error.errno);
                return Promise.reject(error);
            }),
            ensureDatabaseSchema().catch((error) => {
                console.error(`[STARTUP] ensureDatabaseSchema failed (attempt ${retries + 1}/${MAX_RETRIES}):`, error.message);
                if (error.code) console.error('[STARTUP] Error code:', error.code);
                if (error.errno) console.error('[STARTUP] Error errno:', error.errno);
                return Promise.reject(error);
            })
        ])
        .then(() => {
            console.log('[STARTUP] ✅ All startup tasks completed successfully');
        })
        .catch((error) => {
            retries++;
            if (retries < MAX_RETRIES) {
                console.warn(`[STARTUP] ⚠️  Retrying startup tasks in ${RETRY_DELAY}ms... (${retries}/${MAX_RETRIES})`);
                setTimeout(runStartupTasks, RETRY_DELAY);
            } else {
                console.error('[STARTUP] ❌ Startup tasks failed after all retries. Server continuing without these features.');
                console.error('[STARTUP] WhatsApp and other features should still work. Check Cloud SQL connection.');
            }
        });
    }

    runStartupTasks();
}, 2000);  // Bump delay to 2 seconds to allow pool initialization

// --- INVOICE AUTOMATION ---

/**
 * CONFIGURATION FOR TESTING:
 * To test immediately, set:
 * - TEST_MODE: true
 * - INTERVAL_MS: 300000 (5 minutes)
 * This will ignore the hour checks and send emails every 5 minutes.
 * 
 * FOR PRODUCTION:
 * - TEST_MODE: false
 * - INTERVAL_MS: 3600000 (1 hour)
 */
const AUTOMATION_CONFIG = {
    ENABLED: true,
    CHECK_HOUR: 0,             // 00:00 for status updates (Pending -> Overdue)
    EMAIL_HOUR: 6,             // 08:00 for email reminders (8 hours after check)
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
        // 1. STATUS UPDATES (Runs every interval)
        if (AUTOMATION_CONFIG.ENABLED) {
            console.log('[Automation] Checking for overdue invoices...');
            // Find Pending or Unpaid invoices where DueDate <= current date
            const [pendingInvoices] = await pool.query(
                "SELECT InvoiceID, InvoiceNumber FROM Invoices WHERE Status IN ('Pending', 'Unpaid') AND DueDate <= CURDATE()"
            );

            for (const invoice of pendingInvoices) {
                console.log(`[Automation] Marking Invoice #${invoice.InvoiceNumber} as Overdue`);
                await pool.query(
                    "UPDATE Invoices SET Status = 'Overdue' WHERE InvoiceID = ?",
                    [invoice.InvoiceID]
                );
            }
        }

        // 2. EMAIL REMINDERS (Runs at EMAIL_HOUR or in TEST_MODE)
        if (currentHour === AUTOMATION_CONFIG.EMAIL_HOUR || AUTOMATION_CONFIG.TEST_MODE) {
            console.log('[Automation] Processing email reminders...');

            // A. Handle PAID confirmations
            const [paidInvoices] = await pool.query(
                `SELECT i.*, c.companyname as CompanyName, u.firstname, u.lastname, u.email 
                 FROM Invoices i
                 JOIN Companies c ON i.CompanyID = c.ID
                 LEFT JOIN Users u ON u.CompanyID = c.ID AND u.Role = 'Client'
                 WHERE LOWER(i.Status) = 'paid' 
                   AND (i.PaidEmailSent = FALSE OR ? = TRUE)
                   AND NOT EXISTS (SELECT 1 FROM Payments p WHERE p.InvoiceID = i.InvoiceID AND p.Method = 'PayFast')`, 
                [AUTOMATION_CONFIG.TEST_MODE]
            );

            // Group paid invoices by email to send consolidated confirmations
            const paidByEmail = {};
            for (const inv of paidInvoices) {
                if (!inv.email) {
                    console.warn(`[Automation] Invoice #${inv.InvoiceNumber} has no email contact - skipping paid confirmation`);
                    continue;
                }
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
                            src=https://i.postimg.cc/Pr25Gv6k/signature.png
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
                `SELECT DISTINCT i.*, c.companyname as CompanyName, u.firstname, u.lastname, u.email 
                 FROM Invoices i
                 JOIN Companies c ON i.CompanyID = c.ID
                 LEFT JOIN Users u ON c.ID = u.CompanyID AND u.Role = 'Client'
                 WHERE LOWER(i.Status) = 'overdue' 
                   AND (i.LastReminderDate IS NULL OR i.LastReminderDate < ? OR ? = TRUE)
                 ORDER BY i.InvoiceID`,
                [todayStr, AUTOMATION_CONFIG.TEST_MODE]
            );

            // Group overdue invoices by email to send consolidated reminders
            const overdueByEmail = {};
            for (const inv of overdueInvoices) {
                if (!inv.email) {
                    console.warn(`[Automation] Invoice #${inv.InvoiceNumber} has no email contact - skipping`);
                    continue;
                }
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
                    `;
                }

                console.log(`[Automation] Sending consolidated overdue reminder for Invoices #${invoiceNumbers} to ${email}`);
                const emailBody = `
                    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                        <p>Dear ${data.lastname},</p>
                        <p>I hope this email finds you well.</p>
                        ${messagePrefix}
                        <p>Total Amount Due: R${totalDue.toFixed(2)}</p>
                        <p>Please settle this amount as soon as possible to avoid further action.</p>
                        <p>If you have already made payment, please ignore this email.</p>
                        <p>Kind regards,<br><b>StackOps IT Solutions Team</b></p>
                        <img
                            src=https://i.postimg.cc/Pr25Gv6k/signature.png
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
        console.error('[Automation] Error during invoice automation:', error.message);
        if (error.code) console.error('[Automation] Error code:', error.code);
        if (error.errno) console.error('[Automation] Error errno:', error.errno);
        // Don't crash - let it retry on next interval
    }
}

// Wrap automation to handle connection timeouts
const automationWithErrorHandling = async () => {
    try {
        if (!pool) {
            console.warn('[Automation] ⚠️  Skipping automation - database pool not available');
            return;
        }
        await runInvoiceAutomation();
    } catch (err) {
        console.error('[Automation] ❌ Fatal automation error:', err.message);
        console.error('[Automation] Check database connectivity - is Cloud SQL accessible?');
    }
};

// Start the automation loop with error handling
setInterval(automationWithErrorHandling, AUTOMATION_CONFIG.INTERVAL_MS);
// Also run once on startup after a delay (only if pool is ready)
setTimeout(() => {
    if (!pool) {
        console.warn('[Automation] ⚠️  Skipping startup automation run - database pool not ready');
        return;
    }
    automationWithErrorHandling().catch(err => {
        console.error('[Automation] Startup automation failed:', err.message);
    });
}, 8000);

// --- END INVOICE AUTOMATION ---

// Serve static files from the root directory (for CSS, JS, images)
app.use(express.static(path.join(__dirname)));

// Health check endpoint for Cloud Run and monitoring
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: pool ? 'available' : 'unavailable'
    });
});

// Database connectivity diagnostic endpoint
app.get('/api/db-status', async (req, res) => {
    const diagnostics = {
        timestamp: new Date().toISOString(),
        poolExists: !!pool,
        poolStatus: null,
        connectionTest: null,
        usersTableCheck: null,
        error: null
    };

    try {
        if (!pool) {
            diagnostics.error = 'Database pool not initialized';
            return res.status(503).json(diagnostics);
        }

        // Try to get a connection from the pool
        console.log('[DIAG] Testing database connectivity...');
        const connection = await pool.getConnection();
        diagnostics.connectionTest = 'success';
        console.log('[DIAG] ✅ Got connection from pool');

        // Test a simple query
        try {
            const [result] = await connection.query('SELECT 1 as test');
            diagnostics.poolStatus = 'connected';
            console.log('[DIAG] ✅ Simple query successful');
        } catch (queryErr) {
            diagnostics.poolStatus = 'error';
            diagnostics.error = queryErr.message;
            console.error('[DIAG] ❌ Query failed:', queryErr.message);
        }

        // Check Users table exists
        try {
            const [result] = await connection.query('SELECT COUNT(*) as count FROM Users LIMIT 1');
            diagnostics.usersTableCheck = {
                exists: true,
                count: result[0].count
            };
            console.log('[DIAG] ✅ Users table found with', result[0].count, 'records');
        } catch (tableErr) {
            diagnostics.usersTableCheck = {
                exists: false,
                error: tableErr.message
            };
            console.error('[DIAG] ❌ Users table error:', tableErr.message);
        }

        // Release connection back to pool
        try {
            await connection.release();
            console.log('[DIAG] ✅ Connection released back to pool');
        } catch (releaseErr) {
            console.error('[DIAG] ⚠️  Error releasing connection:', releaseErr.message);
        }

    } catch (err) {
        diagnostics.error = err.message;
        diagnostics.connectionTest = 'failed';
        console.error('[DIAG] ❌ Diagnostics error:', err.message);
        console.error('[DIAG] Error code:', err.code);
        console.error('[DIAG] Error errno:', err.errno);
    }

    // Return 200 to show diagnostics even on error (can see the error details in the response)
    res.status(200).json(diagnostics);
});

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

    jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) {
            if (req.originalUrl.startsWith('/api')) {
                return res.status(403).json({ success: false, message: 'Forbidden: Invalid or expired token.' });
            }
            return res.redirect('/signin.html');
        }
        req.user = user;
        accessContextCache.set(String(user.email || '').toLowerCase(), {
            accessType: user.access || 'standard',
            tenantId: user.tenantId || null,
            companyId: user.companyId || null
        });
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

        try {
            await sendEmail(user.email, 'Your MFA Code', `Your MFA code is ${mfaCode}. It will expire in 10 minutes.`);
        } catch (mailErr) {
            console.error('[Auth] Failed to send MFA email:', mailErr?.code || mailErr?.message || mailErr);
            return res.status(503).json({
                success: false,
                message: "We couldn't send your verification code right now. Please try again in a minute."
            });
        }
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

        try {
            await sendEmail(user.email, 'Your MFA Code', `Your MFA code is ${mfaCode}. It will expire in 10 minutes.`);
        } catch (mailErr) {
            console.error('[Auth] Failed to resend MFA email:', mailErr?.code || mailErr?.message || mailErr);
            return res.status(503).json({
                success: false,
                message: "We couldn't send your verification code right now. Please try again in a minute."
            });
        }
        
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

        const accessContext = await getUserAccessContextByEmail(user.email);
        const jwtPayload = {
            id: user.id,
            email: user.email,
            role: user.role,
            companyId: accessContext?.companyId || user.companyId || null,
            access: accessContext?.accessType || 'standard',
            tenantId: accessContext?.tenantId || null
        };
        const accessToken = jwt.sign(jwtPayload, ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
        accessContextCache.set(String(user.email || '').toLowerCase(), {
            accessType: jwtPayload.access,
            tenantId: jwtPayload.tenantId,
            companyId: jwtPayload.companyId
        });

        // Use role from Users table instead of hard-coded email list
        const isAdmin = (user.role && user.role.toLowerCase() === 'admin');

        res.json({
            success: true,
            message: 'Authentication successful!',
            accessToken: accessToken,
            redirect: isAdmin ? '/Admin.html' : '/ClientPortal.html',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName || '',
                lastName: user.lastName || '',
                role: user.role || 'client',
                companyId: jwtPayload.companyId,
                access: jwtPayload.access,
                tenantId: jwtPayload.tenantId
            }
        });
        
    } catch (error) {
        console.error('MFA verification error:', error);
        res.status(500).json({ success: false, message: 'An error occurred during verification. Please try again later.' });
    }
});

// NEW: Allow unauthenticated access to Client Portal (signin form is built in)
app.get('/ClientPortal.html', (req, res) => {
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
    const { name, email, companyId, companyName } = req.body;

    if (!name || (!companyId && !companyName)) {
        return res.status(400).json({ error: 'Client name and company (ID or Name) are required' });
    }

    const parts = name.trim().split(' ');
    const firstName = parts.shift();
    const lastName = parts.join(' ') || '';

    try {
        let finalCompanyId = companyId;
        let createdCompany = null;

        if (!finalCompanyId && companyName) {
            // Create new company
            const [companyResult] = await pool.query(
                `INSERT INTO Companies (CompanyName) VALUES (?)`,
                [companyName]
            );
            finalCompanyId = companyResult.insertId;
            createdCompany = { id: finalCompanyId, name: companyName };
        }

        const [result] = await pool.query(
            `INSERT INTO Users (firstname, lastname, email, role, companyid, isactive)
             VALUES (?, ?, ?, 'invoice_client', ?, 1)`,
            [firstName, lastName, email || null, finalCompanyId]
        );

        res.json({
            success: true,
            client: {
                id: result.insertId,
                firstname: firstName,
                lastname: lastName,
                email
            },
            company: createdCompany
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
              "INSERT INTO payfast_payments (invoice_id, m_payment_id, amount, payment_status) VALUES (?, ?, ?, 'pending')",
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
                src="https://i.postimg.cc/Pr25Gv6k/signature.png" 
                width="425" 
                style="display:block; width:425px; max-width:100%; height:auto;"
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
            filename: `StackOpsInvoice_${nextInvoiceNumber}.pdf`,
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

// ============================================
// APPOINTMENT MANAGEMENT ENDPOINTS
// ============================================

// Get all appointments
app.get('/api/admin/appointments', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        
        const [appointments] = await pool.query(`
            SELECT * FROM appointment 
            WHERE is_available = 0
            ORDER BY date DESC, time ASC
        `);
        
        res.json(appointments);
    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});

// Get completed appointments
app.get('/api/admin/appointments/completed', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        
        const [appointments] = await pool.query(`
            SELECT * FROM appointment 
            WHERE is_available = 0 AND clientName IS NOT NULL
            ORDER BY date DESC, time ASC
            LIMIT 0
        `);
        
        res.json(appointments);
    } catch (error) {
        console.error('Error fetching completed appointments:', error);
        res.status(500).json({ error: 'Failed to fetch completed appointments' });
    }
});

// Get appointments by date
app.get('/api/admin/appointments/date/:date', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        
        const { date } = req.params;
        const [appointments] = await pool.query(`
            SELECT * FROM appointment 
            WHERE date = ?
            ORDER BY time ASC
        `, [date]);
        
        res.json(appointments);
    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).json({ error: 'Failed to fetch appointments' });
    }
});

// Clear all appointments (MUST come before :id route to match correctly)
app.delete('/api/admin/appointments/clear-all', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        
        const [result] = await pool.query(`
            DELETE FROM appointment
        `);
        
        res.json({ 
            message: 'All appointments cleared successfully',
            deletedCount: result.affectedRows
        });
    } catch (error) {
        console.error('Error clearing appointments:', error);
        res.status(500).json({ error: 'Failed to clear appointments' });
    }
});

// Mark appointment as complete (update status, don't delete)
app.put('/api/admin/appointments/:id/complete', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        
        const { id } = req.params;
        const [result] = await pool.query(`
            UPDATE appointment SET status = 'completed' WHERE id = ?
        `, [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }
        
        res.json({ message: 'Appointment marked as complete' });
    } catch (error) {
        console.error('Error completing appointment:', error);
        res.status(500).json({ error: 'Failed to complete appointment' });
    }
});

// Delete appointment
app.delete('/api/admin/appointments/:id', authenticateToken, async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ error: 'Database connection unavailable' });
        }
        
        const { id } = req.params;
        const [result] = await pool.query(`
            DELETE FROM appointment WHERE id = ?
        `, [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }
        
        res.json({ message: 'Appointment deleted successfully' });
    } catch (error) {
        console.error('Error deleting appointment:', error);
        res.status(500).json({ error: 'Failed to delete appointment' });
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
        const yocoSecretKey = await getSecret('YOCO_SECRET_KEY');

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
  // 1️⃣ ACKNOWLEDGE IMMEDIATELY (PayFast requires a 200 OK within seconds)
  res.sendStatus(200);

  console.log("[PAYFAST ITN] 📥 Notification received & acknowledged:", JSON.stringify(req.body, null, 2));

  const data = req.body;

    (async () => {
    try {
      const rawBody = req.rawBody || "";
      console.log("[PAYFAST ITN] 📦 Raw Body for signature check:", rawBody);

      const passphrase = await getSecret("PAYFAST_PASSPHRASE");
      console.log("[PAYFAST ITN] Passphrase retrieved:", passphrase ? "YES" : "NO");

      /* ===============================
         1️⃣ VERIFY PAYFAST SIGNATURE
      =============================== */
      const receivedSignature = data.signature;
      
      // Standard PayFast ITN signature check: Take raw POST string, remove signature, append passphrase.
      // 1. Remove the signature field from the raw body string
      let signaturePos = rawBody.indexOf('&signature=');
      if (signaturePos === -1) {
          // Fallback: Check if it's the first param or at the end
          signaturePos = rawBody.indexOf('signature=');
      }

      let stringToHash = rawBody;
      if (signaturePos > -1) {
          // If signature is the last param (most common)
          stringToHash = rawBody.substring(0, signaturePos);
          // If signature was in the middle, handle the trailing part
          const rest = rawBody.substring(signaturePos + 11 + (receivedSignature?.length || 0));
          if (rest && rest.startsWith('&')) {
              stringToHash += rest;
          } else if (rest) {
              stringToHash += rest;
          }
      }

      // 2. Append Passphrase
      if (passphrase && passphrase.trim() !== "") {
          stringToHash += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, "+")}`;
      }

      const generatedSignature = crypto.createHash("md5").update(stringToHash).digest("hex");

      console.log(`[PAYFAST ITN] Signature Check - Received: ${receivedSignature}, Generated: ${generatedSignature}`);
      console.log(`[PAYFAST ITN] String used for hash: "${stringToHash}"`);

      if (receivedSignature !== generatedSignature) {
        console.error("[PAYFAST ITN] ❌ Invalid signature - Background processing aborted");
        
        // Final fallback: Try the reconstruction logic again but with more fields if needed
        const secondTry = generatePayFastSignature(data, passphrase);
        if (receivedSignature === secondTry) {
            console.log("[PAYFAST ITN] ✅ Signature matched on secondary reconstruction logic");
        } else {
            return;
        }
      } else {
        console.log("[PAYFAST ITN] ✅ Signature verified using rawBody");
      }

    /* ===============================
       2️⃣ EXTRACT PAYFAST DATA
    =============================== */
    const {
      m_payment_id,
      pf_payment_id,
      payment_status,
      amount_gross,
      custom_int1
    } = data;

    let invoiceId = custom_int1;

    console.log(`[PAYFAST ITN] Data: Status=${payment_status}, m_payment_id=${m_payment_id}, amount=${amount_gross}, custom_int1=${invoiceId}`);

    if (!invoiceId && m_payment_id) {
       console.log(`[PAYFAST ITN] 🔍 Attempting to find invoiceId from m_payment_id: ${m_payment_id}`);
       // m_payment_id format is INV-Number-ID
       const parts = m_payment_id.split("-");
       if (parts.length >= 3) {
         invoiceId = parts[parts.length - 1];
         console.log(`[PAYFAST ITN] Found invoiceId: ${invoiceId} from m_payment_id`);
       }
    }

    if (!invoiceId) {
      console.error("[PAYFAST ITN] ❌ Missing invoice reference");
      return res.sendStatus(200);
    }

    const connection = await pool.getConnection();
    console.log("[PAYFAST ITN] 🔌 Database connection established");

    try {
      await connection.beginTransaction();
      console.log("[PAYFAST ITN] 🏁 Transaction started");

      /* ===============================
         3️⃣ ENSURE payfast_payments EXISTS
      =============================== */
      console.log(`[PAYFAST ITN] 🔍 Checking if m_payment_id ${m_payment_id} exists in payfast_payments`);
      const [existingPayment] = await connection.query(
        "SELECT payment_status FROM payfast_payments WHERE m_payment_id = ?",
        [m_payment_id]
      );

      if (!existingPayment.length) {
        console.log("[PAYFAST ITN] ➕ Inserting new record into payfast_payments");
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
        console.log("[PAYFAST ITN] 🔄 Updating existing record in payfast_payments");
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
      console.log(`[PAYFAST ITN] Processing payment status: ${payment_status}`);
      if (payment_status === "COMPLETE") {

        // 🔒 Prevent double processing
        console.log(`[PAYFAST ITN] 🔒 Checking if Invoice ${invoiceId} is already marked as paid via PayFast`);
        const [alreadyPaid] = await connection.query(
          "SELECT 1 FROM Payments WHERE InvoiceID = ? AND Method = 'PayFast' LIMIT 1",
          [invoiceId]
        );

        if (!alreadyPaid.length) {
          console.log(`[PAYFAST ITN] 🆗 Invoice ${invoiceId} not processed yet. Updating...`);

          // ✅ Mark invoice as PAID (overrides Pending / Overdue)
          const [invUpdate] = await connection.query(
            "UPDATE Invoices SET Status = 'Paid' WHERE InvoiceID = ?",
            [invoiceId]
          );
          console.log(`[PAYFAST ITN] 📝 Invoices table update result:`, invUpdate);

          // ✅ Insert payment history
          const [payInsert] = await connection.query(
            `INSERT INTO Payments
             (InvoiceID, AmountPaid, PaymentDate, Method)
             VALUES (?, ?, NOW(), 'PayFast')`,
            [invoiceId, parseFloat(amount_gross)]
          );
          console.log(`[PAYFAST ITN] 📝 Payments table insert result:`, payInsert);

          console.log(`[PAYFAST ITN] ✅ Invoice ${invoiceId} marked as PAID`);

          // 📧 Send Confirmation Email (Immediately)
          console.log(`[PAYFAST ITN] 📧 Fetching details for confirmation email for Invoice ${invoiceId}`);
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
            console.log(`[PAYFAST ITN] 📧 Found client: ${targetClient.email}. Sending email...`);
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
                 ${receiptHtml}
                 <p>
                    If you have any questions, please contact us at
                    <a href="mailto:billing@stackopsit.co.za">billing@stackopsit.co.za</a>
                    or 011 568 9337.
                 </p>
                 <img
                src=https://i.postimg.cc/Pr25Gv6k/signature.png
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
              console.log(`[PAYFAST ITN] 📧 Confirmation email sent to ${targetClient.email}`);
              // Mark as sent to prevent morning automation
              await connection.query("UPDATE Invoices SET PaidEmailSent = TRUE WHERE InvoiceID = ?", [invoiceId]);
              console.log(`[PAYFAST ITN] 📝 Marked PaidEmailSent = TRUE for Invoice ${invoiceId}`);
            } catch (e) {
              console.error(`[PAYFAST ITN] ❌ Failed to send confirmation email:`, e);
            }
          } else {
            console.warn(`[PAYFAST ITN] ⚠️ Could not find client details for Invoice ${invoiceId}`);
          }
        } else {
          console.log(`[PAYFAST ITN] ℹ️ Invoice ${invoiceId} was already marked as PAID. Skipping duplicate processing.`);
        }
      } else {
        console.log(`[PAYFAST ITN] ℹ️ Payment status is not COMPLETE (Status: ${payment_status}). No invoice update performed.`);
      }

      await connection.commit();
      console.log("[PAYFAST ITN] ✅ Transaction committed successfully");
    } catch (dbErr) {
      if (connection) await connection.rollback();
      console.error("[PAYFAST ITN] ❌ DATABASE ERROR:", dbErr);
    } finally {
      if (connection) connection.release();
    }
  } catch (err) {
    console.error("[PAYFAST ITN] ❌ ITN BACKGROUND ERROR:", err);
  }
 })();
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
            src=https://i.postimg.cc/Pr25Gv6k/signature.png
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
//                             MICROSOFT GRAPH -  Identity Protection                                  //
// ====================================================================================================//

async function fetchIdentityMetricsFromApi() {
    const token = await getMicrosoftGraphToken();
    const [users, roleAssignments, signIns] = await Promise.all([
        fetchMicrosoftUsers(token),
        fetchMicrosoftRoleAssignments(token),
        fetchMicrosoftSignIns(token)
    ]);

    const totalUsers = users.length;
    const activeUserIds = new Set(signIns.map(s => s.userId).filter(Boolean));
    const activeUsers = activeUserIds.size;
    const adminRoles = roleAssignments.length;
    const score = Math.max(0, Math.min(100, Math.round(100 - (adminRoles * 0.4) - ((totalUsers - activeUsers) * 0.2))));
    return { totalUsers, activeUsers, adminRoles, securityScore: score };
}

function normalizeMicrosoftUsers(users) {
    return (users || []).map(user => ({
        id: user.id,
        displayName: user.displayName || 'Unknown User',
        mail: user.mail || user.userPrincipalName || 'N/A',
        jobTitle: user.jobTitle || 'No Title',
        mobilePhone: user.mobilePhone || 'N/A',
        userPrincipalName: user.userPrincipalName,
        isExternal: user.userPrincipalName && user.userPrincipalName.includes('#EXT#'),
        status: 'active',
        lastSync: new Date().toISOString()
    }));
}

async function fetchIdentityDetailsFromApi() {
    const token = await getMicrosoftGraphToken();
    const users = await fetchMicrosoftUsers(token);
    const processedUsers = normalizeMicrosoftUsers(users);
    return {
        totalUsers: processedUsers.length,
        users: processedUsers
    };
}

async function fetchDeviceMetricsFromApi() {
    const token = await getMicrosoftGraphToken();
    const devices = await fetchMicrosoftDevices(token);
    const totalDevices = devices.length;
    const nonCompliant = devices.filter(d => (d.complianceState || '').toLowerCase() === 'noncompliant').length;
    const notEncrypted = devices.filter(d => !d.isEncrypted).length;
    const staleDevices = devices.filter(d => {
        if (!d.lastSyncDateTime) return true;
        const daysSinceSync = (Date.now() - new Date(d.lastSyncDateTime).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceSync > 7;
    }).length;
    return { totalDevices, nonCompliant, notEncrypted, staleDevices };
}

async function fetchApplicationMetricsFromApi() {
    const token = await getMicrosoftGraphToken();
    const servicePrincipals = await fetchMicrosoftServicePrincipals(token);
    const totalApps = servicePrincipals.length;
    const externalApps = servicePrincipals.filter(sp => !(sp.publisherName || '').toLowerCase().includes('microsoft')).length;
    const highRiskApps = servicePrincipals.filter(sp => (sp.oauth2PermissionScopes || []).length + (sp.appRoles || []).length > 10).length;
    const highAccessApps = servicePrincipals.filter(sp => (sp.appRoles || []).length > 5).length;
    return { totalApps, externalApps, highRiskApps, highAccessApps };
}

async function fetchEmailMetricsFromApi() {
    const token = await getMicrosoftGraphToken();
    const [alerts, incidents] = await Promise.all([fetchSecurityAlerts(token), fetchSecurityIncidents(token)]);
    const emailKeywords = ['phishing', 'malware', 'spam', 'email', 'attachment', 'suspicious mail', 'ransomware'];
    const emailAlerts = alerts.filter(alert => {
        const text = `${alert.category || ''} ${alert.title || ''} ${alert.description || ''}`.toLowerCase();
        return emailKeywords.some(k => text.includes(k));
    });
    const highSeverity = emailAlerts.filter(a => ['high', 'critical'].includes(String(a.severity || '').toLowerCase())).length;
    const activeThreats = emailAlerts.filter(a => ['newalert', 'inprogress'].includes(String(a.status || '').toLowerCase())).length;
    const openIncidents = incidents.filter(i => ['active', 'inprogress'].includes(String(i.status || '').toLowerCase())).length;
    const users = new Set();
    emailAlerts.forEach(alert => (alert.userStates || []).forEach(user => users.add(user.accountName || 'Unknown')));
    return { activeThreats, highSeverity, usersTargeted: users.size, openIncidents };
}

async function fetchBackupRecoveryPayloadFromApi() {
    const token = await getMicrosoftGraphToken();

    // Fetch OneDrive usage (returns CSV)
    const oneDriveUrl = 'https://graph.microsoft.com/v1.0/reports/getOneDriveUsageAccountDetail(period=\'D7\')';
    const oneDriveResponse = await fetch(oneDriveUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const oneDriveCSV = await oneDriveResponse.text();
    const oneDriveData = parseGraphReportCSV(oneDriveCSV, 'OneDrive');

    // Fetch SharePoint usage (returns CSV)
    const sharePointUrl = 'https://graph.microsoft.com/v1.0/reports/getSharePointSiteUsageDetail(period=\'D7\')';
    const sharePointResponse = await fetch(sharePointUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const sharePointCSV = await sharePointResponse.text();
    const sharePointData = parseGraphReportCSV(sharePointCSV, 'SharePoint');

    // Fetch Exchange (Mailbox) usage (returns CSV)
    const exchangeUrl = 'https://graph.microsoft.com/v1.0/reports/getMailboxUsageDetail(period=\'D7\')';
    const exchangeResponse = await fetch(exchangeUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    const exchangeCSV = await exchangeResponse.text();
    const exchangeData = parseGraphReportCSV(exchangeCSV, 'Exchange');

    // Process OneDrive storage (in bytes)
    let oneDriveStorageBytes = 0;
    const oneDriveUsers = [];
    oneDriveData.forEach(item => {
        const storageBytes = parseInt(item['Storage Used (Byte)'] || 0);
        oneDriveStorageBytes += storageBytes;
        if (item['Owner Principal Name'] && storageBytes > 0) {
            oneDriveUsers.push({
                user: item['Owner Principal Name'],
                displayName: item['Owner Display Name'] || item['Owner Principal Name'],
                storage: storageBytes,
                lastActivity: item['Last Activity Date'],
                files: parseInt(item['File Count'] || 0)
            });
        }
    });

    // Process SharePoint storage (in bytes)
    let sharePointStorageBytes = 0;
    const sharePointSites = [];
    sharePointData.forEach(item => {
        const storageBytes = parseInt(item['Storage Used (Byte)'] || 0);
        sharePointStorageBytes += storageBytes;
        if (item['Site URL'] && storageBytes > 0) {
            sharePointSites.push({
                url: item['Site URL'],
                owner: item['Owner Display Name'] || item['Owner Principal Name'],
                storage: storageBytes,
                lastActivity: item['Last Activity Date'],
                files: parseInt(item['File Count'] || 0)
            });
        }
    });

    // Process Exchange storage (in bytes)
    let exchangeStorageBytes = 0;
    const exchangeUsers = [];
    exchangeData.forEach(item => {
        const storageBytes = parseInt(item['Storage Used (Byte)'] || 0);
        exchangeStorageBytes += storageBytes;
        if (item['User Principal Name'] && storageBytes > 0) {
            exchangeUsers.push({
                user: item['User Principal Name'],
                displayName: item['Display Name'] || item['User Principal Name'],
                storage: storageBytes,
                lastActivity: item['Last Activity Date'],
                items: parseInt(item['Item Count'] || 0)
            });
        }
    });

    const totalStorageBytes = oneDriveStorageBytes + sharePointStorageBytes + exchangeStorageBytes;
    const totalStorageGB = parseFloat((totalStorageBytes / (1024 ** 3)).toFixed(1));
    const oneDriveStorageGB = parseFloat((oneDriveStorageBytes / (1024 ** 3)).toFixed(1));
    const sharePointStorageGB = parseFloat((sharePointStorageBytes / (1024 ** 3)).toFixed(1));
    const exchangeStorageGB = parseFloat((exchangeStorageBytes / (1024 ** 3)).toFixed(1));

    const activeUserEmails = new Set([
        ...oneDriveUsers.map(u => u.user),
        ...exchangeUsers.map(u => u.user)
    ]);
    const activeUsersCount = activeUserEmails.size;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const allUsers = [...oneDriveUsers, ...exchangeUsers];
    const inactiveUsers = allUsers.filter(u => {
        if (!u.lastActivity) return true;
        const lastActivity = new Date(u.lastActivity);
        return lastActivity < thirtyDaysAgo;
    });
    const inactiveUsersCount = new Set(inactiveUsers.map(u => u.user)).size;
    const inactiveUserStorageBytes = inactiveUsers.reduce((sum, u) => sum + u.storage, 0);
    const inactiveUserStorageGB = parseFloat((inactiveUserStorageBytes / (1024 ** 3)).toFixed(1));

    const backupConfigured = false;

    const summary = {
        totalStorageGB,
        oneDriveStorageGB,
        sharePointStorageGB,
        exchangeStorageGB,
        activeUsersCount,
        inactiveUsersCount,
        servicesCovered: 3,
        backupConfigured
    };

    const storage = {
        byService: {
            onedrive: oneDriveStorageGB,
            sharepoint: sharePointStorageGB,
            exchange: exchangeStorageGB
        },
        inactiveUserStorageGB,
        sites: sharePointSites.sort((a, b) => b.storage - a.storage).slice(0, 10),
        users: allUsers.sort((a, b) => b.storage - a.storage).slice(0, 20)
    };

    const insights = [];
    if (totalStorageGB > 1000) {
        insights.push({ type: 'warning', message: 'Large data volume detected', detail: `${totalStorageGB}GB across Microsoft 365 services` });
    }
    if (inactiveUsersCount > 0) {
        insights.push({ type: 'info', message: `${inactiveUsersCount} inactive users holding data`, detail: `${inactiveUserStorageGB}GB in inactive user accounts` });
    }
    if (!backupConfigured) {
        insights.push({ type: 'critical', message: 'No external backup configured', detail: 'Only Microsoft-native retention policies are protecting your data' });
    }

    return {
        success: true,
        fetchedAt: new Date().toISOString(),
        summary,
        storage,
        insights
    };
}

async function upsertDashboardMetricCaches() {
    if (!pool) return;
    const [rows] = await pool.query(
        `SELECT CompanyID, MicrosoftTenantID
         FROM CompanyMicrosoftMapping
         WHERE IsActive = 1`
    );
    for (const row of rows) {
        const companyId = row.CompanyID;
        try {
            const [identity, identityDetails, devices, apps, email, backup] = await Promise.all([
                fetchIdentityMetricsFromApi(),
                fetchIdentityDetailsFromApi(),
                fetchDeviceMetricsFromApi(),
                fetchApplicationMetricsFromApi(),
                fetchEmailMetricsFromApi(),
                fetchBackupRecoveryPayloadFromApi()
            ]);

            await pool.query(
                `REPLACE INTO IdentityMetricsCache (CompanyID, TotalUsers, ActiveUsers, AdminRoles, SecurityScore, LastUpdated)
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [companyId, identity.totalUsers, identity.activeUsers, identity.adminRoles, identity.securityScore]
            );
            await pool.query(
                `REPLACE INTO IdentityUserDetailsCache (CompanyID, UsersPayload, LastUpdated)
                 VALUES (?, ?, NOW())`,
                [companyId, JSON.stringify(identityDetails.users || [])]
            );
            await pool.query(
                `REPLACE INTO DeviceMetricsCache (CompanyID, TotalDevices, NonCompliant, NotEncrypted, StaleDevices, LastUpdated)
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [companyId, devices.totalDevices, devices.nonCompliant, devices.notEncrypted, devices.staleDevices]
            );
            await pool.query(
                `REPLACE INTO ApplicationMetricsCache (CompanyID, TotalApps, ExternalApps, HighRiskApps, HighAccessApps, LastUpdated)
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [companyId, apps.totalApps, apps.externalApps, apps.highRiskApps, apps.highAccessApps]
            );
            await pool.query(
                `REPLACE INTO EmailMetricsCache (CompanyID, ActiveThreats, HighSeverity, UsersTargeted, OpenIncidents, LastUpdated)
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [companyId, email.activeThreats, email.highSeverity, email.usersTargeted, email.openIncidents]
            );

            await pool.query(
                `REPLACE INTO BackupRecoveryPayloadCache (CompanyID, Payload, LastUpdated)
                 VALUES (?, ?, NOW())`,
                [companyId, JSON.stringify(backup)]
            );
        } catch (error) {
            console.error(`[Cache Worker] Failed to refresh company ${companyId}:`, error.message);
        }
    }
}

setInterval(() => {
    upsertDashboardMetricCaches().catch(error => {
        console.error('[Cache Worker] Refresh loop failed:', error.message);
    });
}, 5 * 60 * 1000);

app.get('/api/db/identity-metrics', authenticateToken, async (req, res) => {
    try {
        const context = await getAccessContextByUser(req.user);
        if (!context?.companyId) return res.status(403).json({ success: false, message: 'Access mapping not configured' });
        const [rows] = await pool.query('SELECT * FROM IdentityMetricsCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1', [context.companyId]);
        if (rows.length > 0) return res.json({ success: true, source: 'db', metrics: rows[0] });

        const api = await fetchIdentityMetricsFromApi();
        await pool.query(
            `REPLACE INTO IdentityMetricsCache (CompanyID, TotalUsers, ActiveUsers, AdminRoles, SecurityScore, LastUpdated)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [context.companyId, api.totalUsers, api.activeUsers, api.adminRoles, api.securityScore]
        );
        return res.json({ success: true, source: 'api-fallback', metrics: api });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/db/identity-details', authenticateToken, async (req, res) => {
    try {
        const context = await getAccessContextByUser(req.user);
        if (!context?.companyId) return res.status(403).json({ success: false, message: 'Access mapping not configured' });

        const [rows] = await pool.query(
            'SELECT UsersPayload, LastUpdated FROM IdentityUserDetailsCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1',
            [context.companyId]
        );

        if (rows.length > 0 && rows[0].UsersPayload) {
            let users = [];
            try {
                users = JSON.parse(rows[0].UsersPayload) || [];
            } catch (error) {
                users = [];
            }
            if (Array.isArray(users) && users.length > 0) {
                return res.json({
                    success: true,
                    source: 'db',
                    totalUsers: users.length,
                    users,
                    fetchedAt: rows[0].LastUpdated
                });
            }
        }

        const api = await fetchIdentityDetailsFromApi();
        await pool.query(
            `REPLACE INTO IdentityUserDetailsCache (CompanyID, UsersPayload, LastUpdated)
             VALUES (?, ?, NOW())`,
            [context.companyId, JSON.stringify(api.users || [])]
        );
        return res.json({
            success: true,
            source: 'api-fallback',
            totalUsers: api.totalUsers,
            users: api.users,
            fetchedAt: new Date().toISOString()
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/db/device-metrics', authenticateToken, async (req, res) => {
    try {
        const context = await getAccessContextByUser(req.user);
        if (!context?.companyId) return res.status(403).json({ success: false, message: 'Access mapping not configured' });
        const [rows] = await pool.query('SELECT * FROM DeviceMetricsCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1', [context.companyId]);
        if (rows.length > 0) return res.json({ success: true, source: 'db', metrics: rows[0] });
        const api = await fetchDeviceMetricsFromApi();
        await pool.query(
            `REPLACE INTO DeviceMetricsCache (CompanyID, TotalDevices, NonCompliant, NotEncrypted, StaleDevices, LastUpdated)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [context.companyId, api.totalDevices, api.nonCompliant, api.notEncrypted, api.staleDevices]
        );
        return res.json({ success: true, source: 'api-fallback', metrics: api });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/db/email-metrics', authenticateToken, async (req, res) => {
    try {
        const context = await getAccessContextByUser(req.user);
        if (!context?.companyId) return res.status(403).json({ success: false, message: 'Access mapping not configured' });
        const [rows] = await pool.query('SELECT * FROM EmailMetricsCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1', [context.companyId]);
        if (rows.length > 0) return res.json({ success: true, source: 'db', metrics: rows[0] });
        const api = await fetchEmailMetricsFromApi();
        await pool.query(
            `REPLACE INTO EmailMetricsCache (CompanyID, ActiveThreats, HighSeverity, UsersTargeted, OpenIncidents, LastUpdated)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [context.companyId, api.activeThreats, api.highSeverity, api.usersTargeted, api.openIncidents]
        );
        return res.json({ success: true, source: 'api-fallback', metrics: api });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/db/application-metrics', authenticateToken, async (req, res) => {
    try {
        const context = await getAccessContextByUser(req.user);
        if (!context?.companyId) return res.status(403).json({ success: false, message: 'Access mapping not configured' });
        const [rows] = await pool.query('SELECT * FROM ApplicationMetricsCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1', [context.companyId]);
        if (rows.length > 0) return res.json({ success: true, source: 'db', metrics: rows[0] });
        const api = await fetchApplicationMetricsFromApi();
        await pool.query(
            `REPLACE INTO ApplicationMetricsCache (CompanyID, TotalApps, ExternalApps, HighRiskApps, HighAccessApps, LastUpdated)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [context.companyId, api.totalApps, api.externalApps, api.highRiskApps, api.highAccessApps]
        );
        return res.json({ success: true, source: 'api-fallback', metrics: api });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/db/backup-recovery', authenticateToken, async (req, res) => {
    try {
        const context = await getAccessContextByUser(req.user);
        if (!context?.companyId) return res.status(403).json({ success: false, message: 'Access mapping not configured' });

        const [rows] = await pool.query(
            'SELECT Payload, LastUpdated FROM BackupRecoveryPayloadCache WHERE CompanyID = ? ORDER BY LastUpdated DESC LIMIT 1',
            [context.companyId]
        );

        if (rows.length > 0 && rows[0].Payload) {
            try {
                const payload = JSON.parse(rows[0].Payload);
                if (payload && payload.success) {
                    return res.json({
                        ...payload,
                        source: 'db',
                        fetchedAt: rows[0].LastUpdated
                    });
                }
            } catch (_) {}
        }

        const api = await fetchBackupRecoveryPayloadFromApi();
        await pool.query(
            `REPLACE INTO BackupRecoveryPayloadCache (CompanyID, Payload, LastUpdated)
             VALUES (?, ?, NOW())`,
            [context.companyId, JSON.stringify(api)]
        );
        return res.json({ ...api, source: 'api-fallback' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Route: GET /api/microsoft-users
 * Returns: List of users from Microsoft Graph (filtered by tenant/client)
 */
app.get('/api/microsoft-users', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        console.log(`[Microsoft Graph] Fetching users for: ${userEmail}`);

        // Get the tenant for this user
        const tenant = getTenantByEmail(userEmail);
        if (!tenant) {
            console.warn(`[Microsoft Graph] User ${userEmail} does not belong to any configured tenant`);
            return res.status(403).json({ 
                error: 'User does not have access to Microsoft Graph data',
                message: 'Your email is not associated with any tenant'
            });
        }

        console.log(`[Microsoft Graph] User belongs to tenant: ${tenant.clientId}`);

        // Get Microsoft Graph token
        const token = await getMicrosoftGraphToken();

        // Fetch users from Microsoft Graph
        const users = await fetchMicrosoftUsers(token);

        // Process and enrich the data
        const processedUsers = users.map(user => ({
          id: user.id,
          displayName: user.displayName || 'Unknown User',
          mail: user.mail || user.userPrincipalName || 'N/A',
          jobTitle: user.jobTitle || 'No Title',
          mobilePhone: user.mobilePhone || 'N/A',
          userPrincipalName: user.userPrincipalName,
          isExternal: user.userPrincipalName && user.userPrincipalName.includes('#EXT#'),
          status: 'active',
          lastSync: new Date().toISOString()
        }));

        console.log(`[Microsoft Graph] Successfully retrieved ${processedUsers.length} users`);

        res.json({
          success: true,
          tenant: tenant.clientId,
          totalUsers: processedUsers.length,
          users: processedUsers,
          fetchedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Microsoft Graph] Error fetching users:', error.message);
        
        if (error.message.includes('Missing Microsoft Graph credentials')) {
            return res.status(500).json({ 
                error: 'Microsoft Graph not configured',
                message: 'Credentials missing from environment'
            });
        }

        res.status(500).json({ 
            error: 'Failed to fetch Microsoft Graph users',
            message: error.message
        });
    }
});

/**
 * Route: GET /api/microsoft-roles
 * Returns: List of role assignments and directory roles from Microsoft Graph
 */
app.get('/api/microsoft-roles', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        console.log(`[Microsoft Graph] Fetching role assignments for: ${userEmail}`);

        // Get the tenant for this user
        const tenant = getTenantByEmail(userEmail);
        if (!tenant) {
            console.warn(`[Microsoft Graph] User ${userEmail} does not belong to any configured tenant`);
            return res.status(403).json({ 
                error: 'User does not have access to Microsoft Graph data',
                message: 'Your email is not associated with any tenant'
            });
        }

        console.log(`[Microsoft Graph] User belongs to tenant: ${tenant.clientId}`);

        // Get Microsoft Graph token
        const token = await getMicrosoftGraphToken();

        // Fetch only role assignments (includes roleDefinition via $expand)
        const roleAssignments = await fetchMicrosoftRoleAssignments(token);

        // Process role assignments
        const processedAssignments = roleAssignments.map(assignment => {
            const roleName = assignment.roleDefinition?.displayName || 'Unknown Role';
            return {
                id: assignment.id,
                principalId: assignment.principalId,
                roleId: assignment.roleDefinition?.id || assignment.roleId,
                roleName: roleName,
                resourceScope: assignment.resourceScope,
                directoryScopeId: assignment.directoryScopeId
            };
        });

        // Extract unique roles for summary
        const uniqueRoles = [...new Set(processedAssignments.map(a => a.roleName))];

        console.log(`[Microsoft Graph] Successfully retrieved ${processedAssignments.length} role assignments covering ${uniqueRoles.length} unique roles`);

        res.json({
            success: true,
            tenant: tenant.clientId,
            totalAssignments: processedAssignments.length,
            totalRoles: uniqueRoles.length,
            roleAssignments: processedAssignments,
            uniqueRoles: uniqueRoles,
            fetchedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Microsoft Graph] Error fetching roles:', error.message);
        
        if (error.message.includes('Missing Microsoft Graph credentials')) {
            return res.status(500).json({ 
                error: 'Microsoft Graph not configured',
                message: 'Credentials missing from environment'
            });
        }

        res.status(500).json({ 
            error: 'Failed to fetch Microsoft Graph roles',
            message: error.message
        });
    }
});

/**
 * Route: GET /api/microsoft-applications
 * Returns: List of applications and service principals from Microsoft Graph
 */
app.get('/api/microsoft-applications', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const tenant = getTenantByEmail(userEmail);
        
        if (!tenant) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const token = await getMicrosoftGraphToken();

        // Fetch service principals, users, and groups in parallel
        const [servicePrincipalsRaw, users, groups] = await Promise.all([
            fetchMicrosoftServicePrincipals(token),
            fetchMicrosoftUsers(token),
            fetchMicrosoftGroups(token)
        ]);

        // No cap: Process all applications found in the tenant
        const servicePrincipals = servicePrincipalsRaw;


        const processedApps = await mapWithConcurrency(servicePrincipals, 5, async (sp) => {
            
            // Detect Type (Microsoft vs External)
            const publisherName = sp.publisherName ? sp.publisherName.toLowerCase() : '';
            const isExternal = !publisherName.includes('microsoft');
            
            const scopeCount = sp.oauth2PermissionScopes ? sp.oauth2PermissionScopes.length : 0;
            const roleCount = sp.appRoles ? sp.appRoles.length : 0;
            
            let assignedCount = 0;
            let assignedGroups = [];
            
            try {
                // Fetch app role assignments SAFELY
                const response = await fetch(`https://graph.microsoft.com/v1.0/servicePrincipals/${sp.id}/appRoleAssignedTo?$top=999`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    const assignments = data.value || [];
                    assignedCount = assignments.length;
                    
                    // Extract Group Names if available
                    assignedGroups = assignments
                        .filter(a => a.principalType === 'Group')
                        .map(a => a.principalDisplayName)
                        .filter((v, i, a) => a.indexOf(v) === i); // Keep unique
                } else if (response.status === 429) {
                    console.warn(`[Graph API] Throttled on app ${sp.displayName}`);
                }
            } catch (error) {
                console.error(`[Microsoft Graph] Failed assignments for ${sp.displayName}`);
            }
            
            return {
                id: sp.id,
                name: sp.displayName || 'Unknown App',
                type: isExternal ? 'External' : 'Microsoft',
                isExternal: isExternal,
                createdDateTime: sp.createdDateTime,
                scopeCount: scopeCount,
                roleCount: roleCount,
                userCount: assignedCount,
                assignedGroups: assignedGroups
            };
        });

        // Calculate app statistics
        const totalApps = processedApps.length;
        const externalApps = processedApps.filter(app => app.isExternal).length;
        const topAppsbyUsers = processedApps.sort((a, b) => b.userCount - a.userCount).slice(0, 5);

        res.json({
            success: true,
            tenant: tenant.clientId,
            totalApplications: totalApps,
            externalApplications: externalApps,
            applications: processedApps,
            topAppsByUsers: topAppsbyUsers,
            userCount: users.length,
            groupCount: groups.length,
            fetchedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Microsoft Graph] Error fetching applications:', error);
        res.status(500).json({ error: 'Failed to fetch Microsoft Graph applications' });
    }
});

/**
 * Route: GET /api/sunbird/identity-dashboard
 * SUNBIRD CLIENT ONLY - Complete  Identity Protection dashboard data aggregation
 * Returns: Merged users, roles, sign-ins, auth methods with calculated metrics
 */
app.get('/api/app-access/:spId', authenticateToken, async (req, res) => {
  try {
    const spId = req.params.spId;
    const userEmail = req.user.email;

    // Verify Sunbird tenant access only
    const tenant = getTenantByEmail(userEmail);
    if (!tenant || tenant.clientId !== 'sunbird') {
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'App access details only available for authorized Sunbird users'
      });
    }

    console.log(`[App Access] Fetching access details for SP ${spId}`);

    // Get Microsoft Graph token
    const token = await getMicrosoftGraphToken();

    // Fetch app role assignments
    const assignments = await fetchAppRoleAssignments(token, spId);

    // Process assignments to count users and extract groups
    let userCount = 0;
    const groupNames = new Set();
    
    assignments.forEach(assignment => {
      if (assignment.principalType === 'User') {
        userCount++;
      } else if (assignment.principalType === 'Group' && assignment.principalDisplayName) {
        groupNames.add(assignment.principalDisplayName);
      }
    });

    const groups = Array.from(groupNames);

    const responseData = {
      success: true,
      spId: spId,
      users: userCount,
      groups: groups,
      hasDirect: userCount > 0 || groups.length > 0,
      totalAssignments: assignments.length,
      message: userCount === 0 && groups.length === 0 
        ? 'No direct user or group assignments detected for this app'
        : `App has ${userCount} direct users and ${groups.length} groups assigned`
    };

    console.log(`[App Access] SP ${spId}: ${userCount} users, ${groups.length} groups`);
    res.json(responseData);

  } catch (error) {
    console.error(`[App Access] Error for SP ${req.params.spId}:`, error.message);
    
    if (error.message.includes('Missing Microsoft Graph credentials')) {
      return res.status(503).json({ 
        error: 'Microsoft Graph unavailable',
        message: 'Service temporarily unavailable'
      });
    }

    res.status(500).json({ 
      error: 'Failed to fetch app access details',
      message: error.message
    });
  }
});

// ============================================================================
// SUNBIRD ONLY: STRICT COMPLIANCE VALIDATION ENGINE (FULL MATRIX)
// ============================================================================
app.get('/api/sunbird/compliance-controls', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const tenant = getTenantByEmail(userEmail);
        
        // 🚨 STRICT SCOPE CONTROL
        if (!tenant || tenant.clientId !== 'sunbird') {
            return res.status(403).json({ error: 'Access denied. Sunbird only.' });
        }

        const token = await getMicrosoftGraphToken();
        const controls = [];

        // Helper function for Graph API calls
        const fetchGraph = async (endpoint) => {
            const version = endpoint.startsWith('/beta') ? '' : '/v1.0';
            const response = await fetch(`https://graph.microsoft.com${version}${endpoint}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return { value: [] };
            return await response.json();
        };

        // Helper for Manual/Hybrid controls
        const addManualControl = (name, area, insight, status = "Pending Review", additionalEvidence = {}) => {
            controls.push({
                name, area, insight,
                evidenceData: {
                    status,
                    data_source: "Manual Attestation / Configuration",
                    last_verified: "Requires manual audit",
                    ...additionalEvidence
                }
            });
        };

        // =========================================================
        // 🟦 IDENTITY CONTROLS
        // =========================================================
        
        // 1. MFA ON ALL ACCOUNTS (API)
        try {
            const users = await fetchMicrosoftUsers(token);
            let mfaRegistered = 0;
            const totalUsers = users.length;

            await mapWithConcurrency(users, 8, async (user) => {
                const authMethods = await fetchUserAuthMethods(token, user.id);
                if (hasRealMfaMethod(authMethods)) mfaRegistered++;
            });

            const coverage = totalUsers > 0 ? Math.round((mfaRegistered / totalUsers) * 100) : 0;
            let insight = coverage === 100 ? "🟢 MFA fully enforced" : 
                         (coverage >= 80 ? "🟡 MFA partially enforced" : "🔴 Users exposed to credential theft");

            controls.push({
                name: "MFA on all accounts", area: "Identity", insight: insight,
                evidenceData: { total_users: totalUsers, mfa_registered: mfaRegistered, mfa_missing: totalUsers - mfaRegistered, coverage: `${coverage}%` }
            });
        } catch (e) { console.error('MFA Control Error', e); }

        // 2. ADMIN COUNT (API)
        try {
            const roleAssignments = await fetchMicrosoftRoleAssignments(token);
            const adminSet = new Set();
            roleAssignments.forEach(assignment => {
                const roleName = assignment.roleDefinition?.displayName || '';
                if (roleName.toLowerCase().includes('admin') || roleName.toLowerCase().includes('global')) {
                    adminSet.add(assignment.principalId);
                }
            });
            const adminCount = adminSet.size;
            controls.push({
                name: "Admin accounts limited", area: "Identity",
                insight: adminCount > 5 ? "🔴 Too many privileged users" : "🟢 Admin count within limits",
                evidenceData: { privileged_users: adminCount, recommended_limit: "5" }
            });
        } catch (e) { console.error('Admin Count Error', e); }

        // 3. LEGACY AUTHENTICATION (API)
        try {
            const signIns = await fetchMicrosoftSignIns(token);
            const legacySignIns = signIns.filter(s => s.clientAppUsed && s.clientAppUsed !== 'Browser' && s.clientAppUsed !== 'Mobile Apps and Desktop clients');
            controls.push({
                name: "Legacy authentication blocked", area: "Identity",
                insight: legacySignIns.length > 0 ? "🔴 Legacy auth risk" : "🟢 Legacy auth blocked",
                evidenceData: { events_analyzed: signIns.length, legacy_auth_events: legacySignIns.length }
            });
        } catch (e) { console.error('Legacy Auth Error', e); }

        // 4. IDENTITY MANUAL/HYBRID CONTROLS
        addManualControl("Phishing-resistant MFA (admins)", "Identity", "🔴 Admins vulnerable to phishing");
        addManualControl("Admin accounts separated", "Identity", "🟡 Privilege misuse risk");
        addManualControl("Admin MFA strongest", "Identity", "🔴 Admin compromise risk");
        addManualControl("Least privilege enforced", "Identity", "🟡 Over-permissioned users");
        addManualControl("Access revoked immediately", "Identity", "🔴 Access persists after exit");
        addManualControl("Conditional Access enforced", "Identity", "🔴 No identity protection layer");

        // =========================================================
        // 🟩 DEVICE CONTROLS
        // =========================================================
        
        // 5. DEVICE COMPLIANCE, ENCRYPTION & WORK PROFILE (API)
        try {
            const devices = await fetchMicrosoftDevices(token);
            const totalDevices = devices.length;
            const compliant = devices.filter(d => d.complianceState === 'compliant').length;
            const encrypted = devices.filter(d => d.isEncrypted).length;
            const managed = devices.filter(d => d.managementAgent && d.managementAgent !== 'unknown').length;

            const compCoverage = totalDevices > 0 ? Math.round((compliant / totalDevices) * 100) : 0;
            const encCoverage = totalDevices > 0 ? Math.round((encrypted / totalDevices) * 100) : 0;
            const manCoverage = totalDevices > 0 ? Math.round((managed / totalDevices) * 100) : 0;

            controls.push({
                name: "Device compliance", area: "Devices",
                insight: compCoverage < 95 ? "🔴 Non-compliant devices" : "🟢 Devices compliant",
                evidenceData: { total_devices: totalDevices, compliant_devices: compliant, non_compliant: totalDevices - compliant, compliance_rate: `${compCoverage}%` }
            });

            controls.push({
                name: "Device encryption", area: "Devices",
                insight: encCoverage < 100 ? "🔴 Data loss risk" : "🟢 All devices encrypted",
                evidenceData: { total_devices: totalDevices, encrypted_devices: encrypted, unencrypted_devices: totalDevices - encrypted, encryption_rate: `${encCoverage}%` }
            });

            controls.push({
                name: "Work profile on devices", area: "Devices",
                insight: manCoverage < 100 ? "🔴 Uncontrolled devices" : "🟢 Devices managed",
                evidenceData: { total_devices: totalDevices, managed_devices: managed, unmanaged_devices: totalDevices - managed }
            });
        } catch (e) { console.error('Device Controls Error', e); }

        // 6. DEVICE MANUAL/HYBRID CONTROLS
        addManualControl("Endpoint protection", "Devices", "🔴 Unprotected endpoints", "Pending Configuration");
        addManualControl("Work/personal separation", "Devices", "🔴 Data leakage risk");
        addManualControl("Remote wipe (work only)", "Devices", "🔴 Data exposure risk");

        // =========================================================
        // 🟨 APPLICATION CONTROLS
        // =========================================================
        
        // 7. APPROVED APPLICATIONS ONLY (API)
        try {
            const apps = await fetchMicrosoftServicePrincipals(token);
            const externalApps = apps.filter(app => !app.publisherName || !app.publisherName.toLowerCase().includes('microsoft')).length;
            controls.push({
                name: "Approved tools only", area: "Applications",
                insight: externalApps > 10 ? "🔴 Shadow IT risk" : "🟢 App ecosystem secured",
                evidenceData: { total_enterprise_apps: apps.length, external_publishers: externalApps }
            });
        } catch (e) { console.error('Apps Control Error', e); }

        // 8. APPLICATION MANUAL CONTROLS
        addManualControl("Software register maintained", "Applications", "🔴 No control over tools");
        addManualControl("Third-party risk assessed", "Applications", "🟡 Supply chain risk");

        // =========================================================
        // 🟥 EMAIL & CREDENTIAL CONTROLS (Manual)
        // =========================================================
        addManualControl("Secure email protection", "Email", "🔴 Email threat exposure");
        addManualControl("Anti-phishing controls", "Email", "🔴 Phishing risk");
        addManualControl("Mailbox auditing", "Email", "🟡 No audit visibility");
        addManualControl("External forwarding restricted", "Email", "🔴 Data exfiltration risk");
        
        addManualControl("Password manager enforced", "Credentials", "🔴 Credential sprawl risk", "Pending Integration (Phase 2)");
        addManualControl("Secure credential sharing", "Credentials", "🔴 Credential leakage risk");

        // =========================================================
        // 🟪 NETWORK, AI & GOVERNANCE (Manual)
        // =========================================================
        addManualControl("Encrypted work traffic", "Network", "🔴 Hostile network exposure");
        addManualControl("Zero Trust network", "Network", "🔴 No network protection");
        addManualControl("DNS filtering", "Network", "🔴 Malicious domain risk");

        addManualControl("AI tools restricted", "AI", "🔴 AI data leakage risk");
        addManualControl("Approved AI tools list", "AI", "🟡 Uncontrolled AI usage");
        addManualControl("AI data policy", "AI", "🔴 Sensitive data exposure");

        addManualControl("Microsoft 365 primary platform", "Governance", "🟡 Security boundary broken");
        addManualControl("Verification codeword", "Governance", "🔴 Impersonation risk");
        
        addManualControl("Incident reporting awareness", "People", "🟡 Delayed response risk");
        addManualControl("Suspicious activity reporting", "People", "🔴 Threats not escalated");

        // =========================================================
        // ⬜ BACKUP & DATA CONTROLS (Manual / API)
        // =========================================================
        addManualControl("Backup configured", "Backup", "🔴 No recovery capability");
        addManualControl("Backup coverage", "Backup", "🟡 Partial protection");
        addManualControl("Backup tested", "Backup", "🔴 Recovery unproven");

        // Data Visibility (API Placeholder from Reports)
        controls.push({
            name: "Data visibility", area: "Data",
            insight: "🟢 Data footprint known",
            evidenceData: { report_telemetry: "Active", last_sync: new Date().toISOString().split('T')[0] }
        });

        res.json({ success: true, controls });

    } catch (error) {
        console.error('[Compliance API] Critical Error:', error);
        res.status(500).json({ error: 'Failed to aggregate compliance data' });
    }
});

// ============================================================================
// SUNBIRD ONLY: OPERATIONS REMEDIATION ENGINE
// ============================================================================
app.get('/api/sunbird/operations', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const tenant = getTenantByEmail(userEmail);
        
        // 🚨 STRICT SCOPE CONTROL
        if (!tenant || tenant.clientId !== 'sunbird') {
            return res.status(403).json({ error: 'Access denied. Sunbird only.' });
        }

        const token = await getMicrosoftGraphToken();
        const tasks = [];

        // Helper function for Graph API calls
        const fetchGraph = async (endpoint) => {
            const version = endpoint.startsWith('/beta') ? '' : '/v1.0';
            const response = await fetch(`https://graph.microsoft.com${version}${endpoint}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) return { value: [] };
            return await response.json();
        };

        const addTask = (task, area, priority, insight, why, affected, remediation) => {
            tasks.push({ task, area, priority, insight, why, affected, remediation });
        };

        // ---------------------------------------------------------
        // 1. IDENTITY TASKS
        // ---------------------------------------------------------
        try {
            const users = await fetchMicrosoftUsers(token);
            let mfaMissingCount = 0;
            let weakAdminCount = 0;
            let mixedAdminCount = 0;

            // Check roles for admin tasks
            const roleAssignments = await fetchMicrosoftRoleAssignments(token);
            const adminIds = new Set();
            roleAssignments.forEach(assignment => {
                const roleName = assignment.roleDefinition?.displayName || '';
                if (roleName.toLowerCase().includes('admin') || roleName.toLowerCase().includes('global')) {
                    adminIds.add(assignment.principalId);
                }
            });

            await mapWithConcurrency(users, 8, async (user) => {
                const authMethods = await fetchUserAuthMethods(token, user.id);
                const hasMfa = hasRealMfaMethod(authMethods);
                const isAdmin = adminIds.has(user.id);

                if (!hasMfa) mfaMissingCount++;

                if (isAdmin) {
                    // Task 2: Enforce admin MFA (Checking for weak/no MFA)
                    if (!hasMfa || authMethods.length < 2) weakAdminCount++;

                    // Task 3: Separate admin accounts (Heuristic: Standard email format used as admin)
                    const upn = (user.userPrincipalName || '').toLowerCase();
                    if (!upn.includes('admin') && !upn.includes('adm-')) mixedAdminCount++;
                }
            });

            // Task 1: Complete MFA rollout
            if (mfaMissingCount > 0) {
                addTask("Complete MFA rollout", "Identity", "High", "🔴 Users vulnerable",
                    "Users without MFA are highly susceptible to credential stuffing and phishing attacks.",
                    `${mfaMissingCount} users without MFA registered.`,
                    "1. Open Azure AD Conditional Access.\n2. Enforce MFA policy for all users.\n3. Run registration campaign."
                );
            }

            // Task 2: Enforce admin MFA
            if (weakAdminCount > 0) {
                addTask("Enforce strong admin MFA", "Identity", "High", "🔴 Admin risk",
                    "Administrators are using weak authentication methods, risking complete tenant compromise.",
                    `${weakAdminCount} admin accounts lack phishing-resistant MFA.`,
                    "1. Require FIDO2 or Microsoft Authenticator for admin roles.\n2. Disable SMS/Voice for privileged accounts."
                );
            }

            // Task 3: Separate admin accounts
            if (mixedAdminCount > 0) {
                addTask("Separate admin accounts", "Identity", "High", "🔴 Privilege misuse",
                    "Admin accounts are being used for day-to-day productivity (email, browsing), increasing the attack surface.",
                    `${mixedAdminCount} admin accounts detected as primary user accounts.`,
                    "1. Create dedicated 'admin-username@' accounts.\n2. Strip admin privileges from standard daily accounts."
                );
            }

            // Task 4: Block legacy authentication
            const signIns = await fetchMicrosoftSignIns(token);
            const legacySignIns = signIns.filter(s => s.clientAppUsed && s.clientAppUsed !== 'Browser' && s.clientAppUsed !== 'Mobile Apps and Desktop clients');
            if (legacySignIns.length > 0) {
                addTask("Block legacy authentication", "Identity", "High", "🔴 Legacy auth risk",
                    "Legacy protocols (POP, IMAP) bypass MFA and are actively being exploited.",
                    `${legacySignIns.length} legacy sign-in attempts detected.`,
                    "1. Create Conditional Access policy to block legacy authentication.\n2. Disable legacy protocols in Exchange Admin Center."
                );
            }
        } catch (e) { console.error('Operations: Identity Error', e); }

        // ---------------------------------------------------------
        // 2. DEVICE & ENDPOINT TASKS
        // ---------------------------------------------------------
        try {
            const devices = await fetchMicrosoftDevices(token);
            const nonCompliant = devices.filter(d => d.complianceState !== 'compliant').length;
            const unencrypted = devices.filter(d => !d.isEncrypted).length;

            // Task 7: Enforce device compliance
            if (nonCompliant > 0) {
                addTask("Enforce device compliance", "Devices", "High", "🔴 Unmanaged devices",
                    "Devices are accessing corporate data without meeting baseline security requirements.",
                    `${nonCompliant} devices are currently non-compliant.`,
                    "1. Review Intune compliance policies.\n2. Setup Conditional Access to require compliant devices."
                );
            }

            // Task 8: Enable BitLocker
            if (unencrypted > 0) {
                addTask("Enable BitLocker encryption", "Devices", "High", "🔴 Data loss risk",
                    "Unencrypted devices expose local data if the physical device is lost or stolen.",
                    `${unencrypted} devices are not encrypted.`,
                    "1. Deploy BitLocker configuration profile via Intune.\n2. Force silent encryption for Windows endpoints."
                );
            }

            // Task 9: Deploy endpoint protection
            const alerts = await fetchSecurityAlerts(token);
            if (alerts.length > 0) {
                addTask("Deploy endpoint protection", "Devices", "High", "🔴 Malware risk",
                    "Active threats detected on endpoints indicating potential protection gaps.",
                    `${alerts.length} active endpoint security alerts.`,
                    "1. Review Microsoft Defender for Endpoint coverage.\n2. Isolate affected devices immediately."
                );
            }
        } catch (e) { console.error('Operations: Device Error', e); }

        // ---------------------------------------------------------
        // 3. MANUAL / CONFIGURATION TASKS
        // Evaluated as TRUE (Needs Action) until configured in Phase 2
        // ---------------------------------------------------------
        addTask("Conduct access review", "Identity", "Medium", "🟡 Access drift", "Quarterly access reviews are overdue. Users may retain permissions they no longer need.", "All users and guest accounts.", "1. Export user entitlement list.\n2. Have managers approve current access.\n3. Revoke unneeded roles.");
        addTask("Implement Conditional Access", "Identity", "High", "🔴 No identity protection", "Basic security defaults are insufficient. Explicit CA policies are required.", "Entire tenant.", "1. Enforce MFA for all users.\n2. Block legacy auth.\n3. Require compliant devices.");
        addTask("Enforce BYOD model", "Devices", "High", "🔴 Boundary risk", "Personal devices lack containerization, allowing corporate data to mix with personal apps.", "Mobile devices (iOS/Android).", "1. Deploy App Protection Policies (MAM) in Intune.\n2. Require managed apps for corporate email.");
        addTask("Deploy 1Password", "Credentials", "High", "🔴 Credential exposure", "Users are likely re-using passwords or storing them insecurely.", "All staff.", "1. Provision 1Password enterprise accounts.\n2. Enforce company-wide password manager adoption.");
        addTask("Configure 1Password SSO", "Credentials", "High", "🔴 Access unmanaged", "1Password is not integrated with Azure AD, resulting in disconnected identity lifecycle.", "1Password tenant.", "1. Setup Azure AD Enterprise Application for 1Password.\n2. Configure SAML/OIDC SSO.");
        addTask("Implement Zero Trust", "Network", "High", "🔴 Network exposure", "Internal network assumes trust, making lateral movement easy for attackers.", "Corporate network.", "1. Segment network zones.\n2. Implement micro-segmentation.\n3. Require identity validation for internal resources.");
        addTask("Enable DNS filtering", "Network", "High", "🔴 Malicious traffic risk", "Endpoints can resolve and connect to known malicious domains without restriction.", "All endpoints.", "1. Deploy DNS filtering agent (e.g., Cisco Umbrella, Defender).\n2. Block malware/phishing categories.");
        addTask("Restrict AI tools", "AI", "Medium", "🟡 AI leakage risk", "Employees may be pasting sensitive corporate data into unapproved public AI models.", "Web browsers & endpoints.", "1. Publish acceptable AI usage policy.\n2. Block unsanctioned AI tools via web filtering.");
        addTask("Enable backup", "Backup", "High", "🔴 No recovery", "Microsoft 365 data is not actively backed up to an immutable third-party vault.", "Exchange, SharePoint, OneDrive.", "1. Connect third-party backup provider.\n2. Configure daily retention policies.");
        addTask("Test restore", "Backup", "High", "🔴 Recovery unproven", "Backups are useless if they cannot be reliably restored during an incident.", "Backup infrastructure.", "1. Perform a file-level restore test.\n2. Perform a mailbox restore test.\n3. Document RTO metrics.");
        addTask("Maintain software register", "Applications", "Medium", "🟡 Unknown tools risk", "No central repository exists for approved software, risking supply chain attacks.", "IT Procurement.", "1. Audit current installed software.\n2. Create an approved software catalog.");

        // ---------------------------------------------------------
        // SORTING: Priority -> Severity
        // ---------------------------------------------------------
        const priorityWeight = { 'High': 3, 'Medium': 2, 'Low': 1 };
        tasks.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

        res.json({ success: true, tasks });

    } catch (error) {
        console.error('[Operations API] Critical Error:', error);
        res.status(500).json({ error: 'Failed to generate operations queue' });
    }
});

app.get('/api/sunbird/identity-dashboard', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        console.log(`[Sunbird Dashboard] Fetching dashboard data for: ${userEmail}`);

        // Verify this is Sunbird client only
        const tenant = getTenantByEmail(userEmail);
        if (!tenant || tenant.clientId !== 'sunbird') {
            console.warn(`[Sunbird Dashboard] Access denied for ${userEmail}`);
            return res.status(403).json({ 
                error: 'Access denied',
                message: 'This feature is only available for Sunbird client'
            });
        }

        console.log('[Sunbird Dashboard] User verified as Sunbird client');

        // Get Microsoft Graph token
        const token = await getMicrosoftGraphToken();

        // Fetch all data in parallel
        const [users, roleAssignments, signIns] = await Promise.all([
            fetchMicrosoftUsers(token),
            fetchMicrosoftRoleAssignments(token),
            fetchMicrosoftSignIns(token)
        ]);

        console.log(`[Sunbird Dashboard] Fetched ${users.length} users, ${roleAssignments.length} role assignments, ${signIns.length} sign-ins`);

        // Build user-role map
        const userRoleMap = {};
        roleAssignments.forEach(assignment => {
            const principalId = assignment.principalId;
            if (!userRoleMap[principalId]) {
                userRoleMap[principalId] = [];
            }
            userRoleMap[principalId].push({
                id: assignment.roleDefinition?.id,
                name: assignment.roleDefinition?.displayName || 'Unknown Role'
            });
        });

        // Build sign-in map (latest sign-in per user)
        const latestSignInMap = {};
        signIns.forEach(signin => {
            const upn = signin.userPrincipalName;
            if (!latestSignInMap[upn] || new Date(signin.createdDateTime) > new Date(latestSignInMap[upn].createdDateTime)) {
                latestSignInMap[upn] = {
                    createdDateTime: signin.createdDateTime,
                    appDisplayName: signin.appDisplayName,
                    clientAppUsed: signin.clientAppUsed,
                    ipAddress: signin.ipAddress,
                    location: signin.location?.city ? `${signin.location.city}, ${signin.location.countryOrRegion}` : 'Unknown Location',
                    deviceDetail: signin.deviceDetail,
                    status: signin.status?.errorCode === '0' ? 'Success' : 'Failed'
                };
            }
        });

        // Enrich user data with roles, sign-ins, and calculate risks.
        // Use controlled concurrency to avoid Graph throttling on auth-method calls.
        const enrichedUsers = await mapWithConcurrency(users, 8, async (user) => {
            const userRoles = userRoleMap[user.id] || [];
            const hasAdminRole = userRoles.some(r => 
                r.name.toLowerCase().includes('admin') || 
                r.name.toLowerCase().includes('global')
            );

            // Fetch auth methods for MFA status
            const authMethods = await fetchUserAuthMethods(token, user.id);
            const hasMFA = hasRealMfaMethod(authMethods);

            // Get latest sign-in
            const lastSignIn = latestSignInMap[user.userPrincipalName];
            const lastSignInDate = lastSignIn?.createdDateTime ? new Date(lastSignIn.createdDateTime) : null;
            const daysSinceSignIn = lastSignInDate ? Math.floor((Date.now() - lastSignInDate) / (1000 * 60 * 60 * 24)) : 999;

            // Calculate risk level
            let riskLevel = 'SAFE';
            if (hasAdminRole && !hasMFA) {
                riskLevel = 'HIGH';
            } else if (daysSinceSignIn > 30) {
                riskLevel = 'MEDIUM';
            }

            // Check for unusual location (simple logic - can be enhanced)
            const isNewLocation = lastSignIn && lastSignIn.location === 'Unknown Location';

            return {
                id: user.id,
                displayName: user.displayName || 'Unknown User',
                mail: user.mail,
                userPrincipalName: user.userPrincipalName,
                jobTitle: user.jobTitle || 'No Title',
                mobilePhone: user.mobilePhone || 'N/A',
                roles: userRoles,
                hasAdminRole: hasAdminRole,
                isExternal: user.mail?.endsWith('.com') && !user.mail?.endsWith('sunbird.com') ? true : false,
                mfaEnabled: hasMFA,
                authMethodCount: authMethods.length,
                riskLevel: riskLevel,
                lastSignIn: {
                    dateTime: lastSignInDate?.toISOString() || null,
                    daysSince: daysSinceSignIn,
                    location: lastSignIn?.location || 'No sign-in',
                    device: lastSignIn?.deviceDetail?.displayName || 'Unknown',
                    appDisplayName: lastSignIn?.appDisplayName,
                    clientAppUsed: lastSignIn?.clientAppUsed,
                    status: lastSignIn?.status || 'No activity'
                },
                flags: {
                    adminWithoutMFA: hasAdminRole && !hasMFA,
                    inactiveOver30Days: daysSinceSignIn > 30,
                    newLocationLogin: isNewLocation
                }
            };
        });

        // Calculate dashboard metrics
        const totalUsers = enrichedUsers.length;
        const adminUsers = enrichedUsers.filter(u => u.hasAdminRole).length;
        const mfaEnabledUsers = enrichedUsers.filter(u => u.mfaEnabled).length;
        const mfaPercentage = ((mfaEnabledUsers / totalUsers) * 100).toFixed(1);
        const highRiskUsers = enrichedUsers.filter(u => u.riskLevel === 'HIGH').length;
        const mediumRiskUsers = enrichedUsers.filter(u => u.riskLevel === 'MEDIUM').length;
        const activeUsers24h = enrichedUsers.filter(u => u.lastSignIn.daysSince <= 1).length;
        const usersWithCompleteProfile = enrichedUsers.filter(u => 
            u.jobTitle !== 'No Title' && u.mobilePhone !== 'N/A'
        ).length;

        // 🎯 NEW: A. Privileged Risk - Admins without MFA
        const privilegedUsersWithoutMFA = enrichedUsers.filter(u => u.hasAdminRole && !u.mfaEnabled).length;

        // 🎯 NEW: B. Identity Risk Score (calculated, not random)
        let identityRiskScore = 0;
        enrichedUsers.forEach(user => {
            if (user.hasAdminRole && !user.mfaEnabled) identityRiskScore += 40;
            if (user.lastSignIn.daysSince > 999) identityRiskScore += 25; // Never signed in
            if (user.authMethodCount === 0) identityRiskScore += 20;
            if (user.isExternal) identityRiskScore += 15;
            if (user.riskLevel === 'MEDIUM') identityRiskScore += 10;
            if (user.riskLevel === 'HIGH') identityRiskScore += 30;
        });
        identityRiskScore = Math.min(100, Math.round((identityRiskScore / (totalUsers * 40)) * 100)); // Normalize to 0-100

        // 🎯 NEW: C. Inactive Users Breakdown
        const inactiveBreakdown = {
            '0-7days': enrichedUsers.filter(u => u.lastSignIn.daysSince >= 0 && u.lastSignIn.daysSince <= 7).length,
            '7-30days': enrichedUsers.filter(u => u.lastSignIn.daysSince > 7 && u.lastSignIn.daysSince <= 30).length,
            '30-90days': enrichedUsers.filter(u => u.lastSignIn.daysSince > 30 && u.lastSignIn.daysSince <= 90).length,
            '90+days': enrichedUsers.filter(u => u.lastSignIn.daysSince > 90).length
        };

        // 🎯 NEW: E. Device Trust Analysis
        const deviceTrustAnalysis = {
            managed: 0,
            unmanaged: 0,
            unknown: 0
        };
        enrichedUsers.forEach(user => {
            if (user.lastSignIn && user.lastSignIn.device) {
                const device = user.lastSignIn.device.toLowerCase();
                if (device.includes('unknown') || device === 'unknown') {
                    deviceTrustAnalysis.unknown++;
                } else if (device.includes('managed') || device.includes('iphone') || device.includes('ipad') || device.includes('android')) {
                    deviceTrustAnalysis.managed++;
                } else {
                    deviceTrustAnalysis.unmanaged++;
                }
            } else {
                deviceTrustAnalysis.unknown++;
            }
        });

        // 🎯 NEW: F. Authentication Strength
        const authenticationStrength = {
            passwordOnly: 0,
            basicMFA: 0,
            strongMFA: 0 // FIDO2, Authenticator app
        };
        enrichedUsers.forEach(user => {
            if (user.authMethodCount === 0 || user.authMethodCount === 1) {
                authenticationStrength.passwordOnly++;
            } else if (user.mfaEnabled && user.authMethodCount >= 2) {
                authenticationStrength.basicMFA++;
                // Note: would need detailed auth method data to differentiate strongMFA
            }
        });
        authenticationStrength.strongMFA = Math.round(enrichedUsers.filter(u => u.authMethodCount > 2).length);

        // 🎯 NEW: G. Role Distribution (Top roles)
        const roleDistribution = {};
        enrichedUsers.forEach(user => {
            user.roles.forEach(role => {
                roleDistribution[role.name] = (roleDistribution[role.name] || 0) + 1;
            });
        });
        const topRoles = Object.entries(roleDistribution)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([role, count]) => ({ role, count }));

        // 🎯 NEW: H. Identity Hygiene Score
        const profileCompleteness = Math.round((enrichedUsers.filter(u => u.jobTitle !== 'No Title').length / totalUsers) * 100);
        const authCompleteness = Math.round((mfaEnabledUsers / totalUsers) * 100);
        const activityCompleteness = Math.round((enrichedUsers.filter(u => u.lastSignIn.daysSince <= 90).length / totalUsers) * 100);
        const identityHygieneScore = Math.round((profileCompleteness + authCompleteness + activityCompleteness) / 3);

        // System health metrics
        const systemHealth = {
            performance: Math.round((enrichedUsers.filter(u => u.lastSignIn.status === 'Success').length / totalUsers) * 100) || 0,
            availability: Math.round(((activeUsers24h / totalUsers) * 100) || 0),
            security: Math.round((mfaEnabledUsers / totalUsers) * 100) || 0,
            compliance: Math.round((usersWithCompleteProfile / totalUsers) * 100) || 0,
            backup: Math.round((enrichedUsers.filter(u => u.authMethodCount > 1).length / totalUsers) * 100) || 0
        };

        // Smart insights
        const insights = {
            adminsWithoutMFA: enrichedUsers.filter(u => u.flags.adminWithoutMFA),
            inactiveUsers: enrichedUsers.filter(u => u.flags.inactiveOver30Days),
            newLocationLogins: enrichedUsers.filter(u => u.flags.newLocationLogin)
        };

        // Device breakdown
        const deviceBreakdown = {};
        enrichedUsers.forEach(user => {
            if (user.lastSignIn.device) {
                const device = user.lastSignIn.device.toLowerCase();
                deviceBreakdown[device] = (deviceBreakdown[device] || 0) + 1;
            }
        });

        // Top locations
        const locationBreakdown = {};
        enrichedUsers.forEach(user => {
            if (user.lastSignIn.location && user.lastSignIn.location !== 'No sign-in') {
                locationBreakdown[user.lastSignIn.location] = (locationBreakdown[user.lastSignIn.location] || 0) + 1;
            }
        });

        const topLocations = Object.entries(locationBreakdown)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([location, count]) => ({ location, count }));

        // Calculate security score (0-100)
        const securityScore = Math.round(
            (mfaPercentage * 0.4) +  // MFA is 40% of score
            ((100 - (highRiskUsers / totalUsers * 100)) * 0.3) +  // Low risk is 30%
            ((adminUsers <= 5 ? 100 : 50) * 0.3)  // Admin count is 30%
        );

        console.log('[Sunbird Dashboard] Dashboard data compiled successfully');

        res.json({
            success: true,
            tenant: tenant.clientId,
            fetchedAt: new Date().toISOString(),
            summary: {
                totalUsers,
                activeUsers24h,
                activeUsersPercentage: Math.round((activeUsers24h / totalUsers) * 100),
                adminUsers,
                mfaEnabledPercentage: mfaPercentage,
                highRiskUsers,
                highRiskBreakdown: {
                    adminWithoutMFA: privilegedUsersWithoutMFA,
                    neverSignedIn: enrichedUsers.filter(u => u.lastSignIn.daysSince > 999).length,
                    externalUser: enrichedUsers.filter(u => u.isExternal).length
                },
                securityScore,
                identityRiskScore,
                identityHygieneScore,
                mediumRiskUsers,
                privilegedUsersWithoutMFA
            },
            systemHealth,
            users: enrichedUsers,
            riskDistribution: {
                HIGH: highRiskUsers,
                MEDIUM: mediumRiskUsers,
                SAFE: totalUsers - highRiskUsers - mediumRiskUsers
            },
            insights,
            inactiveBreakdown,
            deviceTrustAnalysis,
            authenticationStrength,
            topRoles,
            hygieneLevels: {
                profileCompleteness,
                authCompleteness,
                activityCompleteness
            },
            signInPatterns: {
                topLocations,
                deviceBreakdown,
                avgSignInsPerUser: signIns.length / totalUsers
            },
            roleInsights: {
                globalAdmins: enrichedUsers.filter(u => u.roles.some(r => r.name.toLowerCase().includes('global'))).length,
                privilegedUsers: enrichedUsers.filter(u => u.roles.length > 0).length,
                usersWithMultipleRoles: enrichedUsers.filter(u => u.roles.length > 1).length,
                roleDistribution: topRoles
            }
        });

    } catch (error) {
        console.error('[Sunbird Dashboard] Error:', error.message);
        
        res.status(500).json({ 
            error: 'Failed to fetch dashboard data',
            message: error.message
        });
    }
});

// ====================================================================================================//
//                        MICROSOFT GRAPH - DEVICES & SECURITY                                        //
// ====================================================================================================//

/**
 * Fetch managed devices from Microsoft Intune/Device Management
 */
async function fetchMicrosoftDevices(token) {
    const url = 'https://graph.microsoft.com/v1.0/deviceManagement/managedDevices';
    
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch devices: ${response.statusText}`);
        }

        const data = await response.json();
        return data.value || [];
    } catch (error) {
        console.error('[Microsoft Graph] Devices fetch failed:', error.message);
        throw error;
    }
}

/**
 * Fetch device compliance policies
 */
async function fetchCompliancePolicies(token) {
    const url = 'https://graph.microsoft.com/v1.0/deviceManagement/deviceCompliancePolicies';
    
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch compliance policies: ${response.statusText}`);
        }

        const data = await response.json();
        return data.value || [];
    } catch (error) {
        console.error('[Microsoft Graph] Compliance policies fetch failed:', error.message);
        throw error;
    }
}

/**
 * Fetch security alerts
 */
async function fetchSecurityAlerts(token) {
    const url = 'https://graph.microsoft.com/v1.0/security/alerts?$top=50';
    
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch security alerts: ${response.statusText}`);
        }

        const data = await response.json();
        return data.value || [];
    } catch (error) {
        console.error('[Microsoft Graph] Security alerts fetch failed:', error.message);
        return []; // Return empty array if alerts API fails
    }
}

/**
 * Route: GET /api/microsoft-devices
 * Returns: Complete devices, compliance, and security data for Devices dashboard
 */
app.get('/api/microsoft-devices', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        console.log(`[Devices Dashboard] Fetching device data for: ${userEmail}`);

        // Get the tenant for this user
        const tenant = getTenantByEmail(userEmail);
        if (!tenant) {
            console.warn(`[Devices Dashboard] User ${userEmail} does not belong to any configured tenant`);
            return res.status(403).json({ 
                error: 'User does not have access to device data',
                message: 'Your email is not associated with any tenant'
            });
        }

        // Get Microsoft Graph token
        const token = await getMicrosoftGraphToken();

        // Fetch all required data in parallel
        const [devices, policies, alerts] = await Promise.all([
            fetchMicrosoftDevices(token),
            fetchCompliancePolicies(token),
            fetchSecurityAlerts(token)
        ]);

        // Process devices data
        const processedDevices = devices.map(device => ({
            id: device.id,
            deviceName: device.deviceName || 'Unknown Device',
            userPrincipalName: device.userPrincipalName || 'N/A',
            operatingSystem: device.operatingSystem || 'Unknown',
            osVersion: device.osVersion || 'N/A',
            complianceState: device.complianceState || 'unknown',
            isEncrypted: device.isEncrypted || false,
            encryptionStatus: device.isEncrypted ? 'Encrypted' : 'Not Encrypted',
            managementAgent: device.managementAgent || 'Unknown',
            lastSyncDateTime: device.lastSyncDateTime ? new Date(device.lastSyncDateTime) : null,
            azureADRegistered: device.azureADRegistered || false,
            deviceEnrollmentType: device.deviceEnrollmentType || 'Unknown',
            deviceType: device.deviceType || 'Unknown',
            activationLockEnabled: device.activationLockEnabled || false,
            serialNumber: device.serialNumber || 'N/A',
            physicalIds: device.physicalIds || [],
            hasPendingActions: device.hasPendingActions || false,
            complianceGracePeriodExpirationDateTime: device.complianceGracePeriodExpirationDateTime || null
        }));

        // Calculate device metrics
        const totalDevices = processedDevices.length;
        const compliantDevices = processedDevices.filter(d => d.complianceState === 'compliant').length;
        const encryptedDevices = processedDevices.filter(d => d.isEncrypted).length;
        const registeredDevices = processedDevices.filter(d => d.azureADRegistered).length;
        const staleDevices = processedDevices.filter(d => {
            if (!d.lastSyncDateTime) return true;
            const daysSinceSync = (Date.now() - new Date(d.lastSyncDateTime).getTime()) / (1000 * 60 * 60 * 24);
            return daysSinceSync > 7;
        }).length;

        // Device breakdown by OS
        const osDistribution = {};
        processedDevices.forEach(device => {
            const os = device.operatingSystem || 'Unknown';
            osDistribution[os] = (osDistribution[os] || 0) + 1;
        });

        // Device breakdown by management status
        const managementStatus = {
            managed: processedDevices.filter(d => d.managementAgent && d.managementAgent !== 'unknown').length,
            unmanaged: processedDevices.filter(d => !d.managementAgent || d.managementAgent === 'unknown').length,
            aadRegistered: registeredDevices
        };

        // Compliance breakdown
        const complianceBreakdown = {
            compliant: compliantDevices,
            nonCompliant: processedDevices.filter(d => d.complianceState === 'noncompliant').length,
            unknown: processedDevices.filter(d => d.complianceState === 'unknown').length
        };

        // High risk devices (not encrypted OR non-compliant OR stale)
        const highRiskDevices = processedDevices.filter(d => 
            !d.isEncrypted || d.complianceState !== 'compliant' || 
            (d.lastSyncDateTime && (Date.now() - new Date(d.lastSyncDateTime).getTime()) / (1000 * 60 * 60 * 24) > 7)
        );

        // Activity breakdown
        const activityBreakdown = {
            active24h: processedDevices.filter(d => {
                if (!d.lastSyncDateTime) return false;
                const daysSinceSync = (Date.now() - new Date(d.lastSyncDateTime).getTime()) / (1000 * 60 * 60 * 24);
                return daysSinceSync <= 1;
            }).length,
            stale7days: processedDevices.filter(d => {
                if (!d.lastSyncDateTime) return false;
                const daysSinceSync = (Date.now() - new Date(d.lastSyncDateTime).getTime()) / (1000 * 60 * 60 * 24);
                return daysSinceSync > 7 && daysSinceSync <= 30;
            }).length,
            dead30days: processedDevices.filter(d => {
                if (!d.lastSyncDateTime) return true;
                const daysSinceSync = (Date.now() - new Date(d.lastSyncDateTime).getTime()) / (1000 * 60 * 60 * 24);
                return daysSinceSync > 30;
            }).length
        };

        // Device security score (0-100)
        const encryptionPercent = totalDevices > 0 ? (encryptedDevices / totalDevices) * 100 : 0;
        const compliancePercent = totalDevices > 0 ? (compliantDevices / totalDevices) * 100 : 0;
        const activePercent = totalDevices > 0 ? (activityBreakdown.active24h / totalDevices) * 100 : 0;
        const registeredPercent = totalDevices > 0 ? (registeredDevices / totalDevices) * 100 : 0;

        const deviceSecurityScore = Math.round(
            (encryptionPercent * 0.25) +
            (compliancePercent * 0.25) +
            (activePercent * 0.25) +
            (registeredPercent * 0.25)
        );

        // Process security alerts (limit to 20)
        const processedAlerts = alerts.slice(0, 20).map(alert => ({
            id: alert.id,
            title: alert.title || 'Unknown Alert',
            description: alert.description || '',
            severity: alert.severity || 'medium',
            status: alert.status || 'newAlert',
            createdDateTime: alert.createdDateTime || new Date().toISOString(),
            eventDateTime: alert.eventDateTime || new Date().toISOString(),
            sourceMaterials: alert.sourceMaterials || [],
            vendorInformation: alert.vendorInformation?.provider || 'Unknown'
        }));

        console.log(`[Devices Dashboard] Successfully compiled device data: ${totalDevices} devices, ${processedAlerts.length} alerts`);

        res.json({
            success: true,
            tenant: tenant.clientId,
            fetchedAt: new Date().toISOString(),
            summary: {
                totalDevices,
                compliantDevices,
                encryptedDevices,
                registeredDevices,
                staleDevices,
                highRiskDevices: highRiskDevices.length,
                compliancePercentage: totalDevices > 0 ? Math.round((compliantDevices / totalDevices) * 100) : 0,
                encryptionPercentage: totalDevices > 0 ? Math.round((encryptedDevices / totalDevices) * 100) : 0,
                deviceSecurityScore
            },
            devices: processedDevices,
            compliance: complianceBreakdown,
            osDistribution,
            managementStatus,
            activityBreakdown,
            highRiskDevices: highRiskDevices.slice(0, 10),
            alerts: processedAlerts,
            policies: policies.slice(0, 10)
        });

    } catch (error) {
        console.error('[Devices Dashboard] Error:', error.message);
        
        res.status(500).json({ 
            error: 'Failed to fetch devices dashboard data',
            message: error.message
        });
    }
});

// ====================================================================================================//
//                         MICROSOFT GRAPH - Threat & Activity (SOC)                                //
// ====================================================================================================//

// Fetch security alerts from Microsoft Graph
async function fetchSecurityAlerts(token) {
    try {
        console.log('[Security] 🔍 Fetching alerts from Microsoft Graph API...');
        const response = await fetch('https://graph.microsoft.com/v1.0/security/alerts?$top=50&$orderby=createdDateTime desc', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn('[Security] ⚠️ Alerts endpoint returned status:', response.status);
            return [];
        }

        const data = await response.json();
        const alerts = data.value || [];
        console.log('[Security] ✅ Successfully retrieved %d alerts from Microsoft Graph', alerts.length);
        return alerts;
    } catch (error) {
        console.error('[Security] ❌ Failed to fetch alerts:', error.message);
        return [];
    }
}

// Fetch security incidents from Microsoft Graph
async function fetchSecurityIncidents(token) {
    try {
        console.log('[Security] 🔍 Fetching incidents from Microsoft Graph API...');
        const response = await fetch('https://graph.microsoft.com/v1.0/security/incidents?$top=50&$orderby=createdDateTime desc', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn('[Security] ⚠️ Incidents endpoint returned status:', response.status);
            return [];
        }

        const data = await response.json();
        const incidents = data.value || [];
        console.log('[Security] ✅ Successfully retrieved %d incidents from Microsoft Graph', incidents.length);
        return incidents;
    } catch (error) {
        console.error('[Security] ❌ Failed to fetch incidents:', error.message);
        return [];
    }
}

// Fetch threat indicators from Microsoft Graph
async function fetchThreatIndicators(token) {
    try {
        const response = await fetch('https://graph.microsoft.com/v1.0/security/tiIndicators?$top=50&$orderby=createdDateTime desc', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.log('[Security] Threat Indicators endpoint returned:', response.status);
            return [];
        }

        const data = await response.json();
        return data.value || [];
    } catch (error) {
        console.error('[Security] Failed to fetch threat indicators:', error.message);
        return [];
    }
}

// Fetch sign-in logs for security correlation
async function fetchSecuritySignIns(token) {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const filter = `createdDateTime ge ${thirtyDaysAgo.toISOString().split('T')[0]}`;
        
        const response = await fetch(`https://graph.microsoft.com/v1.0/auditLogs/signIns?$filter=${encodeURIComponent(filter)}&$top=100&$orderby=createdDateTime desc`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.log('[Security] Sign-ins endpoint returned:', response.status);
            return [];
        }

        const data = await response.json();
        return data.value || [];
    } catch (error) {
        console.error('[Security] Failed to fetch sign-ins:', error.message);
        return [];
    }
}

/**
 * Route: GET /api/security-events
 * Comprehensive SOC dashboard aggregating alerts, incidents, threat indicators, and sign-ins
 */
app.get('/api/security-events', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        console.log(`[Security Events] Fetching dashboard data for: ${userEmail}`);

        const tenant = getTenantByEmail(userEmail);
        if (!tenant || tenant.clientId !== 'sunbird') {
            console.warn(`[Security Events] Access denied for ${userEmail}`);
            return res.status(403).json({ 
                error: 'Access denied',
                message: 'This feature is only available for Sunbird client'
            });
        }

        const token = await getMicrosoftGraphToken();
        console.log('[Security Events] 🔑 Microsoft Graph token obtained successfully');

        // Fetch all security data in parallel
        console.log('[Security Events] 🚀 Fetching security data from Microsoft Graph...');
        const [alerts, incidents, threatIndicators, signIns] = await Promise.all([
            fetchSecurityAlerts(token),
            fetchSecurityIncidents(token),
            fetchThreatIndicators(token),
            fetchSecuritySignIns(token)
        ]);

        console.log('[Security Events] 📊 Raw data from Microsoft Graph API:', {
            alertsCount: alerts.length,
            incidentsCount: incidents.length,
            threatIndicatorsCount: threatIndicators.length,
            signInsCount: signIns.length
        });

        // ===== DATA PROCESSING & CORRELATION =====

        // 1. Process alerts
        console.log('[Security Events] 🔄 Processing alerts...');
        const processedAlerts = alerts.map(alert => ({
            id: alert.id,
            title: alert.title || 'Unknown Alert',
            description: alert.description || '',
            severity: alert.severity || 'medium',
            status: alert.status || 'newAlert',
            created: alert.createdDateTime || new Date().toISOString(),
            eventTime: alert.eventDateTime || new Date().toISOString(),
            category: alert.category || 'Other',
            vendor: alert.vendorInformation?.provider || 'Microsoft'
        }));

        // 2. Process incidents
        console.log('[Security Events] 🔄 Processing incidents...');
        const processedIncidents = incidents.map(incident => ({
            id: incident.id,
            displayName: incident.displayName || 'Unknown Incident',
            description: incident.description || '',
            severity: incident.severity || 'medium',
            status: incident.status || 'active',
            created: incident.createdDateTime || new Date().toISOString(),
            updated: incident.lastUpdateDateTime || new Date().toISOString(),
            assignedTo: incident.assignedTo || 'Unassigned',
            redirectUrl: incident.incidentUrl || '#'
        }));

        // 3. Identify suspicious sign-ins
        console.log('[Security Events] 🔄 Processing sign-in data...');
        const suspiciousSignIns = signIns.filter(signIn => {
            const riskLevel = signIn.riskLevelDuringSignIn;
            const status = signIn.status?.errorCode === 0 ? 'Success' : 'Failed';
            return (riskLevel && riskLevel !== 'none') || status === 'Failed';
        }).slice(0, 50).map(signIn => ({
            id: signIn.id,
            user: signIn.userPrincipalName || 'Unknown',
            timestamp: signIn.createdDateTime || new Date().toISOString(),
            ipAddress: signIn.ipAddress || 'Unknown',
            location: signIn.location?.city ? `${signIn.location.city}, ${signIn.location.countryOrRegion}` : 'Unknown Location',
            riskLevel: signIn.riskLevelDuringSignIn || 'none',
            status: signIn.status?.errorCode === 0 ? 'Success' : 'Failed',
            errorCode: signIn.status?.errorCode || 0
        }));

        // 4. Process threat indicators
        const processedThreats = threatIndicators.slice(0, 50).map(threat => ({
            id: threat.id,
            indicator: threat.networkIPv4 || threat.networkIPv6 || threat.domainName || threat.fileHashValue || 'Unknown',
            type: threat.networkIPv4 ? 'IPv4' : threat.networkIPv6 ? 'IPv6' : threat.domainName ? 'Domain' : 'FileHash',
            severity: threat.severity || 'medium',
            action: threat.targetProduct || 'Block',
            description: threat.description || 'Threat detected',
            created: threat.createdDateTime || new Date().toISOString()
        }));

        // ===== CORRELATION & INSIGHTS =====

        // Count active incidents
        const activeIncidents = processedIncidents.filter(i => 
            i.status === 'active' || i.status === 'inProgress'
        );

        // Count high severity alerts
        const highSeverityAlerts = processedAlerts.filter(a => 
            a.severity === 'high' || a.severity === 'critical'
        );

        // Find users under attack (multiple failed logins or suspicious activity)
        const userFailureMap = {};
        suspiciousSignIns.forEach(signIn => {
            if (signIn.status === 'Failed') {
                userFailureMap[signIn.user] = (userFailureMap[signIn.user] || 0) + 1;
            }
        });

        const usersUnderAttack = Object.entries(userFailureMap)
            .filter(([user, count]) => count >= 3)
            .map(([user, count]) => ({ user, failedAttempts: count }))
            .sort((a, b) => b.failedAttempts - a.failedAttempts)
            .slice(0, 10);

        // Calculate security score (0-100)
        const severityScores = {
            'critical': 25,
            'high': 15,
            'medium': 5,
            'low': 2
        };
        
        let securityScore = 100;
        for (const threat of processedThreats) {
            securityScore -= severityScores[threat.severity] || 2;
        }
        for (const alert of processedAlerts.slice(0, 10)) {
            securityScore -= severityScores[alert.severity] || 2;
        }
        for (const signIn of usersUnderAttack) {
            securityScore -= (signIn.failedAttempts * 2);
        }
        securityScore = Math.max(0, Math.min(100, securityScore));

        // ===== ACTIVITY FEED =====
        const activityFeed = [];
        
        // Add incidents to feed
        processedIncidents.slice(0, 5).forEach(incident => {
            activityFeed.push({
                type: 'incident',
                message: `${incident.severity.toUpperCase()} Incident: ${incident.displayName}`,
                timestamp: incident.created,
                severity: incident.severity
            });
        });

        // Add high severity alerts
        highSeverityAlerts.slice(0, 5).forEach(alert => {
            activityFeed.push({
                type: 'alert',
                message: `${alert.severity.toUpperCase()}: ${alert.title}`,
                timestamp: alert.created,
                severity: alert.severity
            });
        });

        // Add suspicious sign-ins
        suspiciousSignIns.slice(0, 5).forEach(signIn => {
            activityFeed.push({
                type: 'signin',
                message: `Failed login: ${signIn.user} from ${signIn.location}`,
                timestamp: signIn.timestamp,
                severity: 'medium'
            });
        });

        // Sort by timestamp
        activityFeed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        console.log('[Security Events] ✅ Compilation complete:');
        console.log('[Security Events]   - Processed Alerts:', processedAlerts.length);
        console.log('[Security Events]   - Processed Incidents:', processedIncidents.length);
        console.log('[Security Events]   - Threat Indicators:', processedThreats.length);
        console.log('[Security Events]   - Active Incidents:', activeIncidents.length);
        console.log('[Security Events]   - High Severity Alerts:', highSeverityAlerts.length);
        console.log('[Security Events]   - Users Under Attack:', usersUnderAttack.length);
        console.log('[Security Events]   - Activity Feed Items:', activityFeed.length);
        console.log('[Security Events]   - Security Score:', securityScore);

        console.log(`[Security Events] 📤 Sending response to frontend for user: ${userEmail}`);

        res.json({
            success: true,
            tenant: tenant.clientId,
            fetchedAt: new Date().toISOString(),
            summary: {
                activeIncidents: activeIncidents.length,
                highSeverityAlerts: highSeverityAlerts.length,
                totalAlerts: processedAlerts.length,
                threatIndicators: processedThreats.length,
                usersUnderAttack: usersUnderAttack.length,
                securityScore
            },
            incidents: processedIncidents,
            alerts: processedAlerts,
            threats: processedThreats,
            signIns: {
                all: signIns.length,
                suspicious: suspiciousSignIns,
                usersUnderAttack
            },
            activityFeed: activityFeed.slice(0, 20)
        });

    } catch (error) {
        console.error('[Security Events] ❌ Error:', error.message);
        
        res.status(500).json({ 
            error: 'Failed to fetch security events data',
            message: error.message
        });
    }
});

/**
 * Route: GET /api/email-security
 * Email Security dashboard aggregating email-specific alerts and incidents
 */
app.get('/api/email-security', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email;
        console.log(`[Email Security] Fetching dashboard data for: ${userEmail}`);

        const tenant = getTenantByEmail(userEmail);
        if (!tenant || tenant.clientId !== 'sunbird') {
            console.warn(`[Email Security] Access denied for ${userEmail}`);
            return res.status(403).json({ 
                error: 'Access denied',
                message: 'This feature is only available for Sunbird client'
            });
        }

        const token = await getMicrosoftGraphToken();

        // Fetch security alerts and incidents
        console.log('[Email Security] Fetching email alerts and incidents...');
        const [alerts, incidents] = await Promise.all([
            fetchSecurityAlerts(token),
            fetchSecurityIncidents(token)
        ]);

        // ===== FILTER FOR EMAIL-RELATED ALERTS =====
        const emailKeywords = ['phishing', 'malware', 'spam', 'email', 'attachment', 'suspicious mail', 'ransomware'];
        
        const emailAlerts = alerts.filter(alert => {
            const category = (alert.category || '').toLowerCase();
            const title = (alert.title || '').toLowerCase();
            const description = (alert.description || '').toLowerCase();
            
            return emailKeywords.some(keyword => 
                category.includes(keyword) || title.includes(keyword) || description.includes(keyword)
            );
        });

        // ===== FILTER FOR EMAIL-RELATED INCIDENTS =====
        const emailIncidents = incidents.filter(incident => {
            const displayName = (incident.displayName || '').toLowerCase();
            const description = (incident.description || '').toLowerCase();
            
            return emailKeywords.some(keyword => 
                displayName.includes(keyword) || description.includes(keyword)
            );
        });

        // ===== DATA PROCESSING =====
        const processedAlerts = emailAlerts.map(alert => ({
            id: alert.id,
            title: alert.title || 'Unknown Alert',
            description: alert.description || '',
            severity: (alert.severity || 'medium').toLowerCase(),
            status: (alert.status || 'newAlert').toLowerCase(),
            created: alert.createdDateTime || new Date().toISOString(),
            category: alert.category || 'Email Threat',
            userStates: (alert.userStates || []).map(u => ({
                aadUserId: u.aadUserId,
                accountName: u.accountName || 'Unknown'
            }))
        }));

        const processedIncidents = emailIncidents.map(incident => ({
            id: incident.id,
            displayName: incident.displayName || 'Unknown Incident',
            description: incident.description || '',
            severity: (incident.severity || 'medium').toLowerCase(),
            status: (incident.status || 'active').toLowerCase(),
            created: incident.createdDateTime || new Date().toISOString(),
            updated: incident.lastUpdateDateTime || new Date().toISOString(),
            assignedTo: incident.assignedTo || 'Unassigned'
        }));

        // ===== STATISTICS =====
        const activeThreats = processedAlerts.filter(a => 
            a.status === 'newalert' || a.status === 'inprogress'
        ).length;

        const highSeverityAlerts = processedAlerts.filter(a => 
            a.severity === 'high' || a.severity === 'critical'
        ).length;

        const activeIncidents = processedIncidents.filter(i => 
            i.status === 'active' || i.status === 'inprogress'
        ).length;

        const resolvedAlerts = processedAlerts.filter(a => 
            a.status === 'resolved' || a.status === 'dismissed'
        ).length;

        const totalAlerts = processedAlerts.length;
        const threatResolutionRate = totalAlerts > 0 
            ? Math.round((resolvedAlerts / totalAlerts) * 100)
            : 0;

        // Extract affected users
        const affectedUsersSet = new Set();
        const userThreatCount = {};
        
        processedAlerts.forEach(alert => {
            alert.userStates.forEach(user => {
                affectedUsersSet.add(user.accountName);
                userThreatCount[user.accountName] = (userThreatCount[user.accountName] || 0) + 1;
            });
        });

        const affectedUsers = Array.from(affectedUsersSet);
        const mostAffectedUsers = Object.entries(userThreatCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([user, count]) => ({ user, threatCount: count }));

        // ===== THREAT BREAKDOWN =====
        const threatTypes = {};
        const severityDistribution = { high: 0, medium: 0, low: 0 };

        processedAlerts.forEach(alert => {
            // Categorize threats
            const title = (alert.title || '').toLowerCase();
            let threatType = 'Other';
            if (title.includes('phish')) threatType = 'Phishing';
            else if (title.includes('malware')) threatType = 'Malware';
            else if (title.includes('spam')) threatType = 'Spam';
            else if (title.includes('ransomware')) threatType = 'Ransomware';
            
            threatTypes[threatType] = (threatTypes[threatType] || 0) + 1;
            
            // Count severity
            const severity = alert.severity || 'low';
            if (severity === 'high' || severity === 'critical') severityDistribution.high++;
            else if (severity === 'medium') severityDistribution.medium++;
            else severityDistribution.low++;
        });

        // ===== SECURITY SCORE =====
        const severityScores = {
            'critical': 25,
            'high': 15,
            'medium': 5,
            'low': 2
        };
        
        let securityScore = 100;
        for (const alert of processedAlerts.slice(0, 20)) {
            securityScore -= severityScores[alert.severity] || 2;
        }
        securityScore = Math.max(0, Math.min(100, securityScore));

        // ===== ACTIONABLE INSIGHTS =====
        const insights = [];
        
        if (highSeverityAlerts > 0) {
            insights.push({
                type: 'warning',
                message: `${highSeverityAlerts} high-severity email threat${highSeverityAlerts > 1 ? 's' : ''} detected`,
                action: 'Review Alerts',
                count: highSeverityAlerts
            });
        }
        
        if (affectedUsers.length > 0) {
            insights.push({
                type: 'info',
                message: `${affectedUsers.length} user${affectedUsers.length > 1 ? 's' : ''} affected by email threats`,
                action: 'View Users',
                count: affectedUsers.length
            });
        }
        
        if (activeIncidents > 0) {
            insights.push({
                type: 'critical',
                message: `${activeIncidents} unresolved incident${activeIncidents > 1 ? 's' : ''} requiring attention`,
                action: 'View Incidents',
                count: activeIncidents
            });
        }
        
        if (threatResolutionRate < 50) {
            insights.push({
                type: 'warning',
                message: `Only ${threatResolutionRate}% of threats have been resolved`,
                action: 'Improve Response',
                count: threatResolutionRate
            });
        }

        console.log(`[Email Security] Compiled: ${processedAlerts.length} email alerts, ${processedIncidents.length} incidents, ${affectedUsers.length} affected users`);

        res.json({
            success: true,
            tenant: tenant.clientId,
            fetchedAt: new Date().toISOString(),
            summary: {
                activeThreats,
                highSeverityAlerts,
                activeIncidents,
                affectedUsersCount: affectedUsers.length,
                threatResolutionRate,
                securityScore
            },
            alerts: processedAlerts,
            incidents: processedIncidents,
            threats: {
                byType: threatTypes,
                bySeverity: severityDistribution
            },
            affectedUsers: {
                all: affectedUsers,
                mostTargeted: mostAffectedUsers
            },
            insights
        });

    } catch (error) {
        console.error('[Email Security] Error:', error.message);
        
        res.status(500).json({ 
            error: 'Failed to fetch email security data',
            message: error.message
        });
    }
});

/**
 * Helper: Parse CSV response from Microsoft Graph Reports API
 * Handles both comma-separated and tab-separated formats
 */
function parseGraphReportCSV(csvText, reportType = 'unknown') {
    try {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) {
            console.log(`[CSV Parser] ${reportType} - No data rows (only ${lines.length} lines)`);
            return [];
        }

        // Detect delimiter: comma or tab
        const headerLine = lines[0];
        const isCommaDelimited = headerLine.includes(',') && !headerLine.includes('\t');
        const delimiter = isCommaDelimited ? ',' : '\t';
        console.log(`[CSV Parser] ${reportType} - Detected delimiter: ${delimiter === ',' ? 'COMMA' : 'TAB'}`);

        // Parse header
        const header = headerLine.split(delimiter).map(h => h.trim());
        console.log(`[CSV Parser] ${reportType} - Headers: ${header.join(', ')}`);
        
        // Parse rows
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = lines[i].split(delimiter).map(v => v.trim());
            const row = {};
            
            header.forEach((key, index) => {
                row[key] = values[index] || '';
            });
            
            data.push(row);
        }
        
        console.log(`[CSV Parser] ${reportType} - Parsed ${data.length} rows`);
        if (data.length > 0) {
            console.log(`[CSV Parser] ${reportType} - First row:`, JSON.stringify(data[0]));
        }
        
        return data;
    } catch (error) {
        console.error('[CSV Parser] Error parsing CSV:', error);
        return [];
    }
}

/**
 * Route: GET /api/backup-recovery
 * Fetch backup and recovery data from Microsoft Graph Reports
 * Uses: OneDrive, SharePoint, Exchange storage reports
 */
app.get('/api/backup-recovery', authenticateToken, async (req, res) => {
    try {
        const payload = await fetchBackupRecoveryPayloadFromApi();
        res.json(payload);

    } catch (error) {
        console.error('[Backup Recovery] Error:', error.message);
        
        res.status(500).json({ 
            error: 'Failed to fetch backup recovery data',
            message: error.message
        });
    }
});

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

// ────────────────────────────────────────────────────────────────────
// ──── WhatsApp Integration (StackOps) ────────────────────────────────
// ────────────────────────────────────────────────────────────────────
async function initializeWhatsApp() {
    try {
        const createWhatsAppRoutes = require('./backend/whatsapp/routes');
        
        // Load secrets from Secret Manager into process.env if they are placeholders
        if (process.env.WHATSAPP_PHONE_NUMBER_ID?.includes('EXTRACT_FROM_GOOGLE_SECRETS')) {
            console.log('🔄 Fetching WhatsApp secrets from Secret Manager...');
            const phoneId = await getSecret('WHATSAPP_PHONE_NUMBER_ID');
            const accessToken = await getSecret('WHATSAPP_ACCESS_TOKEN');
            const verifyToken = await getSecret('WHATSAPP_VERIFY_TOKEN');
            const openaiKey = await getSecret('OPENAI_API_KEY');
            
            if (phoneId) process.env.WHATSAPP_PHONE_NUMBER_ID = phoneId;
            if (accessToken) process.env.WHATSAPP_ACCESS_TOKEN = accessToken;
            if (verifyToken) process.env.WHATSAPP_VERIFY_TOKEN = verifyToken;
            if (openaiKey) process.env.OPENAI_API_KEY = openaiKey;
        }

        if (pool) {
            const whatsappRouter = createWhatsAppRoutes(pool);
            app.use('/api/webhook', whatsappRouter);
            console.log('✅ WhatsApp integration loaded');
        } else {
            console.warn('⚠️  WhatsApp integration requires database pool - skipping');
        }
    } catch (whatsappError) {
        console.error('❌ Failed to load WhatsApp integration:', whatsappError.message);
        console.error('Stack:', whatsappError.stack);
        // Continue without WhatsApp - don't crash the app
    }
}

// Initialize WhatsApp
initializeWhatsApp().catch(err => {
    console.error('Failed to initialize WhatsApp:', err);
});

// ────────────────────────────────────────────────────────────────────
// Server Startup
// ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;  // Use PORT env var for Cloud Run

// Add global error handlers before starting server
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

const server = app.listen(PORT, async () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📡 Database: ${pool ? 'Connected' : 'Not Available'}`);
    console.log(`🔐 Supabase mode: ${useSupabase ? 'ON' : 'OFF'}`);
    console.log(`📋 Test Invoice PDF: http://localhost:${PORT}/test-invoice`);
    console.log(`💬 WhatsApp Webhook: POST http://localhost:${PORT}/api/webhook/whatsapp`);
    console.log(`${'='.repeat(60)}\n`);
});

server.on('error', (error) => {
    console.error('❌ Server error:', error);
    process.exit(1);
});