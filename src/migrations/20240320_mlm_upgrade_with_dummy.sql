-- MLM Upgrade Migration with Dummy Data
-- Date: 2024-03-20
-- Description: Updates database schema for MLM features and adds dummy data

-- Add new columns to users table
SET @dbname = DATABASE();
SET @tablename = "users";
SET @columnname = "referral_code";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE 
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "SELECT 1",
  "ALTER TABLE `users` ADD COLUMN `referral_code` VARCHAR(16) UNIQUE AFTER `phone`"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = "total_referrals";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE 
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "SELECT 1",
  "ALTER TABLE `users` ADD COLUMN `total_referrals` INT DEFAULT 0 AFTER `referral_code`"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = "total_qoinz_earned";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE 
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "SELECT 1",
  "ALTER TABLE `users` ADD COLUMN `total_qoinz_earned` DECIMAL(10,2) DEFAULT 0.00 AFTER `total_referrals`"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @columnname = "last_level_up";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE 
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "SELECT 1",
  "ALTER TABLE `users` ADD COLUMN `last_level_up` TIMESTAMP NULL AFTER `total_qoinz_earned`"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Now update existing user with ID 3 with new MLM-related data
UPDATE `users` 
SET `referral_code` = 'DUMMY123', 
    `total_referrals` = 2,
    `total_qoinz_earned` = 10.50,
    `last_level_up` = NOW()
WHERE `id` = 3;

-- Add new columns to branches table
SET @tablename = "branches";

-- Add max_members column
SET @columnname = "max_members";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE 
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "SELECT 1",
  "ALTER TABLE `branches` ADD COLUMN `max_members` INT DEFAULT 9 AFTER `member_count`"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add completion_rewards column
SET @columnname = "completion_rewards";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE 
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "SELECT 1",
  "ALTER TABLE `branches` ADD COLUMN `completion_rewards` JSON NULL AFTER `completion_date`"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add auto_placement_enabled column
SET @columnname = "auto_placement_enabled";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE 
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "SELECT 1",
  "ALTER TABLE `branches` ADD COLUMN `auto_placement_enabled` BOOLEAN DEFAULT FALSE AFTER `completion_rewards`"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Create branch_members table
