const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let dbInstance = null;

// Initialize SQLite Database
async function initDb() {
  try {
    const dbPath = path.join(__dirname, '../../database.sqlite');
    dbInstance = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    console.log(`SQLite database connected at ${dbPath}`);

    // Create tables if they do not exist
    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT,
        full_name TEXT
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        date TEXT,
        clock_in_time TEXT,
        clock_out_time TEXT,
        total_hours REAL,
        ot_hours REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS daily_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        date TEXT,
        date_start TEXT,
        date_finish TEXT,
        task_category TEXT,
        description TEXT,
        status TEXT DEFAULT 'Plan',
        color TEXT DEFAULT '#3e76fe'
      );
    `);

    // Pre-populate hardcoded users to ensure joins (e.g. for Manager Dashboard) work properly
    await dbInstance.run(`INSERT OR IGNORE INTO users (id, username, password, role, full_name) VALUES 
      (1, 'admin', 'password', 'admin', 'Admin Manager')`);
    await dbInstance.run(`INSERT OR IGNORE INTO users (id, username, password, role, full_name) VALUES 
      (2, 'intern', 'password', 'intern', 'Intern User')`);
    await dbInstance.run(`INSERT OR IGNORE INTO users (id, username, password, role, full_name) VALUES 
      (3, 'sarah', 'password', 'intern', 'Sarah Jenkins')`);
    await dbInstance.run(`INSERT OR IGNORE INTO users (id, username, password, role, full_name) VALUES 
      (4, 'krittinai', 'password', 'intern', 'Krittinai')`);
    await dbInstance.run(`INSERT OR IGNORE INTO users (id, username, password, role, full_name) VALUES 
      (5, 'nawapon', 'password', 'intern', 'Nawapon')`);
    await dbInstance.run(`INSERT OR IGNORE INTO users (id, username, password, role, full_name) VALUES 
      (6, 'phuwish', 'password', 'intern', 'Phuwish')`);

    // Migration: add ot_hours column if it doesn't exist (safe for existing DBs)
    try {
      await dbInstance.run('ALTER TABLE attendance ADD COLUMN ot_hours REAL DEFAULT 0');
      console.log('Migration: added ot_hours column to attendance');
    } catch (e) { /* Column already exists */ }

    // Migration: add new daily_logs columns
    try { await dbInstance.run('ALTER TABLE daily_logs ADD COLUMN date_start TEXT'); } catch(e) {}
    try { await dbInstance.run('ALTER TABLE daily_logs ADD COLUMN date_finish TEXT'); } catch(e) {}
    try { await dbInstance.run('ALTER TABLE daily_logs ADD COLUMN color TEXT DEFAULT "#3e76fe"'); } catch(e) {}
    // Remove hours_spent dependency — keep column but don't require it

  } catch (err) {
    console.error('SQLite connection/initialization failed:', err);
  }
}

// Call init on startup
initDb();

// Export a wrapper that mimics mysql2/promise `[rows]` structure
module.exports = {
  execute: async (query, params = []) => {
    if (!dbInstance) {
      throw new Error('Database not initialized yet');
    }
    
    const isSelect = query.trim().toUpperCase().startsWith('SELECT');
    
    if (isSelect) {
      const rows = await dbInstance.all(query, params);
      return [rows]; // Wrap in array to mimic mysql2: const [rows] = await db.execute(...)
    } else {
      const result = await dbInstance.run(query, params);
      return [result]; // Mimic [resultHeader]
    }
  }
};
