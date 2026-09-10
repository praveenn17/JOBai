#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# JobAI — connect.sh
#
# One script to connect, separate, and reconnect frontend ↔ backend.
# Works for local dev, production, and any deployment platform.
#
# Usage:
#   ./connect.sh            → interactive menu
#   ./connect.sh 1          → Mode 1: Together, local dev (default)
#   ./connect.sh 2          → Mode 2: Separated, local dev
#   ./connect.sh 3          → Mode 3: Together, production build
#   ./connect.sh 4 <url>    → Mode 4: Separated, production build
#   ./connect.sh status     → show current connection config
#   ./connect.sh verify     → test that the connection actually works
# ═══════════════════════════════════════════════════════════════════════════════

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$SCRIPT_DIR/backend"
FRONTEND="$SCRIPT_DIR/frontend"

# ── Colours ───────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

banner() {
  echo ""
  echo -e "${BOLD}${BLUE}⚡ JobAI Connection Manager${NC}"
  echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

ok()   { echo -e "${GREEN}✓${NC} $1"; }
info() { echo -e "${BLUE}→${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC} $1"; }
sep()  { echo -e "${DIM}────────────────────────────────────────────────${NC}"; }

# ── Helpers ───────────────────────────────────────────────────────────────────

# Read a value from a .env file
read_env() {
  local file="$1" key="$2"
  [ -f "$file" ] && grep -E "^${key}=" "$file" | cut -d= -f2- | tr -d '"' || echo ""
}

# Write/replace a key=value in a .env file (creates file if missing)
write_env() {
  local file="$1" key="$2" value="$3"
  if [ -f "$file" ] && grep -qE "^${key}=" "$file"; then
    # Replace existing line (works on both Linux and macOS)
    if sed --version 2>/dev/null | grep -q GNU; then
      sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    else
      sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
    fi
  else
    echo "${key}=${value}" >> "$file"
  fi
}

# Ensure backend .env exists with all required keys
ensure_backend_env() {
  local envfile="$BACKEND/.env"
  if [ ! -f "$envfile" ]; then
    cp "$BACKEND/.env.local" "$envfile"
    warn "Created $envfile from .env.local"
    warn "Add your ANTHROPIC_API_KEY to backend/.env before starting the server."
  fi
}

# Check if a port is listening
port_open() { nc -z 127.0.0.1 "$1" 2>/dev/null; }

# ── Status ────────────────────────────────────────────────────────────────────

show_status() {
  banner
  echo ""
  local be_env="$BACKEND/.env"
  local fe_env="$FRONTEND/.env"

  # Backend
  echo -e "${BOLD}Backend${NC}  ($BACKEND/.env)"
  if [ -f "$be_env" ]; then
    local port=$(read_env "$be_env" PORT)
    local env=$(read_env "$be_env" NODE_ENV)
    local frontend_url=$(read_env "$be_env" FRONTEND_URL)
    local has_key=$(read_env "$be_env" ANTHROPIC_API_KEY)
    echo "  PORT         = ${port:-5000}"
    echo "  NODE_ENV     = ${env:-development}"
    echo "  FRONTEND_URL = ${frontend_url:-(not set — CORS will block browser requests!)}"
    if echo "$has_key" | grep -q "YOUR_KEY\|sk-ant-$"; then
      warn "  ANTHROPIC_API_KEY not set — AI features disabled"
    else
      ok  "  ANTHROPIC_API_KEY is set"
    fi
  else
    warn "backend/.env not found — run ./connect.sh 1 to create it"
  fi

  echo ""
  echo -e "${BOLD}Frontend${NC} ($FRONTEND/.env)"
  if [ -f "$fe_env" ]; then
    local api_url=$(read_env "$fe_env" VITE_API_URL)
    if [ -z "$api_url" ]; then
      echo "  VITE_API_URL = (empty) → uses Vite proxy → localhost:5000"
    else
      echo "  VITE_API_URL = $api_url"
    fi
  else
    echo "  No frontend/.env → VITE_API_URL=(empty) → uses Vite proxy"
  fi

  echo ""
  echo -e "${BOLD}Active Mode${NC}"
  local api_url=$(read_env "$FRONTEND/.env" VITE_API_URL 2>/dev/null)
  local env=$(read_env "$BACKEND/.env" NODE_ENV 2>/dev/null)

  if [ -z "$api_url" ] && [ "$env" = "development" ]; then
    echo -e "  ${GREEN}Mode 1${NC} — Together, local dev (Vite proxy)"
  elif [ -n "$api_url" ] && echo "$api_url" | grep -q "localhost"; then
    echo -e "  ${BLUE}Mode 2${NC} — Separated, local dev (direct CORS)"
  elif [ -z "$api_url" ] && [ "$env" = "production" ]; then
    echo -e "  ${YELLOW}Mode 3${NC} — Together, production (Nginx proxy)"
  else
    echo -e "  ${YELLOW}Mode 4${NC} — Separated, production ($api_url)"
  fi

  echo ""
  echo -e "${BOLD}Runtime${NC}"
  if port_open 5000; then
    ok "Backend is running on :5000"
  else
    info "Backend is NOT running (start: cd backend && npm run dev)"
  fi
  if port_open 5173; then
    ok "Frontend dev server running on :5173"
  else
    info "Frontend dev server NOT running (start: cd frontend && npm run dev)"
  fi
  echo ""
}

# ── Verify ────────────────────────────────────────────────────────────────────

verify_connection() {
  banner
  echo ""
  info "Testing backend health..."

  local backend_port=$(read_env "$BACKEND/.env" PORT 2>/dev/null)
  local port="${backend_port:-5000}"

  if ! port_open "$port"; then
    err "Backend not reachable on :$port — start it first: cd backend && npm run dev"
    exit 1
  fi

  local response
  response=$(curl -s "http://localhost:$port/api/health" 2>/dev/null || echo "")

  if [ -z "$response" ]; then
    err "No response from http://localhost:$port/api/health"
    exit 1
  fi

  local status
  status=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','unknown'))" 2>/dev/null || echo "unknown")

  if [ "$status" = "healthy" ]; then
    ok "Backend is healthy"
    echo "  $(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); db=d.get('database',{}); print(f'DB: {db.get(\"sizeMB\",\"?\"):.2f} MB, {db.get(\"tableCount\",\"?\")} tables')" 2>/dev/null)"
  else
    warn "Backend responded but status=$status"
    echo "  Raw: $response"
  fi

  echo ""
  info "Testing CORS..."

  local frontend_url=$(read_env "$BACKEND/.env" FRONTEND_URL 2>/dev/null)
  local origin="${frontend_url:-http://localhost:5173}"

  local cors_status
  cors_status=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Origin: $origin" \
    -H "Access-Control-Request-Method: POST" \
    -X OPTIONS \
    "http://localhost:$port/api/auth/login" 2>/dev/null || echo "000")

  if [ "$cors_status" = "204" ] || [ "$cors_status" = "200" ]; then
    ok "CORS allows $origin → backend"
  else
    warn "CORS preflight returned $cors_status for origin $origin"
    warn "Check FRONTEND_URL in backend/.env"
  fi

  echo ""
  ok "Connection verification complete"
  echo ""
}

