const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Get Intern Dashboard Data
router.get('/intern/dashboard', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [attendance] = await db.execute(
      'SELECT * FROM attendance WHERE user_id = ? ORDER BY date DESC LIMIT 7',
      [userId]
    );
    const [logs] = await db.execute(
      'SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date DESC LIMIT 5',
      [userId]
    );

    const [totalHoursRes] = await db.execute(
      'SELECT SUM(total_hours) as total_hours FROM attendance WHERE user_id = ?',
      [userId]
    );

    res.json({
      attendance,
      logs,
      totalHours: totalHoursRes[0].total_hours || 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Manager Dashboard Data
router.get('/manager/dashboard', requireAdmin, async (req, res) => {
  try {
    const [totalHoursRes] = await db.execute(
      'SELECT SUM(total_hours) as total_program_hours FROM attendance'
    );

    const today = new Date().toISOString().slice(0, 10);
    const [roster] = await db.execute(`
      SELECT u.id, u.full_name, u.username,
        CASE WHEN a.clock_in_time IS NOT NULL AND a.clock_out_time IS NULL THEN 'online' ELSE 'offline' END as status
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id AND a.date = ?
      WHERE u.role = 'intern'
    `, [today]);

    const [overview] = await db.execute(`
      SELECT u.full_name, u.role,
             IFNULL(SUM(a.total_hours), 0) as total_hours,
             COUNT(a.id) as days_present
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id
      WHERE u.role = 'intern'
      GROUP BY u.id
    `);

    const [recentLogs] = await db.execute(`
      SELECT l.*, u.full_name
      FROM daily_logs l
      JOIN users u ON l.user_id = u.id
      ORDER BY l.date DESC LIMIT 10
    `);

    res.json({
      totalProgramHours: totalHoursRes[0].total_program_hours || 0,
      roster,
      overview,
      recentLogs
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
