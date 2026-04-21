const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// Clock In
router.post('/clock-in', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 8);

  try {
    const [existing] = await db.execute(
      'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
      [userId, today]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Already clocked in for today' });
    }

    await db.execute(
      'INSERT INTO attendance (user_id, date, clock_in_time) VALUES (?, ?, ?)',
      [userId, today, nowTime]
    );
    res.json({ message: 'Clocked in successfully', time: nowTime });
  } catch (error) {
    console.error('Clock-in error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clock Out
router.post('/clock-out', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 8);

  try {
    const [existing] = await db.execute(
      'SELECT * FROM attendance WHERE user_id = ? AND date = ?',
      [userId, today]
    );

    if (existing.length === 0) {
      return res.status(400).json({ error: 'No clock-in record found for today' });
    }

    if (existing[0].clock_out_time) {
      return res.status(400).json({ error: 'Already clocked out for today' });
    }

    const clockIn = existing[0].clock_in_time;
    const timeIn = new Date(`1970-01-01T${clockIn}Z`);
    const timeOut = new Date(`1970-01-01T${nowTime}Z`);
    let diff = (timeOut - timeIn) / (1000 * 60 * 60);
    if (diff < 0) diff = 0;

    await db.execute(
      'UPDATE attendance SET clock_out_time = ?, total_hours = ? WHERE id = ?',
      [nowTime, diff.toFixed(2), existing[0].id]
    );
    res.json({ message: 'Clocked out successfully', time: nowTime, hours: diff.toFixed(2) });
  } catch (error) {
    console.error('Clock-out error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
