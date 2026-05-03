# Check-in Work System

ระบบบันทึกเวลาปฏิบัติงานและรายงานผลงานประจำวันสำหรับฝึกงาน

## สารบัญ

- [โครงสร้างโปรเจ็ค](#โครงสร้างโปรเจ็ค)
- [การติดตั้ง](#การติดตั้ง)
- [การใช้งาน](#การใช้งาน)
- [สคริปต์](#สคริปต์)
- [การพัฒนา](#การพัฒนา)
- [สำหรับทีม](#สำหรับทีม)

## โครงสร้างโปรเจ็ค

```
checkinwork/
├── docker/                 # Docker configurations
│   ├── Dockerfile          # Production Dockerfile
│   └── Dockerfile.dev      # Development Dockerfile
├── public/                 # Static frontend files
│   ├── index.html
│   ├── intern-dashboard.html
│   ├── manager-dashboard.html
│   ├── daily-log.html
│   └── js/
├── sql/                    # Database scripts
│   └── init.sql           # Initial database schema
├── src/                    # Backend source code
│   ├── config/
│   │   └── database.js
│   ├── middleware/
│   │   └── auth.js
│   └── routes/
│       ├── auth.js
│       ├── attendance.js
│       ├── dashboard.js
│       └── logs.js
├── docker-compose.yml      # Development compose
├── docker-compose.prod.yml # Production compose
├── .env                    # Environment variables (development)
├── .env.example           # Example environment variables
└── package.json
```

## การติดตั้ง

### ข้อกำหนดเบื้องต้น

- Docker & Docker Compose
- Node.js 20+ (สำหรับ local development)

### 1. Clone และเตรียม Environment

```bash
# Clone repository
git clone <repo-url>
cd checkinwork

# Copy environment file
cp .env.example .env

# แก้ไข .env ตามความต้องการ
```

### 2. รันด้วย Docker (แนะนำ)

```bash
# Development mode
docker-compose up -d

# Production mode
docker-compose -f docker-compose.prod.yml up -d
```

### 3. รันแบบ Local Development

```bash
# ติดตั้ง dependencies
npm install

# รัน development server
npm run dev

# หรือ production
npm start
```

## การใช้งาน

### Default Users (จาก init.sql)

| Username   | Password | Role       |
|------------|----------|------------|
| superadmin | 12345    | superadmin |
| admin      | 12345    | admin      |
| krittinai  | 12345    | intern     |
| nawapon    | 12345    | intern     |
| phuwish    | 12345    | intern     |

### API Endpoints

#### Authentication
- `POST /api/login` - Login
- `POST /api/logout` - Logout
- `GET /api/session` - Get current session

#### Attendance
- `POST /api/clock-in` - Clock in (requires auth)
- `POST /api/clock-out` - Clock out (requires auth)

#### Daily Logs
- `POST /api/intern/log` - Submit daily log (requires auth)

#### Dashboards
- `GET /api/intern/dashboard` - Intern dashboard data (requires auth)
- `GET /api/manager/dashboard` - Manager dashboard data (requires admin)

### Tools

```bash
# Run with Adminer (Database Management UI)
docker-compose --profile tools up -d

# Access Adminer at http://localhost:8080
```

## สคริปต์

```bash
npm start        # รัน production server
npm run dev      # รัน development server (nodemon)
npm test         # รัน tests
```

## การพัฒนา

### การเพิ่ม Environment Variables

1. เพิ่ม variable ใน `.env`
2. อัพเดท `docker-compose.yml` ถ้าต้องการให้ container อ่านได้
3. อัพเดท `.env.example` พร้อม comment อธิบาย

### การแก้ไข Database Schema

1. แก้ไขไฟล์ใน `sql/init.sql`
2. Rebuild database volume:

```bash
docker-compose down -v
docker-compose up -d
```

### การเพิ่ม API Route ใหม่

1. สร้างไฟล์ใน `src/routes/`
2. Import และ mount ใน `server.js`

## สำหรับทีม

### Git Workflow

1. สร้าง branch จาก `main`:
   ```bash
   git checkout -b feature/your-feature
   ```

2. Commit ด้วย conventional commits:
   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve issue"
   git commit -m "docs: update documentation"
   ```

3. Push และสร้าง Pull Request

### การ Deploy

**Staging/Production:**
```bash
# SSH to server
ssh user@server

# Pull latest code
git pull origin main

# Copy environment file
cp .env.production.example .env
# แก้ไข .env ด้วย production credentials

# Rebuild and restart
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

### Backup Database

```bash
# Create backup
docker exec checkinwork_mariadb mysqldump -u root -p checkinwork_db > backup_$(date +%Y%m%d).sql

# Restore from backup
docker exec -i checkinwork_mariadb mysql -u root -p checkinwork_db < backup_20240101.sql
```

### Security Notes

- **เปลี่ยน password ทั้งหมด**ก่อน deploy production
- ใช้ `SESSION_SECRET` ที่ยาวและสุ่ม
- เปิด HTTPS ใน production
- อัพเดท `.env` บน server เท่านั้น อย่า commit

## License

MIT
