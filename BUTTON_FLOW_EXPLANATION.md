# How "View Latest Invoice" Button Works - Complete Flow

## Step-by-Step Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: USER CLICKS BUTTON                                       │
│ User clicks "View Latest Invoice" button in chat interface       │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: FRONTEND HANDLES CLICK                                 │
│ File: js/Chatbot.js                                             │
│                                                                  │
│ handleButtonClick("View Latest Invoice") {                      │
│   1. Adds user message: "View Latest Invoice"                   │
│   2. Shows typing indicator                                     │
│   3. Calls getBotResponse("View Latest Invoice")                │
│   4. Which calls sendToBackend("View Latest Invoice")           │
│ }                                                                │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: SEND TO BACKEND                                         │
│ File: js/Chatbot.js - sendToBackend()                           │
│                                                                  │
│ POST /api/chat                                                   │
│ Headers: {                                                      │
│   Authorization: Bearer <token>                                 │
│   Content-Type: application/json                               │
│ }                                                                │
│ Body: { message: "View Latest Invoice" }                        │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: BACKEND DETECTS BUTTON CLICK                            │
│ File: server.js - /api/chat endpoint                            │
│ Line: 2844                                                      │
│                                                                  │
│ if (message === 'View Latest Invoice' ||                        │
│     messageLower === 'view latest invoice') {                  │
│   forcedAction = {                                              │
│     type: "action",                                             │
│     action: "get_latest_invoice",                               │
│     params: {},                                                 │
│     confidence: 0.95,                                           │
│     needs_clarification: false                                  │
│   }                                                              │
│ }                                                                │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: FETCH DATA FROM DATABASE                                │
│ File: server.js - fetchClientData()                             │
│ Line: 2455                                                      │
│                                                                  │
│ switch (action) {                                                │
│   case "get_latest_invoice":                                     │
│     return getLatestInvoice(companyId);                         │
│ }                                                                │
│                                                                  │
│ getLatestInvoice() executes SQL:                               │
│ SELECT InvoiceID, InvoiceNumber, InvoiceDate,                   │
│        DueDate, TotalAmount, Status                             │
│ FROM Invoices WHERE CompanyID = ?                               │
│ ORDER BY InvoiceDate DESC LIMIT 1                               │
│                                                                  │
│ Also fetches:                                                    │
│ - InvoiceItems (line items)                                     │
│ - Payments (payment history)                                    │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: FORMAT DATA FOR AI                                      │
│ File: server.js - getLatestInvoice()                           │
│ Returns structured object:                                       │
│                                                                  │
│ {                                                                │
│   has_data: true,                                               │
│   data_type: "invoice",                                         │
│   invoice_number: "INV-2024-001",                               │
│   invoice_date: "2024-03-01",                                  │
│   due_date: "2024-03-15",                                       │
│   total_amount: "15500.00",                                     │
│   outstanding_balance: "15500.00",                              │
│   status: "Outstanding",                                        │
│   items: [                                                       │
│     { description: "IT Support", amount: "15500.00" }          │
│   ]                                                              │
│ }                                                                │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 7: INJECT DATA INTO AI CONTEXT                            │
│ File: server.js - Line 3010                                     │
│                                                                  │
│ Creates dataContextMessage with:                                │
│ - Exact invoice values from database                            │
│ - Instructions to format as natural language                    │
│ - Prohibition against showing raw fields                        │
│                                                                  │
│ Example context:                                                │
│ "Invoice Number: INV-2024-001 → Say as Invoice #INV-2024-001" │
│ "Total Amount: 15500.00 → Format as R15,500.00"                │
│ "Due Date: 2024-03-15 → Say as March 15, 2024"                │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 8: AI GENERATES NATURAL LANGUAGE RESPONSE                  │
│ File: server.js - Line 3064                                     │
│                                                                  │
│ OpenAI API call with:                                            │
│ - System prompt (button rules, natural language rules)          │
│ - Data context (invoice information)                             │
│ - Conversation history                                          │
│ - User message: "View Latest Invoice"                           │
│                                                                  │
│ AI Response Example:                                             │
│ "Your latest invoice #INV-2024-001 is for R15,500.00,          │
│  due on March 15, 2024. The outstanding balance is              │
│  R15,500.00. [[View All Invoices]] [[Project Updates]]"         │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 9: EXTRACT BUTTONS FROM RESPONSE                          │
│ File: server.js - Line 3107                                     │
│                                                                  │
│ Uses regex: /\[\[([^\]]+)\]\]/g                                │
│ Extracts: ["View All Invoices", "Project Updates"]             │
│ Removes button markers from text                                │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 10: SANITIZE AND VALIDATE RESPONSE                        │
│ File: server.js - sanitizeResponse()                            │
│                                                                  │
│ - Removes any JSON artifacts                                     │
│ - Removes system markers                                        │
│ - Ensures no raw database fields                                │
│ - Limits length to 1500 characters                             │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 11: SAVE TO CHAT HISTORY                                  │
│ File: server.js - saveChatMessage()                             │
│                                                                  │
│ Saves both:                                                      │
│ - User message: "View Latest Invoice"                           │
│ - Assistant response: "Your latest invoice..."                  │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 12: RETURN TO FRONTEND                                    │
│ File: server.js - Line 3130                                     │
│                                                                  │
│ Response JSON:                                                   │
│ {                                                                │
│   text: "Your latest invoice #INV-2024-001 is for R15,500.00,   │
│          due on March 15, 2024...",                             │
│   buttons: ["View All Invoices", "Project Updates"]            │
│ }                                                                │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 13: DISPLAY IN CHAT INTERFACE                             │
│ File: js/Chatbot.js - addMessage()                              │
│                                                                  │
│ - Shows bot message with formatted text                          │
│ - Renders action buttons below message                          │
│ - User can click buttons to trigger next action                 │
└─────────────────────────────────────────────────────────────────┘
```

## Key Code Sections

### 1. Button Click Detection (server.js:2844)
```javascript
if (message === 'View Latest Invoice' || 
    messageLower === 'view latest invoice') {
    forcedAction = { 
        type: "action", 
        action: "get_latest_invoice", 
        params: {}, 
        confidence: 0.95, 
        needs_clarification: false 
    };
}
```

### 2. Database Query (server.js:2474)
```javascript
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
    // ... fetch items and payments ...
    // ... format and return structured data ...
}
```

### 3. Natural Language Formatting (server.js:3010)
```javascript
dataContextMessage = `🚨 AUTHORITATIVE DATABASE DATA - INVOICE INFORMATION 🚨

CRITICAL: You MUST summarize this data in natural, conversational language. 
NEVER show raw database fields.

INVOICE DATA (use exact values, format for display):
- Invoice Number: "${safeInvoiceNumber}" → Say as "Invoice #${safeInvoiceNumber}"
- Total Amount: "${safeTotalAmount}" → Format as "R${formattedAmount}"
- Due Date: "${dueDateFormatted}" → Say as "${formattedDate}"

RESPONSE REQUIREMENTS:
✅ Summarize in natural language
❌ NEVER show: "invoice_number: ${safeInvoiceNumber}..."
✅ Always end with relevant action buttons`;
```

### 4. Button Extraction (server.js:3107)
```javascript
// Extract buttons: [[Button Name]]
const buttons = [];
const buttonRegex = /\[\[([^\]]+)\]\]/g;
let match;
while ((match = buttonRegex.exec(finalResponse)) !== null) {
    buttons.push(match[1].trim());
}
```

## Example Complete Flow

**User Action:** Clicks "View Latest Invoice" button

**Backend Processing:**
1. Detects button text → Creates `forcedAction`
2. Calls `getLatestInvoice(companyId)`
3. Queries database → Gets invoice data
4. Formats data → Creates context message
5. Sends to AI → Gets natural language response
6. Extracts buttons → Returns to frontend

**Frontend Display:**
```
User: [View Latest Invoice]

StackOn: Your latest invoice #INV-2024-001 is for R15,500.00, 
         due on March 15, 2024. The outstanding balance is R15,500.00.

[View All Invoices] [Project Updates]
```

## Security & Validation

- ✅ Button clicks are validated against allowed actions
- ✅ Company ID is verified from authenticated user
- ✅ Database queries use parameterized statements
- ✅ Responses are sanitized to prevent injection
- ✅ No raw database fields are exposed to users
