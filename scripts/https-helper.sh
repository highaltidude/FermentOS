#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  FermentOS — HTTPS helper for native (install.sh) installs
#
#  Puts Caddy in front of FermentOS with Caddy's local CA issuing the
#  certificate. Plain HTTP on port 80 keeps serving /api/* so iSpindel and
#  Home Assistant need no changes. Docker installs use docker-compose.https.yml.
#
#    https-helper.sh enable --ip <IPv4> [--name <host>]... [--http-port N] [--https-port N]
#    https-helper.sh disable
#    https-helper.sh version
#
#  Two ways it runs:
#   - By hand: `sudo bash enable-https.sh`, which calls this file in the repo.
#   - From Settings → System → Integrations → HTTPS: install.sh and the repair script install
#     a root-owned copy at /usr/local/libexec/fermentos/https, and the sudoers
#     entry lets the service user run that copy, with any arguments.
#
#  Because sudo cannot restrict the arguments, everything that reaches root is
#  validated here before it is used, and nothing is taken from a place the
#  service user can write: the install directory comes from the root-owned
#  systemd unit, and the installed copy reads its Caddyfile from beside itself.
# ─────────────────────────────────────────────

# Bump when this file changes, so Settings can tell an installed copy is stale.
HELPER_VERSION=1

if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''
fi
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }
step()    { echo -e "\n${BOLD}── $* ${RESET}"; }

UNIT=/etc/systemd/system/fermentos.service
CADDYFILE=/etc/caddy/Caddyfile
CADDYFILE_BACKUP=/etc/caddy/Caddyfile.pre-fermentos
DROPIN_DIR=/etc/systemd/system/caddy.service.d
DROPIN="${DROPIN_DIR}/fermentos.conf"
# First line of docker/Caddyfile — identifies a Caddyfile FermentOS installed.
MARKER="# Optional HTTPS front for FermentOS"

# Whether /etc/caddy/Caddyfile may be replaced: there is none, it is the one
# FermentOS installed, or it is the caddy package's untouched default (dpkg -V
# lists a conffile only once it has been modified). Anything else is somebody's
# own Caddy setup, and FermentOS would take its sites offline.
caddyfile_replaceable() {
  [ -f "$CADDYFILE" ] || return 0
  head -n1 "$CADDYFILE" | grep -qF "$MARKER" && return 0
  dpkg -s caddy &>/dev/null && ! dpkg -V caddy 2>/dev/null | grep -qE "[[:space:]]${CADDYFILE}\$" && return 0
  return 1
}

# ── Validation (the security boundary — see the header) ──
valid_ipv4() {
  [[ "$1" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  local o
  for o in "${BASH_REMATCH[@]:1}"; do
    [ "${#o}" -eq 1 ] || [ "${o:0:1}" != "0" ] || return 1   # no leading zeros
    [ "$o" -le 255 ] || return 1
  done
}
valid_name() {
  [ "${#1}" -le 253 ] && [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$ ]]
}
valid_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] && [ "${1:0:1}" != "0" ] && [ "$1" -le 65535 ]
}

# ── Arguments ───────────────────────────────
ACTION="${1:-}"
[ $# -gt 0 ] && shift

case "$ACTION" in
  version) echo "$HELPER_VERSION"; exit 0 ;;
  enable|disable) ;;
  *) error "Usage: $0 enable --ip <IPv4> [--name <host>]... [--http-port N] [--https-port N] | disable | version" ;;
esac

IP=""; NAMES=(); HTTP_PORT=80; HTTPS_PORT=443
while [ $# -gt 0 ]; do
  case "$1" in
    --ip)         [ $# -ge 2 ] || error "--ip needs a value"; IP="$2"; shift 2 ;;
    --name)       [ $# -ge 2 ] || error "--name needs a value"; NAMES+=("$2"); shift 2 ;;
    --http-port)  [ $# -ge 2 ] || error "--http-port needs a value"; HTTP_PORT="$2"; shift 2 ;;
    --https-port) [ $# -ge 2 ] || error "--https-port needs a value"; HTTPS_PORT="$2"; shift 2 ;;
    *) error "Unknown option: $1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || error "Must run as root."

# ── Disable ─────────────────────────────────
if [ "$ACTION" = "disable" ]; then
  step "Turning HTTPS off"
  if systemctl list-unit-files caddy.service &>/dev/null; then
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
  info "The local CA is kept, so turning HTTPS on again reuses the root your devices already trust."
  exit 0
fi

