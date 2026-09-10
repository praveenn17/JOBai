#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# JobAI — setup.sh
#
# First-time install: checks Node, installs npm deps, sets up .env.
# After this, use ./connect.sh to choose your connection mode.
#
# Usage:  ./setup.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BOLD='\033[1m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'
YELLOW='\033[1;33m'; RED='\033[0;31m'; DIM='\033[2m'; NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
info() { echo -e "${BLUE}→${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }

echo ""
echo -e "${BOLD}${BLUE}⚡ JobAI — First-Time Setup${NC}"
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ── Check Node.js ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  err "Node.js not found. Install Node 18+ from https://nodejs.org"
fi
NODE_VER=$(node -v | tr -d 'v' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  err "Node.js 18+ required. Found $(node -v). Update at https://nodejs.org"
fi
ok "Node.js $(node -v)"

# ── Backend: create .env if missing ───────────────────────────────────────────
echo ""
info "Setting up backend..."
cd "$SCRIPT_DIR/backend"

if [ ! -f ".env" ]; then
  cp .env.local .env
  warn ".env created from .env.local"
  echo ""
  echo -e "  ${BOLD}Required:${NC} Open ${BOLD}backend/.env${NC} and set:"
  echo "    ANTHROPIC_API_KEY=sk-ant-...   ← get from console.anthropic.com"
  echo "    JWT_SECRET=<32 hex chars>      ← run: openssl rand -hex 32"
  echo ""
fi

npm install --silent
mkdir -p logs uploads uploads/tailored uploads/screenshots
ok "Backend dependencies installed"

# ── Frontend: install deps ─────────────────────────────────────────────────────
echo ""
info "Setting up frontend..."
cd "$SCRIPT_DIR/frontend"
npm install --silent
ok "Frontend dependencies installed"

# ── Playwright browsers (for automation feature) ──────────────────────────────
echo ""
info "Installing Playwright browser (for automation feature)..."
cd "$SCRIPT_DIR/backend"
npx playwright install chromium --with-deps 2>/dev/null \
  && ok "Playwright/Chromium installed" \
  || warn "Playwright install failed — automation feature will be disabled"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}Setup complete!${NC}"
echo ""
echo "  Next: choose how to connect frontend ↔ backend:"
echo ""
echo -e "  ${BOLD}./connect.sh 1${NC}   — Together, local dev (${DIM}default, recommended${NC})"
echo -e "  ${BOLD}./connect.sh 2${NC}   — Separated, local dev"
echo -e "  ${BOLD}./connect.sh 3${NC}   — Together, production build"
echo -e "  ${BOLD}./connect.sh 4${NC}   — Separated, production (different servers)"
echo ""
echo "  Or just run: ${BOLD}./connect.sh${NC} for an interactive menu"
echo ""
