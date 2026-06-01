#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  FermentOS — Self-Host Installer
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
DEFAULT_APP_PORT=3000
DB_NAME="fermentos"
DB_USER="fermentos"
GITHUB_REPO="highaltidude/FermentOS"

# ── Pick the web port ───────────────────────
# Honour an existing .env (re-installs keep the user's port choice). Otherwise
# prompt interactively, falling back to the default for non-TTY installs
# (e.g. piped from curl).
EXISTING_PORT=""
if [ -f "${INSTALL_DIR}/.env" ]; then
  EXISTING_PORT="$(grep -E '^PORT=' "${INSTALL_DIR}/.env" | head -n1 | cut -d= -f2- | tr -d '"' || true)"
fi
PORT_DEFAULT="${EXISTING_PORT:-$DEFAULT_APP_PORT}"

APP_PORT=""
if [ -t 0 ] && [ -z "${FERMENTOS_PORT:-}" ]; then
  while true; do
    read -r -p "Web port for FermentOS [${PORT_DEFAULT}]: " PORT_INPUT
    PORT_INPUT="${PORT_INPUT:-$PORT_DEFAULT}"
    if [[ "$PORT_INPUT" =~ ^[0-9]+$ ]] && [ "$PORT_INPUT" -ge 1 ] && [ "$PORT_INPUT" -le 65535 ]; then
      if [ "$PORT_INPUT" -lt 1024 ] && [ "$(id -u)" -ne 0 ]; then
        echo "  Note: ports below 1024 require root or a setcap step; proceeding anyway."
      fi
      APP_PORT="$PORT_INPUT"
      break
    fi
    echo "  Please enter a number between 1 and 65535."
  done
else
  # Non-interactive: env var override > existing .env > default.
  APP_PORT="${FERMENTOS_PORT:-$PORT_DEFAULT}"
fi

# ── Check OS ────────────────────────────────
step "Checking system"
if ! command -v apt-get &>/dev/null; then
  error "This installer requires a Debian/Raspberry Pi OS system (apt not found)."
fi
info "Running as: $(whoami) on $(hostname)"
CURRENT_USER="$(whoami)"
if [ "$CURRENT_USER" = "root" ]; then
  warn "Running as root. Services will be installed under root. Consider running as 'pi' or your normal user."
fi

# ── System update ────────────────────────────
step "Updating system packages"
sudo apt-get update -qq
success "System packages updated"

# ── Node.js ──────────────────────────────────
step "Installing Node.js"
if command -v node &>/dev/null && node -e "process.exit(parseInt(process.version.slice(1)) >= 20 ? 0 : 1)" 2>/dev/null; then
  success "Node.js $(node --version) already installed"
else
  info "Installing Node.js v20 via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  success "Node.js $(node --version) installed"
fi

# ── pnpm ─────────────────────────────────────
step "Installing pnpm"
if command -v pnpm &>/dev/null; then
  success "pnpm $(pnpm --version) already installed"
else
  sudo npm install -g pnpm --quiet
  success "pnpm $(pnpm --version) installed"
fi


# ── PostgreSQL ───────────────────────────────
step "Setting up PostgreSQL"
if ! command -v psql &>/dev/null; then
  info "Installing PostgreSQL..."
  sudo apt-get install -y postgresql postgresql-contrib -qq
  success "PostgreSQL installed"
else
  success "PostgreSQL already installed"
fi
sudo systemctl enable postgresql --quiet
sudo systemctl start postgresql

# ── Environment file ─────────────────────────
step "Configuring environment"
ENV_FILE="${INSTALL_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
  # Read existing password so DB user stays in sync
  DB_PASS="$(grep '^DATABASE_URL=' "$ENV_FILE" | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')"
  if [ -z "$DB_PASS" ]; then
    DB_PASS="$(openssl rand -hex 16)"
  fi
  warn ".env already exists — reusing existing credentials"
else
  DB_PASS="$(openssl rand -hex 16)"
fi

# Create DB user and database (idempotent)
info "Creating database user and database..."
# Create user if not exists, otherwise update password
sudo -u postgres psql -q <<EOF
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
  ELSE
    ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
EOF
# Create database if not exists (must be outside a transaction)
if ! sudo -u postgres psql -lqt | grep -q "^\s*${DB_NAME}\b"; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
fi
sudo -u postgres psql -q -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
success "Database '${DB_NAME}' ready"

