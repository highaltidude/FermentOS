#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  FermentOS — optional HTTPS for native installs
#
#  Puts Caddy in front of an install.sh (systemd) install, with Caddy's local
#  CA issuing the certificate. Plain HTTP on port 80 keeps serving /api/* so
#  iSpindel and Home Assistant need no changes. Docker installs use
#  docker-compose.https.yml instead — see README.md.
#
#  sudo bash enable-https.sh             enable, or re-apply after an IP change
#  sudo bash enable-https.sh --disable   put things back the way they were
#
#  Overrides: FERMENTOS_IP, FERMENTOS_NAMES, HTTP_PORT, HTTPS_PORT
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
CADDYFILE=/etc/caddy/Caddyfile
CADDYFILE_BACKUP=/etc/caddy/Caddyfile.pre-fermentos
DROPIN_DIR=/etc/systemd/system/caddy.service.d
DROPIN="${DROPIN_DIR}/fermentos.conf"
# First line of docker/Caddyfile — identifies a Caddyfile this script installed.
MARKER="# Optional HTTPS front for FermentOS"

[ "$(id -u)" -eq 0 ] || error "Run with sudo: sudo bash $0 $*"

# ── Disable ─────────────────────────────────
if [ "${1:-}" = "--disable" ]; then
  step "Disabling HTTPS"
  if command -v systemctl &>/dev/null && systemctl list-unit-files caddy.service &>/dev/null; then
    systemctl disable --now caddy 2>/dev/null || true
  fi
  rm -f "$DROPIN"
  rmdir "$DROPIN_DIR" 2>/dev/null || true
  if [ -f "$CADDYFILE_BACKUP" ]; then
    mv -f "$CADDYFILE_BACKUP" "$CADDYFILE"
    info "Restored the previous ${CADDYFILE}"
  elif [ -f "$CADDYFILE" ] && head -n1 "$CADDYFILE" | grep -qF "$MARKER"; then
    rm -f "$CADDYFILE"
  fi
  systemctl daemon-reload
  success "Caddy stopped. FermentOS is back to plain HTTP on its own port."
  info "The local CA is kept, so re-enabling reuses the root your devices already trust."
  info "To remove Caddy entirely: sudo apt-get remove caddy"
  exit 0
fi
[ -z "${1:-}" ] || error "Unknown option: $1 (use --disable, or no option to enable)"

# ── Check this is a native install ──────────
step "Checking the FermentOS install"
if [ ! -f /etc/systemd/system/fermentos.service ]; then
  if [ -f "${INSTALL_DIR}/docker-compose.yml" ] && grep -qE '^HOST_PORT=' "${INSTALL_DIR}/.env" 2>/dev/null; then
    error "This looks like a Docker install. Use docker-compose.https.yml instead — see README.md."
  fi
  error "No fermentos systemd service found. Run install.sh first."
fi
command -v apt-get &>/dev/null || error "This script requires a Debian/Raspberry Pi OS system (apt not found)."

APP_PORT="$(grep -E '^PORT=' "${INSTALL_DIR}/.env" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"' || true)"
APP_PORT="${APP_PORT:-3000}"
curl -sf -o /dev/null "http://127.0.0.1:${APP_PORT}/api/healthz" \
  || warn "FermentOS isn't answering on port ${APP_PORT} right now — continuing anyway."
success "FermentOS on port ${APP_PORT}"

HTTP_PORT="${HTTP_PORT:-80}"
HTTPS_PORT="${HTTPS_PORT:-443}"
FERMENTOS_IP="${FERMENTOS_IP:-$(hostname -I | awk '{print $1}')}"
FERMENTOS_NAMES="${FERMENTOS_NAMES-$(hostname).local}"
[ -n "$FERMENTOS_IP" ] || error "Couldn't work out this machine's IP. Set FERMENTOS_IP and re-run."

# ── Install Caddy ───────────────────────────
step "Installing Caddy"
if command -v caddy &>/dev/null; then
  success "Caddy already installed ($(caddy version | awk '{print $1}'))"
else
  apt-get update -qq
  if apt-cache show caddy &>/dev/null; then
    apt-get install -y -qq caddy
  else
    # Older releases (e.g. bullseye) don't package Caddy — use Caddy's own
    # repository, per https://caddyserver.com/docs/install#debian-ubuntu-raspbian
    warn "Caddy isn't in this release's repositories — adding Caddy's official apt repository"
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
  fi
  success "Caddy installed ($(caddy version | awk '{print $1}'))"
fi