# ── Mode setters ──────────────────────────────────────────────────────────────

set_mode1() {
  banner
  echo ""
  echo -e "${BOLD}Setting Mode 1 — Together, local dev${NC}"
  echo "  Frontend :5173 → Vite proxy → Backend :5000"
  sep

  ensure_backend_env

  # Backend: dev mode, allow Vite dev server
  write_env "$BACKEND/.env" NODE_ENV development
  write_env "$BACKEND/.env" FRONTEND_URL "http://localhost:5173"
  ok "Backend .env → NODE_ENV=development, FRONTEND_URL=http://localhost:5173"

  # Frontend: empty VITE_API_URL = use Vite proxy
  write_env "$FRONTEND/.env" VITE_API_URL ""
  ok "Frontend .env → VITE_API_URL=(empty, Vite proxy active)"

  echo ""
  echo -e "${BOLD}Next steps:${NC}"
  echo "  Terminal 1:  cd backend  && npm run dev"
  echo "  Terminal 2:  cd frontend && npm run dev"
  echo "  Browser:     http://localhost:5173"
  echo ""
}

set_mode2() {
  banner
  echo ""
  echo -e "${BOLD}Setting Mode 2 — Separated, local dev${NC}"
  echo "  Frontend :5173 ──CORS──▶ Backend :5000 (direct)"
  sep

  ensure_backend_env

  # Backend: allow the Vite origin
  write_env "$BACKEND/.env" NODE_ENV development
  write_env "$BACKEND/.env" FRONTEND_URL "http://localhost:5173"
  ok "Backend .env → FRONTEND_URL=http://localhost:5173 (CORS open)"

  # Frontend: point axios directly at the backend
  write_env "$FRONTEND/.env" VITE_API_URL "http://localhost:5000/api"
  ok "Frontend .env → VITE_API_URL=http://localhost:5000/api"

  echo ""
  echo -e "${BOLD}Next steps:${NC}"
  echo "  Terminal 1:  cd backend  && npm run dev"
  echo "  Terminal 2:  cd frontend && npm run dev"
  echo "  Browser:     http://localhost:5173"
  echo ""
}

