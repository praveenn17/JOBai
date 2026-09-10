# JobAI — Quick Start Guide

## ⚡ Local Development (5 minutes)

### 1 — Clone / unzip the project

```
JobAI/
├── backend/        ← Node.js + Express + SQLite
└── frontend/       ← React + Vite
```

### 2 — Backend setup

```bash
cd backend

# Copy the dev env template
cp .env.development .env

# Open .env and set these two required values:
#   ANTHROPIC_API_KEY=sk-ant-...    ← get from console.anthropic.com
#   JWT_SECRET=<32 random hex chars>
#   openssl rand -hex 32            ← generates a good secret

# Install dependencies (includes Playwright browsers)
npm install
npx playwright install chromium    # needed for browser automation feature

# Start the dev server (auto-reloads on save)
npm run dev
# → http://localhost:5000
# → SQLite DB auto-created at backend/jobai.db
```

### 3 — Frontend setup (new terminal)

```bash
cd frontend

# No .env needed for dev — Vite proxy handles /api → localhost:5000 automatically

npm install
npm run dev
# → http://localhost:5173  ✅ Open this in your browser
```

That's it. The frontend proxies all `/api/*` requests to the backend automatically.

---

## 🔑 Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | ✅ | `openssl rand -hex 32` — 32+ hex chars, never share |
| `ANTHROPIC_API_KEY` | ✅ | Claude API key from console.anthropic.com |
| `PORT` | optional | Default: `5000` |
| `NODE_ENV` | optional | `development` or `production` |
| `DB_PATH` | optional | Default: `./jobai.db` |
| `FRONTEND_URL` | optional | CORS origin. Default: `http://localhost:5173`. Comma-separate multiple. |
| `EMAIL_HOST` | optional | SMTP host. Default: `smtp.gmail.com` |
| `EMAIL_PORT` | optional | Default: `587` |
| `EMAIL_USER` | optional | Gmail address — required for cold email feature |
| `EMAIL_PASS` | optional | Gmail 16-char App Password (not your account password) |
| `EMAIL_FROM` | optional | Display name + address |
| `MAX_USERS` | optional | FIFO user cap. Default: `15` |

### Frontend (`frontend/.env` — only needed for production builds)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL including `/api` — e.g. `https://api.yourapp.com/api` |

In **development** leave `frontend/.env` empty. Vite's proxy takes care of it.

---

## 🏗 How Frontend ↔ Backend Connect

### Development flow

```
Browser (localhost:5173)
  └─ fetch('/api/auth/login')
       └─ Vite dev server proxy  [vite.config.js]
            └─ http://localhost:5000/api/auth/login  ✅
```

No CORS, no absolute URLs needed in dev.

### Production flow

```
Browser (https://app.example.com)
  └─ axios baseURL = VITE_API_URL = 'https://api.example.com/api'
       └─ https://api.example.com/api/auth/login  ✅
```

Set `VITE_API_URL` before `npm run build`. The value is baked into the JS bundle.

### API client (`frontend/src/services/api.js`)

```js
import api from '../services/api';
// All routes auto-get JWT from localStorage
const { data } = await api.get('/resume');
const { data } = await api.post('/jobs/analyze', { jobs });
```

### Endpoints map (`frontend/src/services/endpoints.js`)

```js
import { ENDPOINTS, buildUrl } from '../services/endpoints';

// Simple GET
api.get(ENDPOINTS.resume.list)

// With path params
api.get(buildUrl(ENDPOINTS.resume.download, { id: resume.id }))

// POST
api.post(ENDPOINTS.jobs.analyze, { jobs: [...] })

// File upload (use helper)
import { uploadFile } from '../services/api';
uploadFile(ENDPOINTS.resume.upload, file, 'resume', (loaded, total) => {
  setProgress(Math.round(loaded / total * 100));
});

// File download (triggers browser save dialog)
import { downloadFile } from '../services/api';
downloadFile(ENDPOINTS.applications.export, 'applications.csv');
```

### Auth store (`frontend/src/store/authStore.js`)

```js
import useAuthStore from '../store/authStore';
const { user, token, login, logout, updateUser } = useAuthStore();

// Login
const result = await login(email, password);
if (!result.success) showError(result.error);

// Update user in store after profile save (no re-login needed)
updateUser({ name: 'New Name' });
```

### Data fetching hooks (`frontend/src/hooks/useApi.js`)

```js
import { useApi, useMutation, useStats } from '../hooks/useApi';
import { ENDPOINTS, buildUrl } from '../services/endpoints';

// GET (auto-fetches on mount, abort-on-unmount)
const { data: resumes, loading, error, refetch } = useApi(ENDPOINTS.resume.list);

// GET with params
const { data } = useApi(ENDPOINTS.applications.list, {
  immediate: false,   // don't fetch on mount
});
refetch({ page: 2, status: 'applied' });  // fetch with query params

// POST / PUT / DELETE
const { mutate, loading } = useMutation(ENDPOINTS.jobs.analyze);
const result = await mutate({ jobs: [...] });

// Override URL at call time (for :id routes)
const { mutate: activate } = useMutation(ENDPOINTS.resume.activate, 'PUT');
await activate({}, buildUrl(ENDPOINTS.resume.activate, { id: resumeId }));

// Dashboard stats
const { stats, loading } = useStats(30_000);  // polls every 30 s
```

---

## 🗺 All API Routes

