-- Create appointment table for consultation bookings
CREATE TABLE IF NOT EXISTS `appointment` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `date` DATE NOT NULL,
  `time` TIME NOT NULL,
  `is_available` TINYINT DEFAULT 1,
  `clientName` VARCHAR(255),
  `companyName` VARCHAR(255),
  `title` VARCHAR(255),
  `email` VARCHAR(255),
  `phone` VARCHAR(255),
  `service` VARCHAR(255),
  `message` TEXT,
  `status` ENUM('pending', 'completed') DEFAULT 'pending',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_appointment` (`date`, `time`),
  INDEX `idx_date` (`date`),
  INDEX `idx_email` (`email`),
  INDEX `idx_available` (`is_available`),
  INDEX `idx_status` (`status`)
);
