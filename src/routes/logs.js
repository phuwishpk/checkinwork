const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

// Submit Daily Log
router.post('/intern/log', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { date, hours_spent, task_category, description, is_draft } = req.body;

  if (!date || !hours_spent || !task_category || !description) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const status = is_draft ? 'pending' : 'pending';

  try {
    await db.execute(
      'INSERT INTO daily_logs (user_id, date, hours_spent, task_category, description, status) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, date, hours_spent, task_category, description, status]
    );
    res.json({ message: 'Log submitted successfully' });
  } catch (error) {
    console.error('Log submission error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
