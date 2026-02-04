# Invoice System - Visual Reference Guide

## User Workflow - Create Invoice

```
┌─────────────────────────────────────────────────────────────────┐
│                      CREATE INVOICE WORKFLOW                     │
└─────────────────────────────────────────────────────────────────┘

STEP 1: CLIENT SELECTION
┌──────────────────────────────────┐
│ Select Company         [Dropdown] │  ← Choose company
│ Select Client          [Dropdown] │  ← Choose existing OR
│                                  │
│ [+ Create New Client]  [Button]  │  ← Create quick client
└──────────────────────────────────┘
         ↓
STEP 1b: QUICK-ADD CLIENT (Optional)
┌──────────────────────────────────┐
│ ✕ Create New Client      [Modal] │
├──────────────────────────────────┤
│ Client Name *    [_______________]
│ Email Address    [_______________]
│ Phone Number     [_______________]
│                                  │
│ [Cancel]  [Create Client]        │
└──────────────────────────────────┘
         ↓
STEP 2: INVOICE DETAILS
┌──────────────────────────────────┐
│ Invoice Date   [2026-02-04]      │
│ Due Date       [2026-03-04]      │
│ Status         [Pending]         │
│                                  │
│ [Back] [Next: Add Items]         │
└──────────────────────────────────┘
         ↓
STEP 3: ADD INVOICE ITEMS
┌──────────────────────────────────────────┐
│ Service Category   │ Deliverables │ ... │ Total
├──────────────────────────────────────────┤
│ Critical Audit     │ O365 Identity │ ... │ 21,600
│ High Audit Finding │ Device Sec    │ ... │ 5,000
├──────────────────────────────────────────┤
│                                    Total │ 26,600
│                                          │
│ [+ Add Item]                             │
│ [Back] [Preview Invoice]                 │
└──────────────────────────────────────────┘
         ↓
STEP 4: PREVIEW & SEND
┌──────────────────────────────────┐
│  [PDF Preview]                   │
│  Invoice #1001                   │
│  ┌────────────────────────────┐  │
│  │ Service│Deliverable│Freq.. │  │
│  │ Audit  │O365 Ident │Once.. │  │
│  │ Audit  │Device Sec │Recur..│  │
│  │        │  Total: R26,600   │  │
│  └────────────────────────────┘  │
│                                  │
│ [Edit] [Send to Client] [Cancel] │
└──────────────────────────────────┘
         ↓
       SUCCESS
    Invoice Created & Sent
```

---

## New Item Modal - Form Fields

```
┌─────────────────────────────────────────────┐
│ ✕ Add Invoice Item                          │
├─────────────────────────────────────────────┤
│                                             │
│ Service Category *                          │
│ ┌─────────────────────────────────────────┐ │
│ │ e.g., Security Audit, Cloud Migration  │ │
│ │ ______________________________________ │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Deliverables *                              │
│ ┌─────────────────────────────────────────┐ │
│ │ O365 Identity & Access Management       │ │
│ │ ______________________________________ │ │
│ │ ______________________________________ │ │
│ │ ______________________________________ │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Frequency * [Once-off ▼]                    │
│   ☑ Once-off                                │
│   ☐ Recurring                               │
│                                             │
│ Rate *                                      │
│ ┌─────────────────────────────────────────┐ │
│ │ e.g., 12 hours, 5 days, 1 month        │ │
│ │ ______________________________________ │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Total (Amount) *                            │
│ ┌─────────────────────────────────────────┐ │
│ │ R ____________________________________  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Cancel] [Add Item]                         │
└─────────────────────────────────────────────┘
```

---

## Invoice PDF - New Table Format

```
╔════════════════════════════════════════════════════════════════════════╗
║                                INVOICE                                 ║
║                                                                        ║
║ Invoice Number: #1001                              Date: Feb 4, 2026   ║
║ Due Date: Mar 4, 2026                                                  ║
╚════════════════════════════════════════════════════════════════════════╝

FROM:                                TO:
StackOps IT Solutions                ABC Company
Waterfall City                       John Doe
Johannesburg                         contact@abc.com
011 568 9337

═════════════════════════════════════════════════════════════════════════════

SERVICE        │  DELIVERABLES           │ FREQUENCY  │ RATE       │ TOTAL
CATEGORY       │                         │            │            │
─────────────────────────────────────────────────────────────────────────────
Critical Audit │ O365 Identity & Access  │ Once-off   │ 12 hours   │ R21,600
Finding        │ Management              │            │            │
─────────────────────────────────────────────────────────────────────────────
High Audit     │ Device & Endpoint       │ Recurring  │ 1 month    │ R 5,000
Finding        │ Security                │            │            │
─────────────────────────────────────────────────────────────────────────────

                                                    TOTAL: R26,600

═════════════════════════════════════════════════════════════════════════════

PAYMENT DETAILS:
Bank Name: [To be updated]
Account: [To be updated]
Reference: 1001
```

---

## Data Flow Diagram

