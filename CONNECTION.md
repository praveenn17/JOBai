# JobAI — Connection Guide

How to connect, separate, and reconnect frontend ↔ backend
in every environment. One file to read, one variable to change.

---

## The One Variable That Controls Everything

```
VITE_API_URL  (in frontend/.env)
```

| Value | What it means |
|---|---|
| *(empty / not set)* | **TOGETHER** — Vite proxy or Nginx routes `/api` to backend on same host |
| `http://localhost:5000/api` | **SEPARATED locally** — frontend on :5173, backend on :5000 |
| `https://api.yourdomain.com/api` | **SEPARATED in production** — different servers/subdomains |

On the backend side, one variable controls who can call it:

```
FRONTEND_URL  (in backend/.env)
```

| Value | What it means |
|---|---|
| `http://localhost:5173` | Local dev frontend |
| `https://yourdomain.com` | Production frontend on same domain |
| `https://app.yourdomain.com` | Production frontend on subdomain |
| `https://a.com,https://b.com` | Multiple origins (comma-separated) |

---

## Mode 1 — Together, Local Dev (default)

Frontend and backend on the same machine. Vite proxies `/api` to the backend.
**No CORS. No absolute URLs. Nothing to configure.**

```
Browser :5173 → Vite proxy → Backend :5000
```

**Backend** (`backend/.env`):
```env
PORT=5000
NODE_ENV=development
JWT_SECRET=dev_secret_change_in_production_32chars_minimum
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
FRONTEND_URL=http://localhost:5173
```

**Frontend** (`frontend/.env` — or no file at all):
```env
# Leave VITE_API_URL empty (or delete this file entirely)
# VITE_API_URL=
```

**Start:**
```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
# → Open http://localhost:5173
```

---

## Mode 2 — Separated, Local Dev

Frontend and backend run on the same machine but are treated as independent services.
Useful when you want to test cross-origin behaviour locally.

```
Browser :5173 ──CORS──▶ Backend :5000
```

**Backend** (`backend/.env`):
```env
PORT=5000
FRONTEND_URL=http://localhost:5173    ← tells backend to allow this origin
```

**Frontend** (`frontend/.env`):
```env
VITE_API_URL=http://localhost:5000/api    ← tell axios where the backend is
```

**Start:** same as Mode 1 — two terminals.

---

## Mode 3 — Together, Production (same server / Docker)

Both frontend and backend live behind one Nginx on one server.
Nginx routes `/api/*` to the Node process; everything else serves the React build.

```
Internet → Nginx :443
              ├─ /api/*  → Node :5000   (backend)
              └─ /*      → /dist        (frontend)
```

**Backend** (`backend/.env` or root `.env`):
```env
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com    ← same domain, no subdomain
```

**Frontend** — build with NO `VITE_API_URL` (empty = relative `/api`):
```bash
cd frontend
# Do NOT set VITE_API_URL — Nginx handles the proxy
npm run build
```

**Deploy (Docker):**
```bash
cp backend/.env.example .env          # fill in secrets
cd frontend && npm ci && npm run build && cd ..
docker compose up -d --build
```

**Deploy (PM2 + Nginx):**
```bash
cd frontend && npm ci && npm run build && cd ..
sudo cp nginx.conf /etc/nginx/sites-available/jobai
# Edit nginx.conf: replace yourdomain.com with your actual domain
sudo ln -s /etc/nginx/sites-available/jobai /etc/nginx/sites-enabled/
sudo certbot --nginx -d yourdomain.com
pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup
```

---

## Mode 4 — Separated, Production (different servers / Render / Railway)

Frontend on one host (Vercel, Netlify, Render static), backend on another
(Render web service, Railway, VPS).

```
https://app.yourdomain.com  ──CORS──▶  https://api.yourdomain.com
       (frontend)                              (backend)
```

**Backend** (`backend/.env` on the backend server):
```env
NODE_ENV=production
FRONTEND_URL=https://app.yourdomain.com    ← your frontend's URL
```

**Frontend** — build with absolute API URL:
```bash
cd frontend
VITE_API_URL=https://api.yourdomain.com/api npm run build
# OR: put it in frontend/.env.production before building:
#   echo "VITE_API_URL=https://api.yourdomain.com/api" > .env.production
#   npm run build
```

### Render.com example

| Service | Type | Root Dir | Build Command | Start Command |
|---|---|---|---|---|
| jobai-backend | Web Service | `backend/` | `npm install` | `node src/database/setup.js && node src/server.js` |
| jobai-frontend | Static Site | `frontend/` | `npm install && npm run build` | *(none)* |

On the **frontend** Render service, add environment variable:
```
VITE_API_URL = https://jobai-backend.onrender.com/api
```

On the **backend** Render service, add environment variable:
```
FRONTEND_URL = https://jobai-frontend.onrender.com
```

---

## Switching Modes (cheatsheet)

### Together → Separated (local)
```bash
# 1. Frontend: add/edit frontend/.env
echo "VITE_API_URL=http://localhost:5000/api" > frontend/.env

# 2. Backend: already allows localhost:5173 by default — nothing to change
# 3. Restart frontend dev server (Vite picks up .env changes on restart)
cd frontend && npm run dev
```

### Separated → Together (local)
```bash
# 1. Frontend: clear the variable
echo "" > frontend/.env   # or delete the file

# 2. Restart frontend dev server
cd frontend && npm run dev
```

### Together prod → Separated prod
```bash
# 1. Deploy backend to its own server/service
# 2. Set FRONTEND_URL on backend to your frontend's domain
# 3. Rebuild frontend with absolute URL:
VITE_API_URL=https://api.yourdomain.com/api npm run build
# 4. Deploy the new frontend build
```

### Separated prod → Together prod
```bash
# 1. Set FRONTEND_URL on backend to the combined domain (e.g. https://yourdomain.com)
# 2. Rebuild frontend WITHOUT VITE_API_URL (leave it empty):
cd frontend && npm run build
# 3. Deploy both behind a single Nginx (use nginx.conf)
```

---

## Verify the connection is working

```bash
# Backend health (always works regardless of mode):
curl http://localhost:5000/api/health

# Frontend can reach backend (in browser console):
fetch('/api/health').then(r => r.json()).then(console.log)

# Full login test:
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234"}'
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `CORS error` in browser | `FRONTEND_URL` in backend `.env` doesn't match what the browser sends | Set `FRONTEND_URL` to exactly the origin shown in the error (no trailing slash) |
| `net::ERR_CONNECTION_REFUSED` on `/api/*` | Backend not running, or `VITE_API_URL` points to wrong port | Start backend; check port in `.env` |
| All API calls return 401 | JWT_SECRET changed while users are logged in | Clear `localStorage` in browser (`localStorage.clear()`) and log in again |
| `502 Bad Gateway` from Nginx | Backend process crashed | `pm2 logs jobai-backend` or `docker logs jobai-backend` |
| Frontend shows old data after rebuild | Browser cached old JS bundle | Hard-refresh (`Ctrl+Shift+R`) or clear cache |
| `VITE_API_URL` change has no effect | Vite bakes env vars at build time | Re-run `npm run build` after changing `.env.production` |
