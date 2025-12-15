-- Create password_resets table for password reset functionality
-- This table stores temporary reset tokens that expire after 1 hour

CREATE TABLE IF NOT EXISTS `password_resets` (
  `user_id` INT NOT NULL,
  `token` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `token` (`token`),
  CONSTRAINT `fk_password_reset_user`
    FOREIGN KEY (`user_id`) 
    REFERENCES `Users` (`ID`) 
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  INDEX `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

