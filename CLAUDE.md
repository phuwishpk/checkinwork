# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install        # or: make install

# Run locally (no Docker)
npm start          # production mode (node server.js)

# Run with Docker
make dev           # development at http://localhost:3000
make prod          # production build
make dev-with-tools  # includes Adminer DB UI at http://localhost:8080

# Docker management
make down          # stop containers
make logs          # tail logs (make logs SERVICE=app for specific service)
make clean         # remove containers and volumes
make rebuild       # rebuild images without cache
```

There is no test runner or linter configured in this project.

## Architecture

This is a **monolithic Express.js app** with a vanilla JS frontend. Everything runs from `server.js` — there are no separate route files imported from `src/routes/`; all API logic lives inline in `server.js`.

### Backend (`server.js`)

Single-file Express server that handles:
- Session-based auth (express-session) with two middleware guards: `requireAuth` and `requireAdmin`
- All REST API routes under `/api/`
- Serves static files from `public/`

**Auth is hardcoded** — users are defined as a plain object in the `/api/login` handler (not from the database). The database `users` table exists only for JOIN queries in the manager dashboard.

**OT calculation logic** in `/api/clock-out`: normal hours are capped at 8/day and cut off at 17:00; everything after 17:00 or on weekends is counted as `ot_hours`.

### Database (`src/config/database.js`)

SQLite (not MariaDB despite `sql/init.sql` and Makefile references). The `database.js` module wraps SQLite to mimic the `mysql2` promise API — `db.execute(query, params)` always returns `[rows]`, so all call sites destructure as `const [rows] = await db.execute(...)`.

Schema migrations run inline at startup via try/catch `ALTER TABLE` statements.

Tables: `users`, `attendance`, `daily_logs`

### Frontend (`public/`)

Plain HTML pages with no build step. Each page includes `public/js/app.js` which provides:
- `apiCall()` — fetch wrapper
- `protectRoute()` — checks `/api/session` and redirects based on role

Pages and their roles:
| File | Role |
|------|------|
| `index.html` | Login (unauthenticated) |
| `intern-dashboard.html` | Intern home |
| `daily-log.html` | Intern task log CRUD |
| `attendance.html` | Intern attendance history |
| `manager-dashboard.html` | Admin overview |
| `manager-loge.html` | Admin log approval |
| `manager-attendance.html` | Admin attendance view |

### Key Design Decisions

- The `sql/init.sql` file and MariaDB-related Makefile targets are **legacy** — the app now uses SQLite only. The `sql/` directory schema is not applied at runtime.
- Hardcoded intern usernames (`krittinai`, `nawapon`, `phuwish`) appear in multiple SQL queries in `server.js` — they are not dynamically resolved from the `users` table.
- `daily_logs.status` uses the string values `'Plan'`, `'approved'`, `'rejected'` (not an ENUM); the frontend and init.sql use different value sets.