CREATE TABLE IF NOT EXISTS `branch_members` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `branch_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `position` INT NOT NULL,
  `joined_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_branch_member` (`branch_id`, `user_id`),
  KEY `idx_branch_members_branch` (`branch_id`),
  KEY `idx_branch_members_user` (`user_id`),
  FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Create level_rewards table
CREATE TABLE IF NOT EXISTS `level_rewards` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `level` INT NOT NULL,
  `branch_slots` INT NOT NULL,
  `qoinz_reward` DECIMAL(10,2) NOT NULL,
  `exp_reward` INT NOT NULL,
  `badge` VARCHAR(50) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_level` (`level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert default level rewards
INSERT INTO `level_rewards` (`level`, `branch_slots`, `qoinz_reward`, `exp_reward`, `badge`) VALUES
(1, 1, 0.00, 0, 'Beginner'),
(2, 2, 10.00, 100, 'Rising Star'),
(3, 3, 25.00, 250, 'Branch Builder'),
(4, 5, 50.00, 500, 'Network Pro'),
(5, 7, 100.00, 1000, 'MLM Master')
ON DUPLICATE KEY UPDATE level = VALUES(level);

-- Create achievement_categories table
CREATE TABLE IF NOT EXISTS `achievement_categories` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `description` TEXT NOT NULL,
  `icon` VARCHAR(50) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_category` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Insert default achievement categories
INSERT INTO `achievement_categories` (`name`, `description`, `icon`) VALUES
('Branch Building', 'Achievements for building and completing branches', 'branch'),
('Referrals', 'Achievements for successful referrals', 'referral'),
('Leveling', 'Achievements for level progression', 'level'),
('QOINZ', 'Achievements for earning QOINZ', 'qoinz')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Add category_id to achievements table
ALTER TABLE `achievements`
ADD COLUMN IF NOT EXISTS `category_id` INT AFTER `id`,
ADD FOREIGN KEY IF NOT EXISTS (`category_id`) REFERENCES `achievement_categories` (`id`);

-- Create user_activity_logs table
CREATE TABLE IF NOT EXISTS `user_activity_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `country` VARCHAR(64) DEFAULT NULL,
  `city` VARCHAR(64) DEFAULT NULL,
  `isp` VARCHAR(128) DEFAULT NULL,
  `user_agent` TEXT,
  `referrer` TEXT,
  `details` JSON DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_activity_user` (`user_id`),
  KEY `idx_activity_action` (`action`),
  KEY `idx_activity_timestamp` (`timestamp`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Add dummy branches for user 3
INSERT INTO `branches` (`id`, `owner_id`, `branch_number`, `member_count`, `max_members`, `is_completed`, `completion_date`, `completion_rewards`, `auto_placement_enabled`, `created_at`)
VALUES 
(1, 3, 1, 5, 9, 0, NULL, NULL, true, NOW()),
(2, 3, 2, 9, 9, 1, NOW(), '{"qoinz": 4.5, "exp": 50}', false, NOW())
ON DUPLICATE KEY UPDATE id = VALUES(id);

-- Add dummy branch members
INSERT INTO `branch_members` (`branch_id`, `user_id`, `position`, `joined_at`)
VALUES 
-- Branch 1 members
(1, 3, 1, NOW()),
(1, 4, 2, NOW()),
(1, 5, 3, NOW()),
(1, 6, 4, NOW()),
(1, 7, 5, NOW()),
-- Branch 2 members (completed branch)
(2, 3, 1, NOW()),
(2, 8, 2, NOW()),
(2, 9, 3, NOW()),
(2, 10, 4, NOW()),
(2, 11, 5, NOW()),
(2, 12, 6, NOW()),
(2, 13, 7, NOW()),
(2, 14, 8, NOW()),
(2, 15, 9, NOW())
ON DUPLICATE KEY UPDATE branch_id = VALUES(branch_id);

-- Add dummy activity logs for user 3
INSERT INTO `user_activity_logs` (`user_id`, `action`, `timestamp`, `ip_address`, `details`)
VALUES 
(3, 'branch_created', NOW(), '127.0.0.1', '{"branch_id": 1}'),
(3, 'branch_created', NOW(), '127.0.0.1', '{"branch_id": 2}'),
(3, 'member_added', NOW(), '127.0.0.1', '{"branch_id": 1, "member_id": 4}'),
(3, 'branch_completed', NOW(), '127.0.0.1', '{"branch_id": 2, "rewards": {"qoinz": 4.5, "exp": 50}}'),
(3, 'level_up', NOW(), '127.0.0.1', '{"old_level": 1, "new_level": 2}');

-- Create stored procedure for level up check
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS `check_level_up`(IN `user_id` INT)
BEGIN
    DECLARE current_level INT;
    DECLARE current_exp INT;
    DECLARE required_exp INT;
    DECLARE new_level INT;
    
    SELECT level, exp INTO current_level, current_exp
    FROM users WHERE id = user_id;
    
    SET required_exp = 100 * POW(1.5, current_level - 1);
    
    IF current_exp >= required_exp THEN
        SET new_level = current_level + 1;
        
        -- Update user level and branch slots
        UPDATE users 
        SET level = new_level,
            branch_slots = (SELECT branch_slots FROM level_rewards WHERE level = new_level),
            last_level_up = CURRENT_TIMESTAMP
        WHERE id = user_id;
        
        -- Award level rewards
        INSERT INTO wallet_transactions (user_id, amount, type, source_id, notes)
        SELECT user_id, qoinz_reward, 'level_up', new_level, CONCAT('Level ', new_level, ' Reward')
        FROM level_rewards
        WHERE level = new_level;
        
        -- Update user's QOINZ balance
        UPDATE users 
        SET qoinz_balance = qoinz_balance + (
            SELECT qoinz_reward 
            FROM level_rewards 
            WHERE level = new_level
        )
        WHERE id = user_id;
        
        -- Log the level up
        INSERT INTO user_activity_logs (user_id, action, details)
        VALUES (user_id, 'level_up', JSON_OBJECT(
            'old_level', current_level,
            'new_level', new_level,
            'exp_gained', current_exp
        ));
    END IF;
END //
DELIMITER ;

-- Create stored procedure for branch completion check
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS `check_branch_completion`(IN `branch_id` INT)
BEGIN
    DECLARE member_count INT;
    DECLARE owner_id INT;
    DECLARE is_completed BOOLEAN;
    
    SELECT b.member_count, b.owner_id, b.is_completed 
    INTO member_count, owner_id, is_completed
    FROM branches b WHERE b.id = branch_id;
    
    IF member_count >= 9 AND NOT is_completed THEN
        -- Mark branch as completed
        UPDATE branches 
        SET is_completed = 1,
            completion_date = CURRENT_TIMESTAMP,
            completion_rewards = JSON_OBJECT(
                'qoinz', 4.5,
                'exp', 50
            )
        WHERE id = branch_id;
        
        -- Award QOINZ
        INSERT INTO wallet_transactions (user_id, amount, type, source_id, notes)
        VALUES (owner_id, 4.5, 'branch_completion', branch_id, 'Branch Completion Reward');
        
        -- Award EXP
        INSERT INTO exp_transactions (user_id, amount, source, source_id)
        VALUES (owner_id, 50, 'branch_completion', branch_id);
        
        -- Update user's QOINZ balance
        UPDATE users 
        SET qoinz_balance = qoinz_balance + 4.5,
            total_qoinz_earned = total_qoinz_earned + 4.5
        WHERE id = owner_id;
        
        -- Check for level up
        CALL check_level_up(owner_id);
        
        -- Log the completion
        INSERT INTO user_activity_logs (user_id, action, details)
        VALUES (owner_id, 'branch_completion', JSON_OBJECT(
            'branch_id', branch_id,
            'member_count', member_count,
            'rewards', JSON_OBJECT(
                'qoinz', 4.5,
                'exp', 50
            )
        ));
    END IF;
END //
DELIMITER ;

-- Create rollback procedure
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS `rollback_user_columns`()
BEGIN
    -- Drop columns if they exist
    SET @dbname = DATABASE();
    SET @tablename = "users";
    
    -- Drop last_level_up
    SET @columnname = "last_level_up";
    SET @preparedStatement = (SELECT IF(
      (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE 
          (TABLE_SCHEMA = @dbname)
          AND (TABLE_NAME = @tablename)
          AND (COLUMN_NAME = @columnname)
      ) > 0,
      "ALTER TABLE `users` DROP COLUMN `last_level_up`",
      "SELECT 1"
    ));
    PREPARE dropIfExists FROM @preparedStatement;
    EXECUTE dropIfExists;
    DEALLOCATE PREPARE dropIfExists;
    
    -- Drop total_qoinz_earned
    SET @columnname = "total_qoinz_earned";
    SET @preparedStatement = (SELECT IF(
      (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE 
          (TABLE_SCHEMA = @dbname)
          AND (TABLE_NAME = @tablename)
          AND (COLUMN_NAME = @columnname)
      ) > 0,
      "ALTER TABLE `users` DROP COLUMN `total_qoinz_earned`",
      "SELECT 1"
    ));
    PREPARE dropIfExists FROM @preparedStatement;
    EXECUTE dropIfExists;
    DEALLOCATE PREPARE dropIfExists;
    
    -- Drop total_referrals
    SET @columnname = "total_referrals";
    SET @preparedStatement = (SELECT IF(
      (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE 
          (TABLE_SCHEMA = @dbname)
          AND (TABLE_NAME = @tablename)
          AND (COLUMN_NAME = @columnname)
      ) > 0,
      "ALTER TABLE `users` DROP COLUMN `total_referrals`",
      "SELECT 1"
    ));
    PREPARE dropIfExists FROM @preparedStatement;
    EXECUTE dropIfExists;
    DEALLOCATE PREPARE dropIfExists;
    
    -- Drop referral_code
    SET @columnname = "referral_code";
    SET @preparedStatement = (SELECT IF(
      (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE 
          (TABLE_SCHEMA = @dbname)
          AND (TABLE_NAME = @tablename)
          AND (COLUMN_NAME = @columnname)
      ) > 0,
      "ALTER TABLE `users` DROP COLUMN `referral_code`",
      "SELECT 1"
    ));
    PREPARE dropIfExists FROM @preparedStatement;
    EXECUTE dropIfExists;
    DEALLOCATE PREPARE dropIfExists;
END //
DELIMITER ; 