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
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Mockup daily logs data
INSERT IGNORE INTO daily_logs (user_id, date, hours_spent, task_category, description, status) VALUES 
(2, '2024-10-24', 6.5, 'Sustainability Site Audit', 'Conducted comprehensive site analysis for sustainable design practices at the Skygarden Tower project. Evaluated current environmental impact and proposed green building solutions.', 'pending'),
(3, '2024-10-24', 8.0, 'Revit Structural Framework', 'Developed detailed structural framework in Revit for the Bridge Complex project. Coordinated with engineering team on load calculations and material specifications.', 'approved'),
(4, '2024-10-23', 4.0, 'Material Selection Board', 'Created material selection board for Hotel Lobby Renovation project. Researched sustainable materials and presented options to design team.', 'pending'),
(2, '2024-10-23', 7.0, 'Client Presentation Prep', 'Prepared presentation materials for upcoming client meeting. Created renderings and design documentation for residential complex proposal.', 'approved'),
(3, '2024-10-22', 5.5, 'Code Compliance Review', 'Reviewed building codes and regulations for current project. Ensured all designs meet local and national standards for safety and accessibility.', 'pending');
