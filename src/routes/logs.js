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

// Get all logs for manager review
router.get('/all', requireAuth, async (req, res) => {
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const [logs] = await db.execute(`
      SELECT dl.*, u.full_name, u.username
      FROM daily_logs dl
      JOIN users u ON dl.user_id = u.id
      ORDER BY dl.date DESC, dl.created_at DESC
    `);
    res.json({ logs });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve a log
router.post('/:id/approve', requireAuth, async (req, res) => {
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const logId = req.params.id;

  try {
    await db.execute(
      'UPDATE daily_logs SET status = ? WHERE id = ?',
      ['approved', logId]
    );
    res.json({ message: 'Log approved successfully' });
  } catch (error) {
    console.error('Error approving log:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject a log
router.post('/:id/reject', requireAuth, async (req, res) => {
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const logId = req.params.id;

  try {
    await db.execute(
      'UPDATE daily_logs SET status = ? WHERE id = ?',
      ['rejected', logId]
    );
    res.json({ message: 'Log rejected successfully' });
  } catch (error) {
    console.error('Error rejecting log:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