```
┌──────────────┐
│   User       │
│  Selects     │
│   Client     │
└──────┬───────┘
       │
       ├─── Existing Client
       │      ↓
       │   [Confirm Selection]
       │      ↓
       │   [Step 2: Dates]
       │
       └─── New Client
              ↓
          [Quick-Add Modal]
              ↓
          POST /api/admin/clients/quick-add
              ↓
          Database: ClientQuickAdd
          Database: Users (IsQuickAdd=true)
              ↓
          [Client Added to Dropdown]
              ↓
          [Select & Continue]
              ↓
          [Step 2: Dates]

─────────────────────────────────────────

         [Step 3: Items]
              ↓
       [Click Add Item]
              ↓
       [Modal: Enter Details]
       - ServiceCategory
       - Deliverables
       - Frequency
       - Rate
       - Total
              ↓
       [Add Item Button]
              ↓
       Session Storage Updated
       Table Re-rendered
              ↓
       [Repeat for more items]
              ↓

─────────────────────────────────────────

       [Step 4: Preview]
              ↓
       POST /api/admin/invoices/preview
              ↓
       generateInvoicePDF()
       (Uses new item structure)
              ↓
       [Display PDF Preview]
              ↓

─────────────────────────────────────────

     [Send to Client]
              ↓
       POST /api/admin/invoices
              ↓
       INSERT INTO Invoices (...)
       INSERT INTO InvoiceItems (...)
       - ServiceCategory
       - Deliverables
       - Frequency
       - Rate
       - Total
              ↓
       CREATE YOCO PAYMENT LINK
              ↓
       SEND EMAIL WITH PDF
              ↓
       [Success Message]
              ↓
     [Redirect to Invoices List]
```

---

## Quick Reference - Field Descriptions

```
┌─────────────────┬──────────────────────────────────────────────────┐
│ SERVICE         │ What type of service are you providing?          │
│ CATEGORY        │ Examples:                                        │
│                 │ • Critical Audit Finding                         │
│                 │ • High Audit Finding                             │
│                 │ • Device & Endpoint Security                     │
│                 │ • IT Support Services                            │
├─────────────────┼──────────────────────────────────────────────────┤
│ DELIVERABLES    │ What exactly is being delivered?                 │
│                 │ Examples:                                        │
│                 │ • O365 Identity & Access Management              │
│                 │ • Device & Endpoint Security Assessment           │
│                 │ • 24/7 IT Help Desk Support                      │
├─────────────────┼──────────────────────────────────────────────────┤
│ FREQUENCY       │ Is this a one-time or repeating service?        │
│                 │ Options:                                         │
│                 │ • Once-off (single service)                      │
│                 │ • Recurring (repeating/subscription)             │
├─────────────────┼──────────────────────────────────────────────────┤
│ RATE            │ How long does the service take or how often?     │
│                 │ Examples:                                        │
│                 │ • 12 hours (for service time)                    │
│                 │ • 1 month (for recurring billing)                │
│                 │ • per user (alternative units)                   │
│                 │ Be creative - it's a free-form string!           │
├─────────────────┼──────────────────────────────────────────────────┤
│ TOTAL           │ Total amount charged for this item               │
│                 │ Examples:                                        │
│                 │ • 21600 (12 hours × R1800/hour)                  │
│                 │ • 5000 (recurring monthly charge)                │
│                 │ Any currency/decimal amount                      │
└─────────────────┴──────────────────────────────────────────────────┘
```

---

## Frequency Selection Logic

```
Once-off Services:
┌────────────────────────────────────┐
│ Service       │ Deliverable      │
├────────────────────────────────────┤
│ • Audits      │ Assessment done  │
│ • Reviews     │ Report provided  │
│ • Setup       │ Configuration    │
│ • Consulting  │ One-time advice  │
└────────────────────────────────────┘

Recurring Services:
┌────────────────────────────────────┐
│ Service       │ Rate             │
├────────────────────────────────────┤
│ • Support     │ 1 month          │
│ • Monitoring  │ Ongoing          │
│ • Maintenance │ Quarterly        │
│ • SLA         │ Annual           │
└────────────────────────────────────┘
```

---

## Database Relationship Diagram

```
COMPANIES TABLE
├── CompanyID (PK)
├── CompanyName
└── ...
    │
    ├─────────────────────────────┐
    │                             │
    │                      USERS TABLE
    │                      ├── UserID (PK)
    │                      ├── CompanyID (FK) ←─┘
    │                      ├── FirstName
    │                      ├── LastName
    │                      ├── IsQuickAdd ⭐
    │                      └── ...
    │                             │
    │                             └─────────────────────┐
    │                                                   │
    └──────────────────────┐   INVOICES TABLE          │
                           ├── InvoiceID (PK)          │
                           ├── CompanyID (FK) ←────┐   │
                           ├── UserID (FK) ←───────┼───┘
                           ├── InvoiceDate          │
                           ├── DueDate              │
                           ├── TotalAmount          │
                           └── ...
                                │
                                └─────────────────┐
                                                  │
                                    INVOICEITEMS TABLE
                                    ├── ItemID (PK)
                                    ├── InvoiceID (FK) ←────┘
                                    ├── ServiceCategory ⭐
                                    ├── Deliverables ⭐
                                    ├── Frequency ⭐
                                    ├── Rate ⭐
                                    ├── Total ⭐
                                    ├── CreatedAt ⭐
                                    └── UpdatedAt ⭐

                            CLIENTQUICKADD TABLE ⭐
                            ├── QuickClientID (PK)
                            ├── CompanyID (FK)
                            ├── ClientName
                            ├── ClientEmail
                            └── ClientPhone

⭐ = New or Updated
```

