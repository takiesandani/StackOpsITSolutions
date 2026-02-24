-- Add status column to existing appointment table
ALTER TABLE appointment 
ADD COLUMN IF NOT EXISTS `status` ENUM('pending', 'completed') DEFAULT 'pending',
ADD INDEX IF NOT EXISTS `idx_status` (`status`);