set_mode3() {
  banner
  echo ""
  echo -e "${BOLD}Setting Mode 3 — Together, production build${NC}"
  echo "  Nginx :443 → /api/* → Backend :5000 | /* → /dist"
  sep

  local domain="${1:-yourdomain.com}"

  ensure_backend_env
  write_env "$BACKEND/.env" NODE_ENV production
  write_env "$BACKEND/.env" FRONTEND_URL "https://$domain"
  ok "Backend .env → NODE_ENV=production, FRONTEND_URL=https://$domain"

  # Frontend: empty = relative /api, Nginx handles proxy
  write_env "$FRONTEND/.env.production" VITE_API_URL ""
  ok "Frontend .env.production → VITE_API_URL=(empty, Nginx proxy active)"

  echo ""
  info "Building frontend..."
  cd "$FRONTEND"
  npm run build
  ok "Frontend built → frontend/dist/"
  cd "$SCRIPT_DIR"

  echo ""
  echo -e "${BOLD}Deploy options:${NC}"
  echo ""
  echo "  Docker:    docker compose up -d --build"
  echo "  PM2+Nginx: pm2 start ecosystem.config.js --env production"
  echo "             sudo cp nginx.conf /etc/nginx/sites-available/jobai"
  echo "             sudo sed -i 's/yourdomain.com/$domain/g' /etc/nginx/sites-available/jobai"
  echo "             sudo ln -sf /etc/nginx/sites-available/jobai /etc/nginx/sites-enabled/"
  echo "             sudo certbot --nginx -d $domain"
  echo "             sudo nginx -s reload"
  echo ""
}

set_mode4() {
  banner
  echo ""
  echo -e "${BOLD}Setting Mode 4 — Separated, production${NC}"
  echo "  Frontend host ──CORS──▶ Backend host (different servers)"
  sep

  local api_url="$1"
  local frontend_url="$2"

  if [ -z "$api_url" ]; then
    echo -n "  Backend API URL (e.g. https://api.yourdomain.com/api): "
    read -r api_url
  fi
  if [ -z "$frontend_url" ]; then
    echo -n "  Frontend URL   (e.g. https://app.yourdomain.com):      "
    read -r frontend_url
  fi

  # Strip trailing slash
  api_url="${api_url%/}"
  frontend_url="${frontend_url%/}"

  ensure_backend_env
  write_env "$BACKEND/.env" NODE_ENV production
  write_env "$BACKEND/.env" FRONTEND_URL "$frontend_url"
  ok "Backend .env → FRONTEND_URL=$frontend_url"

  write_env "$FRONTEND/.env.production" VITE_API_URL "$api_url"
  ok "Frontend .env.production → VITE_API_URL=$api_url"

  echo ""
  info "Building frontend with absolute API URL..."
  cd "$FRONTEND"
  npm run build
  ok "Frontend built → frontend/dist/"
  cd "$SCRIPT_DIR"

  echo ""
  echo -e "${BOLD}Next steps:${NC}"
  echo "  1. Deploy backend (with updated .env) to your backend server"
  echo "  2. Deploy frontend/dist to your frontend host"
  echo ""
  echo "  Render.com example:"
  echo "    Backend service:  npm install → node src/database/setup.js && node src/server.js"
  echo "    Frontend service: (static site) → publish frontend/dist"
  echo "    Set FRONTEND_URL=$frontend_url on backend service"
  echo ""
}

# ── Menu ──────────────────────────────────────────────────────────────────────

show_menu() {
  banner
  echo ""
  echo "  Choose a connection mode:"
  echo ""
  echo -e "  ${BOLD}1${NC}  Together, local dev  ${DIM}(default — Vite proxy, no config needed)${NC}"
  echo -e "  ${BOLD}2${NC}  Separated, local dev ${DIM}(frontend :5173 talks directly to backend :5000)${NC}"
  echo -e "  ${BOLD}3${NC}  Together, production ${DIM}(build frontend, same server, Nginx proxy)${NC}"
  echo -e "  ${BOLD}4${NC}  Separated, production${DIM}(different servers — Vercel, Render, Railway…)${NC}"
  echo ""
  echo -e "  ${BOLD}s${NC}  Show current status"
  echo -e "  ${BOLD}v${NC}  Verify connection (test backend health + CORS)"
  echo ""
  echo -n "  Choice [1]: "
  read -r choice
  choice="${choice:-1}"

  case "$choice" in
    1) set_mode1 ;;
    2) set_mode2 ;;
    3)
      echo -n "  Your domain (e.g. yourdomain.com): "
      read -r domain
      set_mode3 "${domain:-yourdomain.com}"
      ;;
    4) set_mode4 "" "" ;;
    s|status)  show_status ;;
    v|verify)  verify_connection ;;
    *) err "Unknown choice: $choice" ; exit 1 ;;
  esac
}

# ── Entry point ───────────────────────────────────────────────────────────────

case "${1:-menu}" in
  menu|"")   show_menu ;;
  1)         set_mode1 ;;
  2)         set_mode2 ;;
  3)         set_mode3 "${2:-}" ;;
  4)         set_mode4 "${2:-}" "${3:-}" ;;
  status|s)  show_status ;;
  verify|v)  verify_connection ;;
  *)
    banner
    echo ""
    echo "Usage:"
    echo "  ./connect.sh            → interactive menu"
    echo "  ./connect.sh 1          → Mode 1: Together, local dev"
    echo "  ./connect.sh 2          → Mode 2: Separated, local dev"
    echo "  ./connect.sh 3 [domain] → Mode 3: Together, production"
    echo "  ./connect.sh 4 [api_url] [frontend_url] → Mode 4: Separated, production"
    echo "  ./connect.sh status     → show current config"
    echo "  ./connect.sh verify     → test the connection"
    echo ""
    ;;
esac