---

## Example Invoice Scenarios

### Scenario 1: One-Time Audit Service
```
Client: ABC Corporation
Company: ABC Corp

ITEM 1:
├─ Service Category: Critical Audit Finding
├─ Deliverables: O365 Identity & Access Management
├─ Frequency: Once-off
├─ Rate: 12 hours
└─ Total: R21,600

ITEM 2:
├─ Service Category: High Audit Finding
├─ Deliverables: Device & Endpoint Security
├─ Frequency: Once-off
├─ Rate: 16 hours
└─ Total: R28,800

INVOICE TOTAL: R50,400
```

### Scenario 2: Mixed Services (Once-off + Recurring)
```
Client: XYZ Inc
Company: XYZ

ITEM 1:
├─ Service Category: Implementation
├─ Deliverables: Cloud Migration & Setup
├─ Frequency: Once-off
├─ Rate: 5 days
└─ Total: R25,000

ITEM 2:
├─ Service Category: Support
├─ Deliverables: 24/7 IT Help Desk
├─ Frequency: Recurring
├─ Rate: 1 month
└─ Total: R5,000

ITEM 3:
├─ Service Category: Monitoring
├─ Deliverables: Network & Security Monitoring
├─ Frequency: Recurring
├─ Rate: 1 month
└─ Total: R3,000

INVOICE TOTAL: R33,000 (+ R8,000/month recurring)
```

### Scenario 3: Subscription Service
```
Client: Small Business LLC
Company: SB LLC

ITEM 1:
├─ Service Category: SMB Support Package
├─ Deliverables: Email Support + Remote Assistance
├─ Frequency: Recurring
├─ Rate: 1 month
└─ Total: R2,000

(Invoiced monthly at R2,000)
```

---

## Keyboard Shortcuts (Future Enhancement)

```
Proposed Shortcuts:
┌─────────────────────────────────────┐
│ Ctrl+N    │ New Invoice             │
│ Ctrl+S    │ Save Invoice (Draft)    │
│ Ctrl+P    │ Preview                 │
│ Ctrl+E    │ Send Email              │
│ Tab       │ Next Field              │
│ Enter     │ Add Item / Submit       │
│ Esc       │ Close Modal / Cancel    │
└─────────────────────────────────────┘

(Currently not implemented - future enhancement)
```

---

## Status Codes & Messages

```
Success Messages:
✓ "Client created successfully!"
✓ "Invoice #1001 created and sent successfully!"
✓ "Preview generated successfully"

Warning Messages:
⚠ "Please select a company first"
⚠ "Please add at least one item"
⚠ "Are you sure you want to cancel?"

Error Messages:
✗ "Service Category is required"
✗ "Deliverables are required"
✗ "Failed to create client: Invalid email"
✗ "Failed to generate preview"
✗ "Database connection unavailable"
```

---

## Performance Metrics

```
Expected Performance:
┌────────────────────────────────────┐
│ Quick-Add Client        │ < 500ms   │
│ Add Invoice Item        │ < 200ms   │
│ Generate PDF Preview    │ < 2s      │
│ Create & Send Invoice   │ < 3s      │
│ Load Client Dropdown    │ < 1s      │
└────────────────────────────────────┘

With Optimizations:
- Database indexes on InvoiceID, CompanyID
- Frontend caching where applicable
- Async operations for PDF generation
```

---

## Support Matrix

```
Feature                  Status    Support    Notes
─────────────────────────────────────────────────────
Quick-Add Clients        ✅        Yes        No password needed
Service Categories       ✅        Yes        Manual entry
Deliverables Field       ✅        Yes        Full text support
Frequency Dropdown       ✅        Yes        Once-off/Recurring
Rate String Input        ✅        Yes        Any format allowed
Total Entry              ✅        Yes        Direct entry (no calc)
PDF Generation           ✅        Yes        New format
Email Delivery           ✅        Yes        With PDF
Backward Compat          ✅        Yes        Old format still works
Timestamps               ✅        Yes        CreatedAt/UpdatedAt
Recurring Invoices       ✅        Planned    Future enhancement
```

---

**This visual guide provides a quick reference for the new invoicing system.**

**For detailed information, see:**
- INVOICING_SYSTEM_UPDATE.md
- IMPLEMENTATION_GUIDE.md
- INVOICE_STRUCTURE_COMPARISON.md
