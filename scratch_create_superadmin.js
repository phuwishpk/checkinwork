const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./src/config/database');

async function createSuperAdmin() {
    try {
        const username = 'superadmin';
        const passwordHash = '$2a$10$VMXZIqdYktS4066Q3Y/znOVQxFbGO0.brFQpbH2tITBhFvzUfqM7e'; // Hash of '12345'
        const fullName = 'Super Administrator';
        const role = 'superadmin';

        console.log('Attempting to create superadmin user...');
        
        // Check if user exists
        const [rows] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
        if (rows.length > 0) {
            console.log('User already exists. Updating role to superadmin...');
            await db.execute('UPDATE users SET role = ?, full_name = ? WHERE username = ?', [role, fullName, username]);
        } else {
            console.log('Creating new superadmin user...');
            await db.execute(
                'INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)',
                [username, passwordHash, role, fullName]
            );
        }
        
        console.log('Successfully created/updated superadmin user.');
        process.exit(0);
    } catch (error) {
        console.error('Error creating superadmin:', error);
        process.exit(1);
    }
}

createSuperAdmin();