# ── Check the ports are free ────────────────
step "Checking ports ${HTTP_PORT} and ${HTTPS_PORT}"
for p in "$HTTP_PORT" "$HTTPS_PORT"; do
  holder="$(ss -ltnpH "sport = :${p}" 2>/dev/null | grep -oE 'users:\(\("[^"]+"' | head -n1 | cut -d'"' -f2 || true)"
  if [ -n "$holder" ] && [ "$holder" != "caddy" ]; then
    error "Port ${p} is already used by '${holder}'. Free it, or re-run with HTTP_PORT=/HTTPS_PORT= set to other ports."
  fi
done
success "Ports available"

# ── Configure Caddy ─────────────────────────
step "Configuring Caddy"
CADDY_HOME="$(getent passwd caddy | cut -d: -f6)"
[ -n "$CADDY_HOME" ] || error "The caddy package didn't create a caddy user — can't locate its data directory."
CADDY_PKI_DIR="${CADDY_HOME}/.local/share/caddy/pki/authorities/local"

if [ -f "$CADDYFILE" ] && ! head -n1 "$CADDYFILE" | grep -qF "$MARKER" && [ ! -f "$CADDYFILE_BACKUP" ]; then
  cp "$CADDYFILE" "$CADDYFILE_BACKUP"
  info "Saved the existing Caddyfile as ${CADDYFILE_BACKUP}"
fi
install -m 0644 "${INSTALL_DIR}/docker/Caddyfile" "$CADDYFILE"

mkdir -p "$DROPIN_DIR"
cat > "$DROPIN" <<EOF
# Written by FermentOS enable-https.sh — remove with: sudo bash enable-https.sh --disable
[Service]
Environment="FERMENTOS_IP=${FERMENTOS_IP}"
Environment="FERMENTOS_NAMES=${FERMENTOS_NAMES}"
Environment="FERMENTOS_UPSTREAM=127.0.0.1:${APP_PORT}"
Environment="CADDY_PKI_DIR=${CADDY_PKI_DIR}"
Environment="HTTP_PORT=${HTTP_PORT}"
Environment="HTTPS_PORT=${HTTPS_PORT}"
Environment="PUBLIC_HTTPS_PORT=${HTTPS_PORT}"
EOF

env FERMENTOS_IP="$FERMENTOS_IP" FERMENTOS_NAMES="$FERMENTOS_NAMES" \
  FERMENTOS_UPSTREAM="127.0.0.1:${APP_PORT}" CADDY_PKI_DIR="$CADDY_PKI_DIR" \
  HTTP_PORT="$HTTP_PORT" HTTPS_PORT="$HTTPS_PORT" PUBLIC_HTTPS_PORT="$HTTPS_PORT" \
  caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1 \
  || error "Caddy rejected the configuration. Check: caddy validate --config ${CADDYFILE}"

systemctl daemon-reload
systemctl enable caddy >/dev/null 2>&1
systemctl restart caddy
success "Caddy running"

# ── Wait for Caddy and its local CA ─────────
# Both listeners are up and the CA exists once the root is downloadable and a
# TLS handshake against it succeeds (any HTTP status will do — the app itself
# may still be starting). On a Pi Zero the first start can take a while.
ready=""
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:${HTTP_PORT}/root.crt" \
    && curl -s -o /dev/null --cacert "${CADDY_PKI_DIR}/root.crt" \
      --connect-to "${FERMENTOS_IP}:${HTTPS_PORT}:127.0.0.1:${HTTPS_PORT}" \
      "https://${FERMENTOS_IP}:${HTTPS_PORT}/api/healthz"; then
    ready=1
    break
  fi
  sleep 1
done
[ -n "$ready" ] || error "Caddy didn't come up with HTTPS. Check: journalctl -u caddy"

HP=""; [ "$HTTP_PORT" = "80" ] || HP=":${HTTP_PORT}"
SP=""; [ "$HTTPS_PORT" = "443" ] || SP=":${HTTPS_PORT}"

echo ""
echo -e "${GREEN}${BOLD}HTTPS is on.${RESET}"
echo ""
echo -e "  1. On each phone or computer, download and trust the root certificate:"
echo -e "     ${BOLD}http://${FERMENTOS_IP}${HP}/root.crt${RESET}"
echo -e "     (README: \"Serve FermentOS over HTTPS\" has the steps per device)"
echo -e "  2. Then open FermentOS at:"
echo -e "     ${BOLD}https://${FERMENTOS_IP}${SP}${RESET}"
for n in $FERMENTOS_NAMES; do
  echo -e "     ${BOLD}https://${n}${SP}${RESET}"
done
echo ""
echo -e "  iSpindel and Home Assistant keep working on ${BOLD}http://${FERMENTOS_IP}${HP}/api/...${RESET}"
echo -e "  The old address, http://${FERMENTOS_IP}:${APP_PORT}, still works too."
echo ""
warn "The certificate is issued for ${FERMENTOS_IP}. Reserve that address for this"
warn "machine in your router's DHCP settings; if it ever changes, re-run this script."
