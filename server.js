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
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Could not log out' });
    res.clearCookie('connect.sid');
    res.json({ message: 'Logout successful' });
  });
});

// Get Session
app.get('/api/session', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'No active session' });
  }
});

// Clock In
app.post('/api/clock-in', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 8);
  try {
    const [active] = await db.execute('SELECT * FROM attendance WHERE user_id = ? AND clock_out_time IS NULL', [userId]);
    if (active.length > 0) return res.status(400).json({ error: 'You are already clocked in' });
    await db.execute('INSERT INTO attendance (user_id, date, clock_in_time) VALUES (?, ?, ?)', [userId, today, nowTime]);
    res.json({ message: 'Clocked in successfully', time: nowTime });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clock Out
app.post('/api/clock-out', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 8);
  try {
    const [active] = await db.execute('SELECT * FROM attendance WHERE user_id = ? AND clock_out_time IS NULL ORDER BY id DESC LIMIT 1', [userId]);
    if (active.length === 0) return res.status(400).json({ error: 'No active clock-in record found' });
    
    // Calculate duration for this session
    const clockIn = active[0].clock_in_time;
    const dateStr = active[0].date; // YYYY-MM-DD
    const timeIn = new Date(`1970-01-01T${clockIn}Z`);
    const timeOut = new Date(`1970-01-01T${nowTime}Z`);
    let diff = (timeOut - timeIn) / (1000 * 60 * 60);
    if (diff < 0) diff += 24;

    const dayOfWeek = new Date(dateStr).getDay(); // 0 = Sun, 6 = Sat
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

    // Calculate how much is after 17:00
    const limit17 = new Date(`1970-01-01T17:00:00Z`);
    let normalDiff = diff;
    let otDiff = 0;

    if (isWeekend) {
      // All weekend work is OT
      normalDiff = 0;
      otDiff = diff;
    } else {
      // Split based on 5 PM limit
      if (timeIn < limit17) {
        if (timeOut > limit17) {
          normalDiff = (limit17 - timeIn) / (1000 * 60 * 60);
          otDiff = (timeOut - limit17) / (1000 * 60 * 60);
        } else {
          normalDiff = diff;
          otDiff = 0;
        }
      } else {
        // Started after 5 PM
        normalDiff = 0;
        otDiff = diff;
      }

      // Also cap normal hours at 8 per day total
      const [todayTotal] = await db.execute(
        'SELECT SUM(total_hours) as total FROM attendance WHERE user_id = ? AND date = ? AND id != ?',
        [userId, dateStr, active[0].id]
      );
      const hoursAlreadyLogged = todayTotal[0].total || 0;
      const remainingNormalCap = Math.max(0, 8 - hoursAlreadyLogged);
      
      const cappedNormal = Math.min(normalDiff, remainingNormalCap);
      const excessFromCap = normalDiff - cappedNormal;
      
      normalDiff = cappedNormal;
      otDiff += excessFromCap;
    }

    await db.execute(
      'UPDATE attendance SET clock_out_time = ?, total_hours = ?, ot_hours = ? WHERE id = ?',
      [nowTime, normalDiff.toFixed(2), otDiff.toFixed(2), active[0].id]
    );
    res.json({ message: 'Clocked out successfully', time: nowTime, hours: normalDiff.toFixed(2), ot: otDiff.toFixed(2) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Intern Logs CRUD
app.get('/api/intern/logs', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [logs] = await db.execute('SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date_start DESC, id DESC', [userId]);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
    res.status(500).json({ error: 'Internal server error' });
  }
});

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

// Intern Dash & Calendar
app.get('/api/intern/dashboard', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [attendance] = await db.execute('SELECT * FROM attendance WHERE user_id = ? ORDER BY date DESC, id DESC', [userId]);
    const [logs] = await db.execute('SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date DESC', [userId]);
    const [totalHoursRes] = await db.execute('SELECT SUM(total_hours) as total_hours, SUM(ot_hours) as total_ot_hours FROM attendance WHERE user_id = ?', [userId]);
    res.json({ attendance, logs, totalHours: totalHoursRes[0].total_hours || 0, totalOtHours: totalHoursRes[0].total_ot_hours || 0 });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/intern/calendar', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [attendance] = await db.execute('SELECT * FROM attendance WHERE user_id = ? ORDER BY date ASC', [userId]);
    const [logs] = await db.execute('SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date_start ASC', [userId]);
    res.json({ attendance, logs });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manager Endpoints
app.get('/api/manager/dashboard', requireAdmin, async (req, res) => {
  try {
    // 1. Total Program Hours (Sum of all attendance total_hours)
    const [totalHoursRes] = await db.execute('SELECT SUM(total_hours) as total_program_hours FROM attendance');
    
    // 2. Roster for specific interns (Krittinai, Nawapon, Phuwish)
    const [roster] = await db.execute(`
      SELECT u.id, u.full_name, u.username,
        (SELECT CASE WHEN COUNT(*) > 0 THEN 'online' ELSE 'offline' END 
         FROM attendance a 
         WHERE a.user_id = u.id AND a.clock_out_time IS NULL) as status
      FROM users u
      WHERE u.username IN ('krittinai', 'nawapon', 'phuwish')
    `);

    // 3. Activity Feed (Unified view of Clock-ins, Clock-outs, and Tasks)
    const [attendanceLogs] = await db.execute(`
      SELECT 'attendance' as type, u.full_name, a.date, a.clock_in_time as time_in, a.clock_out_time as time_out, 
             a.total_hours, a.ot_hours, a.id as record_id
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE u.username IN ('krittinai', 'nawapon', 'phuwish')
      ORDER BY a.id DESC LIMIT 10
    `);

    const [dailyTasks] = await db.execute(`
      SELECT 'task' as type, u.full_name, l.date_start as date, l.task_category, l.description, l.status, l.id as record_id
      FROM daily_logs l
      JOIN users u ON l.user_id = u.id
      WHERE u.username IN ('krittinai', 'nawapon', 'phuwish')
      ORDER BY l.id DESC LIMIT 15
    `);

    // Combine and sort by date/ID if needed, but for now we'll send them separately for specialized UI components
    res.json({ 
      totalProgramHours: totalHoursRes[0].total_program_hours || 0, 
      roster, 
      recentAttendance: attendanceLogs,
      recentTasks: dailyTasks
    });
  } catch (error) {
    console.error('Manager dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/manager/calendar-data', requireAdmin, async (req, res) => {
  try {
    const [users] = await db.execute("SELECT id, full_name, username FROM users WHERE role = 'intern' AND username NOT IN ('intern', 'sarah')");
    const [attendance] = await db.execute(`
      SELECT a.*, u.full_name, u.username 
      FROM attendance a 
      JOIN users u ON a.user_id = u.id 
      WHERE u.role = 'intern' AND u.username NOT IN ('intern', 'sarah')
      ORDER BY a.date ASC, a.clock_in_time ASC
    `);
    const [logs] = await db.execute(`
      SELECT dl.*, u.full_name, u.username 
      FROM daily_logs dl 
      JOIN users u ON dl.user_id = u.id 
      WHERE u.role = 'intern' AND u.username NOT IN ('intern', 'sarah')
      ORDER BY dl.date_start ASC, dl.id ASC
    `);
    res.json({ users, attendance, logs });
  } catch (error) {
    console.error('Manager calendar data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/logs/all', requireAdmin, async (req, res) => {
  try {
    const [logs] = await db.execute(`
      SELECT dl.*, u.full_name, u.username FROM daily_logs dl
      JOIN users u ON dl.user_id = u.id
      ORDER BY dl.date DESC, dl.id DESC
    `);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/logs/:id/approve', requireAdmin, async (req, res) => {
  try {
    await db.execute('UPDATE daily_logs SET status = ? WHERE id = ?', ['approved', req.params.id]);
    res.json({ message: 'Log approved successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/logs/:id/reject', requireAdmin, async (req, res) => {
  try {
    await db.execute('UPDATE daily_logs SET status = ? WHERE id = ?', ['rejected', req.params.id]);
    res.json({ message: 'Log rejected successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Final Handlers
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
