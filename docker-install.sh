#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  FermentOS — Docker Installer
# ─────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }
step()    { echo -e "\n${BOLD}── $* ${RESET}"; }

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${INSTALL_DIR}/.env"
DEFAULT_APP_PORT=3000

# ── Check Docker is available ────────────────
if ! command -v docker &>/dev/null; then
  error "Docker is not installed or not in PATH."
fi
if ! docker compose version &>/dev/null; then
  error "Docker Compose plugin not found. Install Docker Desktop or the compose plugin."
fi

# ── Pick the web port ────────────────────────
# Honour existing .env so re-runs keep the user's choice.
EXISTING_PORT=""
if [ -f "$ENV_FILE" ]; then
  EXISTING_PORT="$(grep -E '^HOST_PORT=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"' || true)"
fi
PORT_DEFAULT="${EXISTING_PORT:-$DEFAULT_APP_PORT}"

APP_PORT=""
if [ -t 0 ] && [ -z "${FERMENTOS_PORT:-}" ]; then
  while true; do
    read -r -p "Web port for FermentOS [${PORT_DEFAULT}]: " PORT_INPUT
    PORT_INPUT="${PORT_INPUT:-$PORT_DEFAULT}"
    if [[ "$PORT_INPUT" =~ ^[0-9]+$ ]] && [ "$PORT_INPUT" -ge 1 ] && [ "$PORT_INPUT" -le 65535 ]; then
      APP_PORT="$PORT_INPUT"
      break
    fi
    echo "  Please enter a number between 1 and 65535."
  done
else
  # Non-interactive: env var override > existing .env > default.
  APP_PORT="${FERMENTOS_PORT:-$PORT_DEFAULT}"
fi

# ── Create or update .env ────────────────────
step "Configuring environment"
if [ -f "$ENV_FILE" ]; then
  warn ".env already exists — preserving credentials, updating HOST_PORT"
  if grep -qE '^HOST_PORT=' "$ENV_FILE"; then
    sed -i.bak -E "s|^HOST_PORT=.*|HOST_PORT=${APP_PORT}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    echo "HOST_PORT=${APP_PORT}" >> "$ENV_FILE"
  fi
  success "HOST_PORT set to ${APP_PORT}"
else
  DB_PASSWORD="$(openssl rand -hex 16)"
  SESSION_SECRET="$(openssl rand -hex 32)"
  cat > "$ENV_FILE" <<EOF
HOST_PORT=${APP_PORT}
DB_PASSWORD=${DB_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
EOF
  success ".env created with secure random credentials"
fi

# ── Build and start the stack ────────────────
step "Starting FermentOS"
cd "$INSTALL_DIR"

# Capture git metadata on the host (where git is available) so it can be
# baked into the image — the container has no .git directory at runtime.
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "unknown")
GIT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")

docker compose build \
  --build-arg GIT_HASH="$GIT_HASH" \
  --build-arg GIT_BRANCH="$GIT_BRANCH" \
  --build-arg GIT_REMOTE="$GIT_REMOTE"
docker compose up -d

# ── Done ─────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   FermentOS is starting up!              ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Open in your browser once healthy:"
echo -e "  ${BOLD}http://localhost:${APP_PORT}${RESET}"
echo ""
echo -e "  Useful commands:"
echo -e "  ${CYAN}docker compose logs -f app${RESET}   — stream logs"
echo -e "  ${CYAN}docker compose ps${RESET}            — check health status"
echo -e "  ${CYAN}docker compose down${RESET}          — stop (data preserved)"
echo ""
