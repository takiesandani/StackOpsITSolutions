-- ============================================================================
-- INVOICE SYSTEM REDESIGN - DATABASE MIGRATION QUERIES
-- Run these queries to update your database schema
-- Date: February 4, 2026
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop the old InvoiceItems table (BACKUP YOUR DATA FIRST!)
-- ============================================================================
DROP TABLE IF EXISTS InvoiceItems;


-- ============================================================================
-- STEP 2: Create the new InvoiceItems table with updated structure
-- ============================================================================
CREATE TABLE InvoiceItems (
    ItemID INT AUTO_INCREMENT PRIMARY KEY,
    InvoiceID INT NOT NULL,
    ServiceCategory VARCHAR(255) NOT NULL,
    Deliverables TEXT NOT NULL,
    Frequency VARCHAR(50) NOT NULL DEFAULT 'Once-off',
    Rate VARCHAR(100) NOT NULL,
    Total DECIMAL(18,2) NOT NULL,
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (InvoiceID) REFERENCES Invoices(InvoiceID) ON DELETE CASCADE,
    INDEX idx_invoice (InvoiceID),
    INDEX idx_frequency (Frequency)
);


-- ============================================================================
-- STEP 3: Create the new ClientQuickAdd table for automation
-- ============================================================================
CREATE TABLE IF NOT EXISTS ClientQuickAdd (
    QuickClientID INT AUTO_INCREMENT PRIMARY KEY,
    CompanyID INT NOT NULL,
    ClientName VARCHAR(255) NOT NULL,
    ClientEmail VARCHAR(255),
    ClientPhone VARCHAR(20),
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (CompanyID) REFERENCES Companies(CompanyID) ON DELETE CASCADE,
    INDEX idx_company (CompanyID),
    INDEX idx_client_name (ClientName)
);


-- ============================================================================
-- STEP 4: Add IsQuickAdd column to Users table to track quick-added clients
-- ============================================================================
ALTER TABLE Users 
ADD COLUMN IF NOT EXISTS IsQuickAdd BOOLEAN DEFAULT FALSE;


-- ============================================================================
-- OPTIONAL: Sample data to test the new structure
-- ============================================================================
-- Uncomment and modify these to add test data

-- -- Insert a test invoice item with the new structure
-- INSERT INTO InvoiceItems (
--     InvoiceID, 
--     ServiceCategory, 
--     Deliverables, 
--     Frequency, 
--     Rate, 
--     Total
-- ) VALUES (
--     1,
--     'Critical Audit Finding',
--     'O365 Identity & Access Management',
--     'Once-off',
--     '12 hours',
--     21600.00
-- );

-- -- Insert another test invoice item (recurring)
-- INSERT INTO InvoiceItems (
--     InvoiceID, 
--     ServiceCategory, 
--     Deliverables, 
--     Frequency, 
--     Rate, 
--     Total
-- ) VALUES (
--     1,
--     'Device & Endpoint Security',
--     'Endpoint Protection Services',
--     'Recurring',
--     '1 month',
--     5000.00
-- );

-- -- Create a test quick-add client
-- INSERT INTO ClientQuickAdd (
--     CompanyID,
--     ClientName,
--     ClientEmail,
--     ClientPhone
-- ) VALUES (
--     1,
--     'Test Client',
--     'test@company.com',
--     '+27 11 123 4567'
-- );


-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these queries to verify the migration was successful

-- View the new InvoiceItems structure
-- DESC InvoiceItems;

-- View the new ClientQuickAdd structure
-- DESC ClientQuickAdd;

-- Check if IsQuickAdd column exists in Users
-- DESC Users;

-- Count quick-added clients
-- SELECT COUNT(*) as QuickAddClientsCount FROM ClientQuickAdd;

-- View all invoice items with new structure
-- SELECT * FROM InvoiceItems;


-- ============================================================================
-- NOTES FOR MIGRATION
-- ============================================================================
-- 
-- 1. BACKUP YOUR DATABASE BEFORE RUNNING THESE QUERIES!
-- 
-- 2. The old InvoiceItems structure is being dropped. If you have 
--    existing data that needs to be preserved, run this BEFORE 
--    the DROP statement to back it up:
--
--    CREATE TABLE InvoiceItems_Backup AS SELECT * FROM InvoiceItems;
--
-- 3. The system still supports the old format via the API for 
--    backward compatibility, but the database will only store 
--    the new format going forward.
--
-- 4. New fields:
--    - ServiceCategory: Manual text entry (e.g., "Security Audit")
--    - Deliverables: Full description of what's being delivered
--    - Frequency: 'Once-off' or 'Recurring'
--    - Rate: Manual text entry (e.g., "12 hours", "2 weeks", "annual")
--    - Total: The amount for this line item
--
-- 5. Removed fields (no longer part of invoicing):
--    - Description
--    - Quantity
--    - UnitPrice
--    - Amount (calculated from Quantity * UnitPrice)
--
-- ============================================================================
