const mysql = require('mysql2/promise');
require('dotenv').config();
async function run() {
  const db = await mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'secret',
    database: process.env.DB_NAME || 'checkinwork_db',
    port: process.env.DB_PORT || 3306,
  });
  const [logs] = await db.execute(`
      SELECT dl.*, u.full_name, u.username FROM daily_logs dl
      JOIN users u ON dl.user_id = u.id
    `);
  console.log('Logs length:', logs.length);
  const [roster] = await db.execute(`SELECT u.id, u.full_name FROM users u`);
  console.log('Users length:', roster.length);
  process.exit(0);
}
run();
