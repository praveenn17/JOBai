# JobAI — Production Deployment Guide

## What changed in this release (database)

| Area | Before | After |
|---|---|---|
| WAL mode | ✅ enabled | ✅ enabled |
| `busy_timeout` | ❌ missing → "database is locked" crashes | ✅ 5 000 ms |
| `synchronous` | default (FULL) | ✅ NORMAL — safe in WAL, 3× faster |
| `cache_size` | default (2 MB) | ✅ 64 MB |
| `temp_store` | disk | ✅ MEMORY |
| `mmap_size` | 0 | ✅ 256 MB |
| WAL auto-checkpoint | default 1 000 pages | ✅ explicit — prevents unbounded WAL growth |
| Data dir creation | ❌ crash if missing | ✅ created automatically at startup |
| Graceful shutdown | ❌ none — DB could corrupt on SIGTERM | ✅ SIGTERM/SIGINT flush WAL before exit |
| Health check `/api/health` | HTTP 200, no DB test | ✅ HTTP 200/503, tests read + write lock + integrity |
| Migrations | inline try/catch in `setupDatabase` | ✅ tracked in `schema_migrations` table |
| Automated backup | ❌ none | ✅ nightly hot backup, 7-day retention |
| Maintenance cron | ❌ none | ✅ weekly: prune tokens/logs + WAL checkpoint |
| `password_reset_tokens` table | ❌ missing | ✅ added |

---

## Option A — Docker Compose (recommended)

### 1. Prerequisites
```bash
# On your server (Ubuntu 22+ / Debian 12+)
apt install -y docker.io docker-compose-plugin
```

### 2. Clone / upload the project
```bash
git clone https://github.com/you/jobai.git /var/www/jobai
cd /var/www/jobai
```

### 3. Environment
```bash
cp backend/.env.example .env
nano .env
```

Fill in every value:
```
NODE_ENV=production
JWT_SECRET=<openssl rand -hex 32>
ANTHROPIC_API_KEY=sk-ant-...
DB_PATH=/app/data/jobai.db        # do not change — matches Docker volume
FRONTEND_URL=https://yourdomain.com
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=you@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx    # Gmail App Password
EMAIL_FROM=JobAI <you@gmail.com>
```

### 4. Build the frontend
```bash
cd frontend
npm ci
VITE_API_URL=https://yourdomain.com/api npm run build
cd ..
```

### 5. Start
```bash
docker compose up -d --build
```

On first start the `command:` in `docker-compose.yml` runs:
```
node src/database/setup.js   # creates schema + runs migrations
node src/server.js           # starts the server
```

The frontend container only starts after the backend passes its health check.

### 6. Verify
```bash
docker compose ps
curl https://yourdomain.com/api/health | jq .
```

Expected response:
```json
{
  "status": "healthy",
  "database": {
    "ok": true,
    "tableCount": 21,
    "sizeMB": "0.08",
    "walMode": true
  }
}
```

### 7. Updates / redeployment
```bash
git pull
cd frontend && npm ci && VITE_API_URL=https://yourdomain.com/api npm run build && cd ..
docker compose up -d --build   # zero-downtime: new container starts, old stops
```

---

## Option B — Bare Metal / VPS with PM2

### 1. Install Node 20 + PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx
npm install -g pm2
```

### 2. Project setup
```bash
cd /var/www/jobai/backend
cp .env.example .env && nano .env
# Set DB_PATH to a persistent location:
#   DB_PATH=/var/lib/jobai/jobai.db
mkdir -p /var/lib/jobai /var/lib/jobai/backups /var/log/jobai
npm ci --only=production
```

### 3. Build frontend
```bash
cd /var/www/jobai/frontend
npm ci
VITE_API_URL=https://yourdomain.com/api npm run build
```

### 4. Configure Nginx
```bash
cp /var/www/jobai/nginx.conf /etc/nginx/sites-available/jobai
# Edit server_name in the file:
sed -i 's/yourdomain.com/ACTUAL_DOMAIN/g' /etc/nginx/sites-available/jobai
ln -s /etc/nginx/sites-available/jobai /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 5. SSL (Let's Encrypt)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### 6. Start with PM2
```bash
cd /var/www/jobai
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # follow printed command to enable on reboot
```

### 7. Verify
```bash
pm2 status
curl https://yourdomain.com/api/health | jq .
```

---

## Database scripts (both options)

```bash
# Check DB health and print stats
npm run db:check          # exit 0 = healthy

# Show which migrations have been applied
npm run db:status

# Apply any pending migrations manually
npm run db:migrate

# Create a manual backup right now
npm run db:backup         # writes to DB_DIR/backups/jobai-YYYY-MM-DDThh-mm-ss.db

# Run maintenance (prune stale rows + WAL checkpoint)
npm run db:maintain
```

---

## Automated maintenance schedule (built-in crons)

These run inside the Node process — no external cron daemon needed:

| Schedule | What it does |
|---|---|
| Every 30 min | Process application/email queues |
| Daily 3:00 AM | Hot backup → `data/backups/` (7-day retention) |
| Weekly Sun 4:00 AM | Prune expired tokens, old logs, read notifications + WAL checkpoint |

---

## Volume / backup strategy (Docker)

The SQLite file lives in the `jobai-db` named volume:
```
/var/lib/docker/volumes/jobai_jobai-db/_data/jobai.db
```

**Off-site backups**: copy the nightly backup files out of the volume:
```bash
# Example: rsync to a remote backup server
rsync -az \
  /var/lib/docker/volumes/jobai_jobai-db/_data/backups/ \
  backupuser@backup-server:/backups/jobai/
```

Or use `docker cp`:
```bash
docker cp jobai-backend:/app/data/backups/ ./local-backups/
```

---

## Troubleshooting

### "database is locked"
This should not happen anymore — `busy_timeout = 5000` is set.  
If it persists, check for a second Node process with `ps aux | grep node`.

### Health check returns 503
```bash
curl http://localhost:5000/api/health | jq .database
```
The `message` field will tell you exactly what failed.

### WAL file is large
```bash
npm run db:maintain   # or: docker exec jobai-backend npm run db:maintain
```

### Container keeps restarting
```bash
docker compose logs backend --tail 50
```
Most likely: `.env` is missing or a required variable is empty.
