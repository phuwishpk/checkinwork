'use strict';

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

pool.getConnection()
  .then(conn => {
    console.log(`MySQL connected to ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306} / ${process.env.DB_NAME}`);
    conn.release();
  })
  .catch(err => {
    console.error('DB connection failed:', err.message);
    console.error('DB_HOST:', process.env.DB_HOST || '(not set)');
    console.error('DB_USER:', process.env.DB_USER || '(not set)');
    console.error('DB_NAME:', process.env.DB_NAME || '(not set)');
  });

module.exports = {
  execute: async (query, params = []) => {
    const [result] = await pool.execute(query, params);
    return [result];
  }
};
