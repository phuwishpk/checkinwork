-- Production MySQL/MariaDB schema for internship attendance system
-- Run once before first deploy via Plesk phpMyAdmin or:
--   mysql -h DB_HOST -u DB_USER -pDB_PASSWORD DB_NAME < sql/init.sql
-- Safe to re-run (all statements are idempotent).

SET NAMES utf8mb4;

-- -------------------------------------------------------------------
-- users
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id        INT AUTO_INCREMENT PRIMARY KEY,
    username  VARCHAR(50)  NOT NULL UNIQUE,
    password  VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    role      VARCHAR(20)  NOT NULL DEFAULT 'intern'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------------
-- attendance
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT          NOT NULL,
    date           DATE         NOT NULL,
    clock_in_time  TIME,
    clock_out_time TIME,
    total_hours    DECIMAL(6,2) DEFAULT 0,
    ot_hours       DECIMAL(6,2) DEFAULT 0,
    log_id         INT, -- New column for linking to daily_logs
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (log_id) REFERENCES daily_logs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------------
-- daily_logs
-- status is VARCHAR (not ENUM) because the app uses multiple value sets:
--   intern task status : 'Plan', 'To Do', 'In Progress', 'Done'
--   manager approval   : 'approved', 'rejected'
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_logs (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT         NOT NULL,
    date          DATE,
    date_start    DATE,
    date_finish   DATE,
    task_category VARCHAR(100),
    description   TEXT,
    status        VARCHAR(30) NOT NULL DEFAULT 'Plan',
    color         VARCHAR(20) NOT NULL DEFAULT '#3e76fe',
    created_at    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -------------------------------------------------------------------
-- Seed users (bcrypt hashed passwords, cost=10)
-- -------------------------------------------------------------------
INSERT IGNORE INTO users (id, username, password, role, full_name) VALUES
(1, 'admin',     '$2a$10$VMXZIqdYktS4066Q3Y/znOVQxFbGO0.brFQpbH2tITBhFvzUfqM7e', 'admin',  'Admin Manager'),
(2, 'superadmin', '$2a$10$VMXZIqdYktS4066Q3Y/znOVQxFbGO0.brFQpbH2tITBhFvzUfqM7e', 'superadmin', 'Super Administrator'),
(3, 'krittinai', '$2a$10$7yOuCVKNbmY8Qr9LdaiON.odcwamjYdl6MDOXFxRiI9KETQMQExai', 'intern', 'Krittinai'),
(4, 'nawapon',   '$2a$10$IK.cuaUphj9ZRd18WbkQuO6b4otc8pBaU1TUIAIvLOSrmIrpK797a', 'intern', 'Nawapon'),
(5, 'phuwish',   '$2a$10$ZAV2ozk/LIkzrDIGUmLqf.AnSYyjpsokBTN/CsTJ1nO0Ke6uCO/Q.', 'intern', 'Phuwish');

-- Grant access from any host (needed for Docker bridge network)
GRANT ALL PRIVILEGES ON intern_clickrobot.* TO 'intern_clickrobot'@'%' IDENTIFIED BY 'intern_clickrobot';
FLUSH PRIVILEGES;
