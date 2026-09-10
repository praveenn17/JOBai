# ─────────────────────────────────────────────────────────────────────────────
# JobAI Backend — Production Dockerfile
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-slim

# ── System dependencies for Playwright / Chromium ─────────────────────────────
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Use the system Chromium instead of downloading another binary
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# ── App setup ─────────────────────────────────────────────────────────────────
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Pre-create all directories that the app writes to.
# /app/data is a Docker named volume — the directory must exist INSIDE the
# image so the mount point is valid even on first boot before the volume has
# any content.  The SQLite file itself is created at runtime by db.js.
RUN mkdir -p \
      /app/data \
      /app/data/backups \
      /app/uploads \
      /app/uploads/tailored \
      /app/uploads/screenshots \
      /app/logs

# ── Runtime ───────────────────────────────────────────────────────────────────
EXPOSE 5000

# Deep healthcheck: hits the /api/health endpoint AND verifies db.ok === true
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "\
    require('http').get('http://localhost:5000/api/health', r => { \
      let d=''; r.on('data',c=>d+=c); \
      r.on('end',()=>{ \
        try { const j=JSON.parse(d); process.exit(j.status==='healthy'&&j.database&&j.database.ok?0:1); } \
        catch(e){ process.exit(1); } \
      }); \
    }).on('error',()=>process.exit(1));"

# docker-compose overrides this CMD with the migration pre-flight + server start.
# When running standalone (e.g. in CI), setup.js runs migrations then exits 0.
CMD ["node", "src/server.js"]