# ── Enable: validate before touching anything ──
[ -n "$IP" ] || error "--ip is required"
valid_ipv4 "$IP" || error "Not an IPv4 address: $IP"
[ ${#NAMES[@]} -le 5 ] || error "At most 5 names"
for n in "${NAMES[@]}"; do valid_name "$n" || error "Not a valid host name: $n"; done
valid_port "$HTTP_PORT"  || error "Not a valid port: $HTTP_PORT"
valid_port "$HTTPS_PORT" || error "Not a valid port: $HTTPS_PORT"
[ "$HTTP_PORT" != "$HTTPS_PORT" ] || error "The HTTP and HTTPS ports must differ"

step "Checking the FermentOS install"
[ -f "$UNIT" ] || error "No fermentos systemd service found. Run install.sh first."
command -v apt-get &>/dev/null || error "This needs a Debian/Raspberry Pi OS system (apt not found)."
INSTALL_DIR="$(sed -n 's/^WorkingDirectory=//p' "$UNIT" | head -n1)"
[ -n "$INSTALL_DIR" ] && [ -d "$INSTALL_DIR" ] || error "Couldn't read WorkingDirectory from ${UNIT}."

# .env belongs to the service user, so only a plain number is accepted from it.
APP_PORT="$(grep -E '^PORT=' "${INSTALL_DIR}/.env" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '"' || true)"
APP_PORT="${APP_PORT:-3000}"
valid_port "$APP_PORT" || error "PORT in ${INSTALL_DIR}/.env is not a valid port."
[ "$APP_PORT" != "$HTTP_PORT" ] && [ "$APP_PORT" != "$HTTPS_PORT" ] \
  || error "FermentOS itself uses port ${APP_PORT}; pick other ports for Caddy."
curl -sf -o /dev/null "http://127.0.0.1:${APP_PORT}/api/healthz" \
  || warn "FermentOS isn't answering on port ${APP_PORT} right now — continuing anyway."
success "FermentOS on port ${APP_PORT}"

# The installed copy uses the root-owned Caddyfile beside it; run from the
# repo by hand (sudo bash enable-https.sh), it uses the repo's.
HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${HELPER_DIR}/Caddyfile" ]; then
  CADDYFILE_SRC="${HELPER_DIR}/Caddyfile"
else
  CADDYFILE_SRC="${INSTALL_DIR}/docker/Caddyfile"
fi
[ -f "$CADDYFILE_SRC" ] || error "Caddyfile not found at ${CADDYFILE_SRC}."

# Before installing anything: refuse to take over a Caddy already serving
# something else. (When Caddy isn't installed yet, the file apt is about to
# create is the package default, which is fine to replace.)
caddyfile_replaceable || error "${CADDYFILE} already has a configuration FermentOS didn't write, so Caddy is probably serving other sites. Turning HTTPS on would replace it and take them offline, so nothing was changed. To use this Caddy for FermentOS too, add a site that proxies to 127.0.0.1:${APP_PORT} yourself; or move that file aside if it's no longer needed, then try again."
success "No other Caddy configuration in the way"

# ── Install Caddy ───────────────────────────
step "Installing Caddy"
if command -v caddy &>/dev/null; then
  success "Caddy already installed ($(caddy version | awk '{print $1}'))"
else
  export DEBIAN_FRONTEND=noninteractive
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
    error "Port ${p} is already used by '${holder}'. Free it, or choose other ports."
  fi
done
success "Ports available"

# ── Configure Caddy ─────────────────────────
step "Configuring Caddy"
CADDY_HOME="$(getent passwd caddy | cut -d: -f6)"
[ -n "$CADDY_HOME" ] || error "The caddy package didn't create a caddy user — can't locate its data directory."
CADDY_PKI_DIR="${CADDY_HOME}/.local/share/caddy/pki/authorities/local"
FERMENTOS_NAMES="${NAMES[*]:-}"

if [ -f "$CADDYFILE" ] && ! head -n1 "$CADDYFILE" | grep -qF "$MARKER" && [ ! -f "$CADDYFILE_BACKUP" ]; then
  cp "$CADDYFILE" "$CADDYFILE_BACKUP"
  info "Saved the existing Caddyfile as ${CADDYFILE_BACKUP}"
fi
install -m 0644 "$CADDYFILE_SRC" "$CADDYFILE"

mkdir -p "$DROPIN_DIR"
cat > "$DROPIN" <<EOF
# Written by FermentOS — turn off from Settings → System → Integrations → HTTPS,
# or with: sudo bash enable-https.sh --disable
[Service]
Environment="FERMENTOS_IP=${IP}"
Environment="FERMENTOS_NAMES=${FERMENTOS_NAMES}"
Environment="FERMENTOS_UPSTREAM=127.0.0.1:${APP_PORT}"
Environment="CADDY_PKI_DIR=${CADDY_PKI_DIR}"
Environment="HTTP_PORT=${HTTP_PORT}"
Environment="HTTPS_PORT=${HTTPS_PORT}"
Environment="PUBLIC_HTTPS_PORT=${HTTPS_PORT}"
EOF

env FERMENTOS_IP="$IP" FERMENTOS_NAMES="$FERMENTOS_NAMES" \
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
step "Waiting for the certificate"
ready=""
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:${HTTP_PORT}/root.crt" \
    && curl -s -o /dev/null --cacert "${CADDY_PKI_DIR}/root.crt" \
      --connect-to "${IP}:${HTTPS_PORT}:127.0.0.1:${HTTPS_PORT}" \
      "https://${IP}:${HTTPS_PORT}/api/healthz"; then
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
echo -e "     ${BOLD}http://${IP}${HP}/root.crt${RESET}"
echo -e "  2. Then open FermentOS at:"
echo -e "     ${BOLD}https://${IP}${SP}${RESET}"
for n in "${NAMES[@]}"; do
  echo -e "     ${BOLD}https://${n}${SP}${RESET}"
done
echo ""
echo -e "  iSpindel and Home Assistant keep working on ${BOLD}http://${IP}${HP}/api/...${RESET}"
echo -e "  The old address, http://${IP}:${APP_PORT}, still works too."
echo ""
warn "The certificate is issued for ${IP}. Reserve that address for this machine"
warn "in your router's DHCP settings; if it ever changes, turn HTTPS on again with the new one."
