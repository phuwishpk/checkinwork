const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const db = require('./src/config/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 1000 * 60 * 60 * 24
  }
}));

// --- Authentication Middleware ---
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// --- API Routes ---

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    // Hardcoded auth users mapping
    const hardcodedUsers = {
      'admin': { id: 1, username: 'admin', password: 'password', role: 'admin', full_name: 'Admin Manager' },
      'intern': { id: 2, username: 'intern', password: 'password', role: 'intern', full_name: 'Intern User' },
      'sarah': { id: 3, username: 'sarah', password: 'password', role: 'intern', full_name: 'Sarah Jenkins' },
      'krittinai': { id: 4, username: 'krittinai', password: 'password', role: 'intern', full_name: 'Krittinai' },
      'nawapon': { id: 5, username: 'nawapon', password: 'password', role: 'intern', full_name: 'Nawapon' },
      'phuwish': { id: 6, username: 'phuwish', password: 'password', role: 'intern', full_name: 'Phuwish' }
    };
    
    const user = hardcodedUsers[username];
    
    if (user && user.password === password) {
      req.session.user = { id: user.id, username: user.username, role: user.role, full_name: user.full_name };
      res.json({ message: 'Login successful', user: req.session.user });
    } else {
      res.status(401).json({ error: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out successfully' });
});

// Get Session
app.get('/api/session', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'No active session' });
  }
});

// Clock In - allowed anytime, OT tracked on clock-out
app.post('/api/clock-in', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 8);
  try {
    const [existing] = await db.execute('SELECT * FROM attendance WHERE user_id = ? AND date = ? ORDER BY id DESC', [userId, today]);
    if (existing.length >= 5) {
      return res.status(400).json({ error: 'Maximum 5 check-ins per day reached' });
    }
    if (existing.length > 0 && !existing[0].clock_out_time) {
      return res.status(400).json({ error: 'Already clocked in. Please clock out first.' });
    }
    await db.execute('INSERT INTO attendance (user_id, date, clock_in_time) VALUES (?, ?, ?)', [userId, today, nowTime]);
    res.json({ message: 'Clocked in successfully', time: nowTime });
  } catch (error) {
    console.error('Clock-in error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clock Out - calculate total_hours and ot_hours
app.post('/api/clock-out', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 8);
  try {
    const [existing] = await db.execute('SELECT * FROM attendance WHERE user_id = ? AND date = ? ORDER BY id DESC LIMIT 1', [userId, today]);
    if (existing.length === 0) {
      return res.status(400).json({ error: 'No clock-in record found for today' });
    }
    if (existing[0].clock_out_time) {
      return res.status(400).json({ error: 'Already clocked out' });
    }

    const clockIn = existing[0].clock_in_time;
    const [inH, inM, inS] = clockIn.split(':').map(Number);
    const [outH, outM, outS] = nowTime.split(':').map(Number);
    const inTotal = inH * 3600 + inM * 60 + (inS || 0);
    const outTotal = outH * 3600 + outM * 60 + (outS || 0);
    let diffSec = outTotal - inTotal;
    if (diffSec < 0) diffSec = 0;
    const totalHours = diffSec / 3600;

    // OT: time worked past 17:00
    const limit17Sec = 17 * 3600;
    let otSec = 0;
    if (outTotal > limit17Sec) {
      const effectiveStart = Math.max(inTotal, limit17Sec);
      otSec = outTotal - effectiveStart;
    }
    const otHours = otSec / 3600;

    await db.execute(
      'UPDATE attendance SET clock_out_time = ?, total_hours = ?, ot_hours = ? WHERE id = ?',
      [nowTime, totalHours.toFixed(2), otHours.toFixed(2), existing[0].id]
    );
    res.json({ message: 'Clocked out successfully', time: nowTime, hours: totalHours.toFixed(2), ot_hours: otHours.toFixed(2) });
  } catch (error) {
    console.error('Clock-out error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all logs for intern
app.get('/api/intern/logs', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [logs] = await db.execute('SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date_start DESC, id DESC', [userId]);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create Daily Log
app.post('/api/intern/log', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { date_start, date_finish, task_category, description, status, color } = req.body;
  try {
    await db.execute(
      'INSERT INTO daily_logs (user_id, date, date_start, date_finish, task_category, description, status, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, date_start || new Date().toISOString().slice(0,10), date_start, date_finish, task_category, description, status || 'Plan', color || '#3e76fe']
    );
    res.json({ message: 'Log created successfully' });
  } catch (error) {
    console.error('Log creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Daily Log
app.put('/api/intern/log/:id', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  const { date_start, date_finish, task_category, description, status, color } = req.body;
  try {
    await db.execute(
      'UPDATE daily_logs SET date=?, date_start=?, date_finish=?, task_category=?, description=?, status=?, color=? WHERE id=? AND user_id=?',
      [date_start || new Date().toISOString().slice(0,10), date_start, date_finish, task_category, description, status, color, id, userId]
    );
    res.json({ message: 'Log updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Daily Log
app.delete('/api/intern/log/:id', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { id } = req.params;
  try {
    await db.execute('DELETE FROM daily_logs WHERE id=? AND user_id=?', [id, userId]);
    res.json({ message: 'Log deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Get Intern Dashboard Data
app.get('/api/intern/dashboard', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [attendance] = await db.execute('SELECT * FROM attendance WHERE user_id = ? ORDER BY date DESC, id DESC', [userId]);
    const [logs] = await db.execute('SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date DESC', [userId]);
    const [totalHoursRes] = await db.execute('SELECT SUM(total_hours) as total_hours, SUM(ot_hours) as total_ot_hours FROM attendance WHERE user_id = ?', [userId]);
    res.json({
      attendance,
      logs,
      totalHours: totalHoursRes[0].total_hours || 0,
      totalOtHours: totalHoursRes[0].total_ot_hours || 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Intern Calendar Data
app.get('/api/intern/calendar', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [attendance] = await db.execute('SELECT * FROM attendance WHERE user_id = ? ORDER BY date ASC', [userId]);
    const [logs] = await db.execute('SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date ASC', [userId]);
    res.json({ attendance, logs });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Manager Dashboard Data
app.get('/api/manager/dashboard', requireAdmin, async (req, res) => {
  try {
    const [totalHoursRes] = await db.execute('SELECT SUM(total_hours) as total_program_hours FROM attendance');
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
      ORDER BY l.date_start DESC, l.id DESC
    `);
    res.json({ totalProgramHours: totalHoursRes[0].total_program_hours || 0, roster, overview, recentLogs });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