### Auth (`/api/auth/...`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | — | Create account |
| POST | `/login` | — | Get JWT |
| GET | `/me` | ✅ | Profile + preferences |
| PUT | `/profile` | ✅ | Update name/phone/location |
| GET | `/preferences` | ✅ | Get job preferences |
| PUT | `/preferences` | ✅ | Save job preferences |
| PUT | `/change-password` | ✅ | Change password |
| DELETE | `/account` | ✅ | Delete all data |
| POST | `/forgot-password` | — | Send reset email |
| POST | `/reset-password` | — | Set new password via token |
| GET | `/verify-email` | — | Confirm email address |
| POST | `/resend-verification` | ✅ | Resend verification email |

### Resume (`/api/resume/...`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/upload` | ✅ | Upload PDF/DOCX (field: `resume`) |
| GET | `/` | ✅ | List all resumes |
| PUT | `/:id/activate` | ✅ | Set as active resume |
| DELETE | `/:id` | ✅ | Delete resume |
| GET | `/:id/download` | ✅ | Download file |

### Jobs (`/api/jobs/...`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/analyze` | ✅ | AI-match up to 10 jobs |
| GET | `/` | ✅ | List saved jobs |
| POST | `/:id/tailor` | ✅ | Tailor resume for job |
| POST | `/:id/reject` | ✅ | Reject a job |
| POST | `/discover` | ✅ | Trigger AI discovery now |
| GET | `/discovered` | ✅ | Discovered job feed |
| POST | `/discovered/:id/action` | ✅ | Apply or reject discovered job |

### Applications (`/api/applications/...`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/start` | ✅ | Start application (AI tailor + queue) |
| GET | `/` | ✅ | List applications (paginated) |
| GET | `/stats` | ✅ | Counts by status |
| GET | `/export` | ✅ | Download CSV |
| GET | `/:id` | ✅ | Application detail |
| POST | `/:id/auto-apply` | ✅ | Playwright browser automation |
| POST | `/:id/mark-applied` | ✅ | Mark as manually applied |
| POST | `/answer-question` | ✅ | AI answer generator |

### Email (`/api/email/...`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/generate` | ✅ | Generate varied cold email |
| POST | `/:id/send` | ✅ | Send via SMTP |
| GET | `/` | ✅ | List emails |
| PUT | `/:id` | ✅ | Update email draft |
| POST | `/outcome/:id` | ✅ | Record response outcome |
| GET | `/pending-outcomes` | ✅ | Emails awaiting outcome |
| GET | `/analytics` | ✅ | Strategy + performance data |
| POST | `/analyze-now` | ✅ | Force AI strategy update |
| GET | `/verify-config` | ✅ | Test SMTP connection |

### Feedback (`/api/feedback/...`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | ✅ | Submit outcome feedback |
| GET | `/` | ✅ | List submitted feedback |
| GET | `/pending` | ✅ | Applications needing feedback |
| POST | `/analyze` | ✅ | Re-run AI learning analysis |
| GET | `/insights` | ✅ | Learning insights |

### Other
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/limits` | ✅ | Rate limits + queue status |
| GET | `/api/notifications` | ✅ | Notifications |
| PUT | `/api/notifications/read-all` | ✅ | Mark all read |
| DELETE | `/api/notifications` | ✅ | Clear all |
| GET | `/api/health` | — | Server + DB health |

---

## 🚀 Production Deployment

### Option A — Docker (easiest)

```bash
# Build frontend first
cd frontend && npm install && npm run build && cd ..

# Set your real values in backend/.env
# KEY vars for prod:
#   NODE_ENV=production
#   JWT_SECRET=<strong secret>
#   ANTHROPIC_API_KEY=sk-ant-...
#   FRONTEND_URL=https://yourdomain.com
#   DB_PATH=/app/data/jobai.db

docker-compose up -d
# Nginx on :80/:443, backend on :5000, SQLite persisted in named volume
```

### Option B — PM2 + Nginx (VPS)

```bash
# Backend
cd backend && npm install
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup

# Frontend
cd frontend
VITE_API_URL=https://api.yourdomain.com/api npm run build
# Serve dist/ with Nginx
```

### Option C — Render.com (free tier)

- **Backend service:** Root dir `backend/`, build `npm install`, start `node src/server.js`
- **Frontend (static site):** Root dir `frontend/`, build `npm run build`, publish `dist/`
- Set `VITE_API_URL` in frontend's Render environment variables

---

## 🧪 Testing

```bash
cd backend
npm run dev     # start server first (separate terminal)
npm test        # runs 30+ API tests against live server
```

For DB health:
```bash
npm run db:check    # health check
npm run db:migrate  # show migration status
```

---

## 🐛 Troubleshooting

| Symptom | Fix |
|---|---|
| `CORS error` in browser | Check `FRONTEND_URL` in backend `.env` matches exactly |
| `401 Unauthorized` on all requests | JWT_SECRET mismatch between old tokens and current secret |
| AI features return errors | Set `ANTHROPIC_API_KEY` in backend `.env` |
| Emails not sending | Set `EMAIL_USER` + `EMAIL_PASS` (Gmail App Password, not account password) |
| SQLite locked error | Only one process should run against the DB; kill duplicate `npm run dev` |
| Vite proxy 502 | Backend not running on port 5000; check `npm run dev` in backend/ |
| `Cannot find module` on backend | Run `npm install` inside `backend/` directory |
