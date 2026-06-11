const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Plesk/nginx reverse proxy so secure cookies work over HTTPS
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const sessionSecret = process.env.SESSION_SECRET || 'fallback-change-in-production';

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
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
  if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'superadmin')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Forbidden: Super Admin only' });
  }
  next();
};

// --- API Routes ---

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const [rows] = await db.execute(
      'SELECT id, username, password, role, full_name FROM users WHERE username = ?',
      [username]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    req.session.user = { id: user.id, username: user.username, role: user.role, full_name: user.full_name };
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      res.json({ message: 'Login successful', user: req.session.user });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Could not log out' });
    res.clearCookie('connect.sid');
    res.json({ message: 'Logout successful' });
  });
});

app.get('/api/session', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'No active session' });
  }
});

// Clock In/Out
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

app.post('/api/clock-out', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 8);
  try {
    const [active] = await db.execute('SELECT * FROM attendance WHERE user_id = ? AND clock_out_time IS NULL ORDER BY id DESC LIMIT 1', [userId]);
    if (active.length === 0) return res.status(400).json({ error: 'No active clock-in record found' });

    const clockIn = active[0].clock_in_time;
    const dateStr = active[0].date;
    const timeIn = new Date(`1970-01-01T${clockIn}Z`);
    const timeOut = new Date(`1970-01-01T${nowTime}Z`);
    let diff = (timeOut - timeIn) / (1000 * 60 * 60);
    if (diff < 0) diff += 24;

    const dayOfWeek = new Date(dateStr).getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const limit17 = new Date(`1970-01-01T17:00:00Z`);
    let normalDiff = diff;
    let otDiff = 0;

    if (isWeekend) {
      normalDiff = 0;
      otDiff = diff;
    } else {
      if (timeIn < limit17) {
        if (timeOut > limit17) {
          normalDiff = (limit17 - timeIn) / (1000 * 60 * 60);
          otDiff = (timeOut - limit17) / (1000 * 60 * 60);
        } else {
          normalDiff = diff;
          otDiff = 0;
        }
      } else {
        normalDiff = 0;
        otDiff = diff;
      }
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
    console.error('Clock-out error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Intern Logs CRUD
app.get('/api/intern/logs', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [logs] = await db.execute('SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date_start DESC, id DESC', [userId]);
    res.json({ logs });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

app.post('/api/intern/log', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { date_start, date_finish, task_category, description, status, color } = req.body;
  try {
    await db.execute(
      'INSERT INTO daily_logs (user_id, date, date_start, date_finish, task_category, description, status, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, date_start || new Date().toISOString().slice(0, 10), date_start, date_finish, task_category, description, status || 'Plan', color || '#3e76fe']
    );
    res.json({ message: 'Log created successfully' });
  } catch (error) {
    console.error('Create log error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

app.put('/api/intern/log/:id', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const logId = req.params.id;
  const { date_start, date_finish, task_category, description, status } = req.body;
  try {
    await db.execute(
      'UPDATE daily_logs SET date_start = ?, date_finish = ?, task_category = ?, description = ?, status = ? WHERE id = ? AND user_id = ?',
      [date_start, date_finish, task_category, description, status, logId, userId]
    );
    res.json({ message: 'Log updated successfully' });
  } catch (error) {
    console.error('Update log error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

app.delete('/api/intern/log/:id', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const logId = req.params.id;
  try {
    await db.execute('DELETE FROM daily_logs WHERE id = ? AND user_id = ?', [logId, userId]);
    res.json({ message: 'Log deleted successfully' });
  } catch (error) {
    console.error('Delete log error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Dashboards Data
app.get('/api/intern/dashboard', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [attendance] = await db.execute('SELECT * FROM attendance WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 20', [userId]);
    const [logs] = await db.execute('SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date_start DESC LIMIT 5', [userId]);
    const [totalHoursRes] = await db.execute('SELECT SUM(total_hours) as total_hours, SUM(ot_hours) as total_ot_hours FROM attendance WHERE user_id = ?', [userId]);
    res.json({
      attendance,
      logs,
      totalHours: totalHoursRes[0].total_hours || 0,
      totalOtHours: totalHoursRes[0].total_ot_hours || 0
    });
  } catch (error) {
    console.error('Intern dashboard error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get Intern Calendar data (Unified for specific users)
app.get('/api/intern/calendar', requireAuth, async (req, res) => {
  try {
    const [users] = await db.execute(`SELECT id, full_name, username, role FROM users`);
    const userIds = users.map(u => u.id);
    if (userIds.length === 0) return res.json({ attendance: [], logs: [], users: [] });
    const placeholders = userIds.map(() => '?').join(',');
    const [attendance] = await db.execute(`SELECT * FROM attendance WHERE user_id IN (${placeholders}) ORDER BY date ASC`, userIds);
    const [logs] = await db.execute(`SELECT * FROM daily_logs WHERE user_id IN (${placeholders}) ORDER BY date_start ASC`, userIds);
    res.json({ attendance, logs, users });
  } catch (error) {
    console.error('Intern calendar error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

app.get('/api/manager/dashboard', requireAdmin, async (req, res) => {
  try {
    const [totalHoursRes] = await db.execute('SELECT SUM(total_hours) as total_program_hours FROM attendance');
    const [roster] = await db.execute(`
      SELECT u.id, u.full_name, u.username,
        (SELECT CASE WHEN COUNT(*) > 0 THEN 'online' ELSE 'offline' END
         FROM attendance a
         WHERE a.user_id = u.id AND a.clock_out_time IS NULL) as status,
        (SELECT a.id FROM attendance a WHERE a.user_id = u.id AND a.clock_out_time IS NULL ORDER BY a.id DESC LIMIT 1) as active_att_id
      FROM users u
    `);
    const [attendanceLogs] = await db.execute(`
      SELECT 'attendance' as type, u.full_name, a.date, a.clock_in_time as time_in, a.clock_out_time as time_out,
             a.total_hours, a.ot_hours, a.id as record_id
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.id DESC LIMIT 10
    `);
    const [dailyTasks] = await db.execute(`
      SELECT 'task' as type, u.full_name, l.date_start as date, l.task_category, l.description, l.status, l.id as record_id
      FROM daily_logs l
      JOIN users u ON l.user_id = u.id
      ORDER BY l.id DESC LIMIT 15
    `);
    res.json({
      totalProgramHours: totalHoursRes[0].total_program_hours || 0,
      roster,
      recentAttendance: attendanceLogs,
      recentTasks: dailyTasks
    });
  } catch (error) {
    console.error('Manager dashboard error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

app.post('/api/manager/attendance/manual', requireSuperAdmin, async (req, res) => {
  const { user_id, date, clock_in_time, clock_out_time, task_category, task_description } = req.body;
  if (!user_id || !date || !clock_in_time || !clock_out_time) {
    return res.status(400).json({ error: 'All attendance fields are required' });
  }
  try {
    const timeIn = new Date(`1970-01-01T${clock_in_time}Z`);
    const timeOut = new Date(`1970-01-01T${clock_out_time}Z`);
    let diff = (timeOut - timeIn) / (1000 * 60 * 60);
    if (diff < 0) diff += 24;

    const dayOfWeek = new Date(date).getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const limit17 = new Date(`1970-01-01T17:00:00Z`);
    let normalDiff = diff;
    let otDiff = 0;

    if (isWeekend) {
      normalDiff = 0;
      otDiff = diff;
    } else {
      if (timeIn < limit17) {
        if (timeOut > limit17) {
          normalDiff = (limit17 - timeIn) / (1000 * 60 * 60);
          otDiff = (timeOut - limit17) / (1000 * 60 * 60);
        } else {
          normalDiff = diff;
          otDiff = 0;
        }
      } else {
        normalDiff = 0;
        otDiff = diff;
      }
      const [todayTotal] = await db.execute(
        'SELECT SUM(total_hours) as total FROM attendance WHERE user_id = ? AND date = ?',
        [user_id, date]
      );
      const hoursAlreadyLogged = todayTotal[0].total || 0;
      const remainingNormalCap = Math.max(0, 8 - hoursAlreadyLogged);
      const cappedNormal = Math.min(normalDiff, remainingNormalCap);
      const excessFromCap = normalDiff - cappedNormal;
      normalDiff = cappedNormal;
      otDiff += excessFromCap;
    }

    let logId = null;
    if (task_category) {
      const colorMap = {
        'Backend': '#8b5cf6', 'Frontend': '#3e76fe', 'Database': '#f59e0b', 'Bug Fix': '#ef4444',
        'Plan': '#94a3b8', 'To Do': '#94a3b8', 'In Progress': '#10b981', 'Done': '#10b981'
      };
      const catColor = req.body.color || colorMap[task_category] || '#3e76fe';
      const [logResult] = await db.execute(
        'INSERT INTO daily_logs (user_id, date, date_start, date_finish, task_category, description, status, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [user_id, date, date, date, task_category, task_description, 'Done', catColor]
      );
      logId = logResult.insertId;
    }

    const [result] = await db.execute(
      'INSERT INTO attendance (user_id, date, clock_in_time, clock_out_time, total_hours, ot_hours, log_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user_id, date, clock_in_time, clock_out_time, normalDiff.toFixed(2), otDiff.toFixed(2), logId]
    );

    res.json({ message: 'Manual attendance and task recorded successfully', id: result.insertId });
  } catch (error) {
    console.error('Manual attendance error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

app.put('/api/manager/attendance/manual/:id', requireSuperAdmin, async (req, res) => {
  const { user_id, date, clock_in_time, clock_out_time, task_category, task_description } = req.body;
  const { id } = req.params;
  try {
    const timeIn = new Date(`1970-01-01T${clock_in_time}Z`);
    const timeOut = new Date(`1970-01-01T${clock_out_time}Z`);
    let diff = (timeOut - timeIn) / (1000 * 60 * 60);
    if (diff < 0) diff += 24;

    const dayOfWeek = new Date(date).getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const limit17 = new Date(`1970-01-01T17:00:00Z`);
    let normalDiff = diff;
    let otDiff = 0;

    if (isWeekend) {
      normalDiff = 0;
      otDiff = diff;
    } else {
      if (timeIn < limit17) {
        if (timeOut > limit17) {
          normalDiff = (limit17 - timeIn) / (1000 * 60 * 60);
          otDiff = (timeOut - limit17) / (1000 * 60 * 60);
        } else {
          normalDiff = diff;
          otDiff = 0;
        }
      } else {
        normalDiff = 0;
        otDiff = diff;
      }
      const [todayTotal] = await db.execute(
        'SELECT SUM(total_hours) as total FROM attendance WHERE user_id = ? AND date = ? AND id != ?',
        [user_id, date, id]
      );
      const hoursAlreadyLogged = todayTotal[0].total || 0;
      const remainingNormalCap = Math.max(0, 8 - hoursAlreadyLogged);
      const cappedNormal = Math.min(normalDiff, remainingNormalCap);
      const excessFromCap = normalDiff - cappedNormal;
      normalDiff = cappedNormal;
      otDiff += excessFromCap;
    }

    // Get current log_id
    const [current] = await db.execute('SELECT log_id FROM attendance WHERE id = ?', [id]);
    const existingLogId = current[0]?.log_id;

    if (task_category) {
      const colorMap = {
        'Backend': '#8b5cf6', 'Frontend': '#3e76fe', 'Database': '#f59e0b', 'Bug Fix': '#ef4444',
        'Plan': '#94a3b8', 'To Do': '#94a3b8', 'In Progress': '#10b981', 'Done': '#10b981'
      };
      const catColor = req.body.color || colorMap[task_category] || '#3e76fe';
      
      if (existingLogId) {
        await db.execute(
          'UPDATE daily_logs SET task_category = ?, description = ?, date = ?, date_start = ?, date_finish = ?, color = ? WHERE id = ?',
          [task_category, task_description, date, date, date, catColor, existingLogId]
        );
      } else {
        const [newLog] = await db.execute(
          'INSERT INTO daily_logs (user_id, date, date_start, date_finish, task_category, description, status, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [user_id, date, date, date, task_category, task_description, 'Done', catColor]
        );
        await db.execute('UPDATE attendance SET log_id = ? WHERE id = ?', [newLog.insertId, id]);
      }
    }

    await db.execute(
      'UPDATE attendance SET user_id = ?, date = ?, clock_in_time = ?, clock_out_time = ?, total_hours = ?, ot_hours = ? WHERE id = ?',
      [user_id, date, clock_in_time, clock_out_time, normalDiff.toFixed(2), otDiff.toFixed(2), id]
    );
    res.json({ message: 'Attendance and task updated successfully' });
  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

app.delete('/api/manager/attendance/manual/:id', requireSuperAdmin, async (req, res) => {
  try {
    await db.execute('DELETE FROM attendance WHERE id = ?', [req.params.id]);
    res.json({ message: 'Attendance record deleted successfully' });
  } catch (error) {
    console.error('Delete attendance error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Force clock-out (superadmin only) — closes active session without counting hours
app.post('/api/manager/force-clockout/:userId', requireSuperAdmin, async (req, res) => {
  const { userId } = req.params;
  try {
    const [active] = await db.execute(
      'SELECT id FROM attendance WHERE user_id = ? AND clock_out_time IS NULL ORDER BY id DESC LIMIT 1',
      [userId]
    );
    if (active.length === 0) {
      return res.status(400).json({ error: 'No active clock-in record found for this user' });
    }
    const nowTime = new Date().toTimeString().slice(0, 8);
    await db.execute(
      'UPDATE attendance SET clock_out_time = ?, total_hours = 0, ot_hours = 0 WHERE id = ?',
      [nowTime, active[0].id]
    );
    res.json({ message: 'Force clock-out successful' });
  } catch (error) {
    console.error('Force clockout error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

app.get('/api/manager/calendar-data', requireAdmin, async (req, res) => {
  try {
    const [users] = await db.execute("SELECT id, full_name, username, role FROM users");
    const [attendance] = await db.execute(`
      SELECT a.*, u.full_name, u.username, dl.task_category, dl.description as task_description, dl.color as task_color
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN daily_logs dl ON a.log_id = dl.id
      ORDER BY a.date ASC, a.clock_in_time ASC
    `);
    const [logs] = await db.execute(`
      SELECT dl.*, u.full_name, u.username
      FROM daily_logs dl
      JOIN users u ON dl.user_id = u.id
      ORDER BY dl.date_start ASC, dl.id ASC
    `);
    res.json({ users, attendance, logs });
  } catch (error) {
    console.error('Manager calendar data error:', error);
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// Monthly summary — pulls attendance + tasks directly from DB for a given month
app.get('/api/manager/monthly-summary', requireAdmin, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
    const userId = req.query.user_id || 'all';

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

    // Get all users
    const [users] = await db.execute("SELECT id, full_name, username, role FROM users");

    // Get attendance for the month
    let attQuery = `
      SELECT a.id, a.user_id, a.date, a.clock_in_time, a.clock_out_time,
             a.total_hours, a.ot_hours, u.full_name, u.role
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.date >= ? AND a.date <= ?
    `;
    const attParams = [startDate, endDate];
    if (userId !== 'all') {
      attQuery += ' AND a.user_id = ?';
      attParams.push(parseInt(userId));
    }
    attQuery += ' ORDER BY a.date ASC, u.full_name ASC, a.clock_in_time ASC';
    const [attendance] = await db.execute(attQuery, attParams);

    // Get daily logs (tasks) for the month — includes tasks that span into this month
    let logQuery = `
      SELECT dl.id, dl.user_id, dl.date_start, dl.date_finish, dl.task_category,
             dl.description, dl.color, dl.status, u.full_name, u.role
      FROM daily_logs dl
      JOIN users u ON dl.user_id = u.id
      WHERE dl.date_start <= ? AND (dl.date_finish >= ? OR dl.date_finish IS NULL AND dl.date_start >= ?)
    `;
    const logParams = [endDate, startDate, startDate];
    if (userId !== 'all') {
      logQuery += ' AND dl.user_id = ?';
      logParams.push(parseInt(userId));
    }
    logQuery += ' ORDER BY dl.date_start ASC, u.full_name ASC';
    const [logs] = await db.execute(logQuery, logParams);

    // Build per-day summary rows
    const daysInMonth = new Date(year, month, 0).getDate();
    const rows = [];
    const targetUsers = userId !== 'all'
      ? users.filter(u => u.id === parseInt(userId))
      : users;

    let totalWorkingDays = 0;
    let totalHoursSum = 0;
    let totalOtHoursSum = 0;
    let totalTaskCount = 0;
    const workingDaysSet = new Set();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      targetUsers.forEach(u => {
        const dayAtts = attendance.filter(a => {
          const aDate = a.date instanceof Date
            ? `${a.date.getFullYear()}-${String(a.date.getMonth()+1).padStart(2,'0')}-${String(a.date.getDate()).padStart(2,'0')}`
            : String(a.date).slice(0, 10);
          return a.user_id === u.id && aDate === dateStr;
        });
        const dayLogs = logs.filter(l => {
          const lStart = l.date_start instanceof Date
            ? `${l.date_start.getFullYear()}-${String(l.date_start.getMonth()+1).padStart(2,'0')}-${String(l.date_start.getDate()).padStart(2,'0')}`
            : String(l.date_start).slice(0, 10);
          const lEnd = l.date_finish
            ? (l.date_finish instanceof Date
              ? `${l.date_finish.getFullYear()}-${String(l.date_finish.getMonth()+1).padStart(2,'0')}-${String(l.date_finish.getDate()).padStart(2,'0')}`
              : String(l.date_finish).slice(0, 10))
            : lStart;
          return l.user_id === u.id && dateStr >= lStart && dateStr <= lEnd;
        });

        if (dayAtts.length === 0 && dayLogs.length === 0) return;

        workingDaysSet.add(`${u.id}_${dateStr}`);
        const dayHours = dayAtts.reduce((sum, a) => sum + parseFloat(a.total_hours || 0), 0);
        const dayOtHours = dayAtts.reduce((sum, a) => sum + parseFloat(a.ot_hours || 0), 0);
        totalHoursSum += dayHours;
        totalOtHoursSum += dayOtHours;
        totalTaskCount += dayLogs.length;

        rows.push({
          date: dateStr,
          user_id: u.id,
          full_name: u.full_name,
          role: u.role,
          clock_in: dayAtts.map(a => a.clock_in_time ? String(a.clock_in_time).slice(0, 5) : null).filter(Boolean),
          clock_out: dayAtts.map(a => a.clock_out_time ? String(a.clock_out_time).slice(0, 5) : null).filter(Boolean),
          total_hours: parseFloat(dayHours.toFixed(2)),
          ot_hours: parseFloat(dayOtHours.toFixed(2)),
          tasks: dayLogs.map(l => ({
            category: l.task_category,
            color: l.color,
            description: l.description
          }))
        });
      });
    }

    totalWorkingDays = workingDaysSet.size;

    res.json({
      month: month,
      year: year,
      rows,
      stats: {
        working_days: totalWorkingDays,
        total_hours: parseFloat(totalHoursSum.toFixed(2)),
        total_ot_hours: parseFloat(totalOtHoursSum.toFixed(2)),
        avg_hours_per_day: totalWorkingDays > 0 ? parseFloat((totalHoursSum / totalWorkingDays).toFixed(1)) : 0,
        total_tasks: totalTaskCount
      }
    });
  } catch (error) {
    console.error('Monthly summary error:', error);
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// Review/Attendance endpoints for manager
app.get('/api/manager/attendance', requireAdmin, async (req, res) => {
  try {
    const [attendance] = await db.execute(`
      SELECT a.*, u.full_name, u.username
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.date DESC, a.clock_in_time DESC
    `);
    res.json({ attendance });
  } catch (error) {
    console.error('Manager attendance list error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
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
    console.error('Get all logs error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

app.post('/api/logs/:id/approve', requireAdmin, async (req, res) => {
  try {
    await db.execute('UPDATE daily_logs SET status = ? WHERE id = ?', ['Done', req.params.id]);
    res.json({ message: 'Log marked as Done successfully' });
  } catch (error) {
    console.error('Approve log error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

app.post('/api/logs/:id/reject', requireAdmin, async (req, res) => {
  try {
    await db.execute('UPDATE daily_logs SET status = ? WHERE id = ?', ['Plan', req.params.id]);
    res.json({ message: 'Log reset to Plan successfully' });
  } catch (error) {
    console.error('Reject log error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Clean URL routes
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public/intern-dashboard.html')));
app.get('/daily-log', (req, res) => res.sendFile(path.join(__dirname, 'public/daily-log.html')));
app.get('/attendance', (req, res) => res.sendFile(path.join(__dirname, 'public/attendance.html')));
app.get('/manager', (req, res) => res.sendFile(path.join(__dirname, 'public/manager-dashboard.html')));
app.get('/manager/logs', (req, res) => res.sendFile(path.join(__dirname, 'public/manager-loge.html')));
app.get('/manager/attendance', (req, res) => res.sendFile(path.join(__dirname, 'public/manager-attendance.html')));
app.get('/manager/summary', (req, res) => res.sendFile(path.join(__dirname, 'public/manager-summary.html')));

// Health check — also shows env config (no secrets)
app.get('/health', async (req, res) => {
  let dbOk = false;
  let dbError = null;
  try {
    await db.execute('SELECT 1');
    dbOk = true;
  } catch (error) {
    dbError = error.message;
  }
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    db: dbOk ? 'connected' : dbError,
    env: {
      DB_HOST: process.env.DB_HOST || '(not set)',
      DB_PORT: process.env.DB_PORT || '(not set)',
      DB_USER: process.env.DB_USER ? '(set)' : '(NOT SET)',
      DB_PASSWORD: process.env.DB_PASSWORD ? '(set)' : '(NOT SET)',
      DB_NAME: process.env.DB_NAME || '(not set)',
      SESSION_SECRET: process.env.SESSION_SECRET ? '(set)' : '(NOT SET)',
      NODE_ENV: process.env.NODE_ENV || '(not set)',
    }
  });
});

// Final Handlers
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

async function runMigrations() {
  const migrations = [
    "ALTER TABLE attendance ADD COLUMN log_id INT",
    "ALTER TABLE daily_logs ADD COLUMN color VARCHAR(20) NOT NULL DEFAULT '#3e76fe'",
    "ALTER TABLE daily_logs ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  ];
  for (const sql of migrations) {
    try { await db.execute(sql); } catch (e) { /* column already exists */ }
  }
}

runMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