if [ ! -f "$ENV_FILE" ]; then
  SESSION_SECRET="$(openssl rand -hex 32)"
  DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
  cat > "$ENV_FILE" <<EOF
DATABASE_URL=${DATABASE_URL}
SESSION_SECRET=${SESSION_SECRET}
NODE_ENV=production
PORT=${APP_PORT}
BASE_PATH=/
EOF
  success ".env file created"
else
  # Re-install: sync the chosen port into the existing .env if it changed.
  if grep -qE '^PORT=' "$ENV_FILE"; then
    if [ "$EXISTING_PORT" != "$APP_PORT" ]; then
      sed -i.bak -E "s|^PORT=.*|PORT=${APP_PORT}|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
      info "Updated PORT to ${APP_PORT} in existing .env"
    fi
  else
    echo "PORT=${APP_PORT}" >> "$ENV_FILE"
    info "Added PORT=${APP_PORT} to existing .env"
  fi
fi

# Export vars for the rest of this script
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# ── Install dependencies ─────────────────────
step "Installing project dependencies"
cd "$INSTALL_DIR"
git config core.fileMode false
pnpm install --no-frozen-lockfile
success "Dependencies installed"

# ── Database migrations ──────────────────────
step "Running database migrations"
pnpm --filter @workspace/db run push
success "Database schema ready"

# ── Build ────────────────────────────────────
step "Building the application"
info "Building API server..."
pnpm --filter @workspace/api-server run build
info "Building frontend..."
BASE_PATH=/ pnpm --filter @workspace/fermentos run build
success "Build complete"

# ── systemd services ─────────────────────────
step "Installing systemd services"

SERVICE_USER="$CURRENT_USER"

# Single unified service — API server also serves the frontend static files
sudo tee /etc/systemd/system/fermentos.service > /dev/null <<EOF
[Unit]
Description=FermentOS (API + Frontend)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=/usr/bin/node --enable-source-maps ${INSTALL_DIR}/artifacts/api-server/dist/index.mjs
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable fermentos
sudo systemctl restart fermentos
success "Service installed and started"

# ── sudoers entry ────────────────────────────
# The api-server runs as ${SERVICE_USER} under systemd (no TTY, no password
# prompt possible). For the in-app "Update", "Restart service", and "Reboot
# host" buttons to actually work, that user needs passwordless sudo for
# exactly those commands. Without this, the api-server's spawned `sudo …`
# calls hang forever waiting for a password — which is what causes the
# update progress bar to freeze at 95% on "Restarting service".
step "Configuring passwordless sudo for service control"
SUDOERS_TMP="$(mktemp)"
cat > "$SUDOERS_TMP" <<EOF
# FermentOS — installed by install.sh. Allows the service user to restart
# the fermentos unit and reboot the host from the in-app admin UI without a
# password prompt. Safe to remove if you don't use those buttons.
${SERVICE_USER} ALL=(root) NOPASSWD: /bin/systemctl restart fermentos, /usr/bin/systemctl restart fermentos, /bin/systemctl reboot, /usr/bin/systemctl reboot, /sbin/reboot, /usr/sbin/reboot
EOF
chmod 0440 "$SUDOERS_TMP"
# visudo -c validates the syntax before we install — a malformed file in
# /etc/sudoers.d/ will lock everyone out of sudo, so refuse to install if
# validation fails.
if sudo visudo -cf "$SUDOERS_TMP" >/dev/null; then
  sudo install -o root -g root -m 0440 "$SUDOERS_TMP" /etc/sudoers.d/fermentos
  rm -f "$SUDOERS_TMP"
  success "Sudoers entry installed at /etc/sudoers.d/fermentos"
else
  rm -f "$SUDOERS_TMP"
  warn "Failed to validate sudoers entry — skipping. In-app Restart/Reboot buttons will not work until this is fixed."
fi

# ── Done ─────────────────────────────────────
PI_IP="$(hostname -I | awk '{print $1}')"

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   FermentOS installed successfully!      ║${RESET}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Open in your browser:"
echo -e "  ${BOLD}http://${PI_IP}:${APP_PORT}${RESET}"
echo ""
echo -e "  Useful commands:"
echo -e "  ${CYAN}sudo systemctl status fermentos${RESET}        — check status"
echo -e "  ${CYAN}sudo journalctl -u fermentos -f${RESET}        — tail logs"
echo ""
