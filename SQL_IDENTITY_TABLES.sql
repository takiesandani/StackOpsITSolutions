-- ════════════════════════════════════════════════════════════════════════════════
-- IDENTITY DASHBOARD DATABASE TABLES
-- Run these queries in your consultation_db database
-- ════════════════════════════════════════════════════════════════════════════════

-- 1. Main metrics table (updated every 1 minute)
CREATE TABLE IF NOT EXISTS identity_metrics (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'sunbird',
    total_users INT,
    admin_users INT,
    mfa_enabled_users INT,
    mfa_percentage DECIMAL(5,2),
    high_risk_users INT,
    medium_risk_users INT,
    active_users_24h INT,
    users_with_complete_profile INT,
    privileged_users_without_mfa INT,
    identity_risk_score INT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_tenant (tenant_id),
    INDEX idx_tenant_updated (tenant_id, last_updated)
);

-- 2. Detailed user data table (cached from API)
CREATE TABLE IF NOT EXISTS identity_users (
    id VARCHAR(100) PRIMARY KEY,
    user_principal_name VARCHAR(255),
    display_name VARCHAR(255),
    mail VARCHAR(255),
    job_title VARCHAR(255),
    mobile_phone VARCHAR(20),
    roles LONGTEXT,
    mfa_enabled TINYINT,
    auth_method_count INT,
    risk_level VARCHAR(20),
    is_external TINYINT,
    account_enabled TINYINT,
    last_signin_datetime DATETIME,
    last_signin_location VARCHAR(255),
    last_signin_device VARCHAR(255),
    days_since_signin INT,
    is_admin TINYINT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_last_updated (last_updated),
    INDEX idx_risk_level (risk_level),
    INDEX idx_mfa_enabled (mfa_enabled),
    INDEX idx_is_admin (is_admin)
);

-- 3. Risk breakdown (for charts)
CREATE TABLE IF NOT EXISTS identity_risk_scores (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'sunbird',
    inactive_0_7_days INT,
    inactive_7_30_days INT,
    inactive_30_90_days INT,
    inactive_90_plus_days INT,
    device_managed INT,
    device_unmanaged INT,
    device_unknown INT,
    auth_password_only INT,
    auth_basic_mfa INT,
    auth_strong_mfa INT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_tenant (tenant_id),
    INDEX idx_tenant_updated (tenant_id, last_updated)
);

-- 4. Cache metadata (track sync status)
CREATE TABLE IF NOT EXISTS identity_cache_metadata (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'sunbird',
    last_sync_time DATETIME,
    next_sync_time DATETIME,
    sync_status VARCHAR(20),
    sync_error_message LONGTEXT,
    total_users_synced INT,
    sync_duration_seconds INT,
    
    UNIQUE KEY unique_tenant (tenant_id),
    INDEX idx_sync_status (sync_status)
);

-- 5. Sign-in activity summary (for live activity display)
CREATE TABLE IF NOT EXISTS identity_signin_activity (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'sunbird',
    sign_in_count_24h INT,
    failed_signin_count_24h INT,
    unique_locations_count INT,
    top_locations LONGTEXT,
    recent_signings LONGTEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY unique_tenant (tenant_id),
    INDEX idx_tenant_updated (tenant_id, last_updated)
);

-- Verify tables created
SELECT TABLE_NAME, TABLE_SCHEMA 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'consultation_db' 
AND TABLE_NAME IN ('identity_metrics', 'identity_users', 'identity_risk_scores', 'identity_cache_metadata', 'identity_signin_activity');
