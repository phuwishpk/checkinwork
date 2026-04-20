const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
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
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 1000 * 60 * 60 * 24
  }
}));

// Import routes
const authRoutes = require('./src/routes/auth');
const attendanceRoutes = require('./src/routes/attendance');
const logRoutes = require('./src/routes/logs');
const dashboardRoutes = require('./src/routes/dashboard');

// Use routes
app.use('/api', authRoutes);
app.use('/api', attendanceRoutes);
app.use('/api', logRoutes);
app.use('/api', dashboardRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Get Intern Dashboard Data
app.get('/api/intern/dashboard', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const [attendance] = await db.execute('SELECT * FROM attendance WHERE user_id = ? ORDER BY date DESC LIMIT 7', [userId]);
    const [logs] = await db.execute('SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date DESC LIMIT 5', [userId]);
    
    // Total hours
    const [totalHoursRes] = await db.execute('SELECT SUM(total_hours) as total_hours FROM attendance WHERE user_id = ?', [userId]);
    
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
app.get('/api/manager/dashboard', requireAdmin, async (req, res) => {
  try {
    // Total program hours
    const [totalHoursRes] = await db.execute('SELECT SUM(total_hours) as total_program_hours FROM attendance');
    
    // Live roster (Check if there is a clock in without clock out today)
    const today = new Date().toISOString().slice(0, 10);
    const [roster] = await db.execute(`
      SELECT u.id, u.full_name, u.username,
        CASE WHEN a.clock_in_time IS NOT NULL AND a.clock_out_time IS NULL THEN 'online' ELSE 'offline' END as status
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id AND a.date = ?
      WHERE u.role = 'intern'
    `, [today]);

    // Monthly overview
    const [overview] = await db.execute(`
      SELECT u.full_name, u.role, 
             IFNULL(SUM(a.total_hours), 0) as total_hours,
             COUNT(a.id) as days_present
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id
      WHERE u.role = 'intern'
      GROUP BY u.id
    `);

    // Recent logs
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
