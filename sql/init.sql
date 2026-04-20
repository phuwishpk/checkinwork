CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    role ENUM('admin', 'intern') DEFAULT 'intern'
);

-- Mockup data (passwords are 12345 in plain text for prototype)
INSERT IGNORE INTO users (username, password, full_name, role) VALUES 
('admin', '12345', 'Manager Admin', 'admin'),
('krittinai', '12345', 'Krittinai (Intern)', 'intern'),
('nawapon', '12345', 'Nawapon (Intern)', 'intern'),
('phuwish', '12345', 'Phuwish (Intern)', 'intern');

CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    date DATE NOT NULL,
    clock_in_time TIME,
    clock_out_time TIME,
    total_hours DECIMAL(5,2),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS daily_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    date DATE NOT NULL,
    hours_spent DECIMAL(5,2),
    task_category VARCHAR(100),
    description TEXT,
    status ENUM('pending', 'reviewed') DEFAULT 'pending',
    FOREIGN KEY (user_id) REFERENCES users(id)
);
