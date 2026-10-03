#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  FermentOS — optional HTTPS for native installs, from the command line
#
#  The same thing Settings → System → Integrations → HTTPS does: puts Caddy with a local CA in
#  front of an install.sh (systemd) install. Docker installs use
#  docker-compose.https.yml instead — see README.md.
#
#  sudo bash enable-https.sh             enable, or re-apply after an IP change
#  sudo bash enable-https.sh --disable   put things back the way they were
#
#  Overrides: FERMENTOS_IP, FERMENTOS_NAMES (space-separated), HTTP_PORT, HTTPS_PORT
#
#  The work happens in scripts/https-helper.sh, which validates everything.
# ─────────────────────────────────────────────

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER="${INSTALL_DIR}/scripts/https-helper.sh"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo: sudo bash $0 $*" >&2
  exit 1
fi

if [ "${1:-}" = "--disable" ]; then
  exec bash "$HELPER" disable
fi
if [ -n "${1:-}" ]; then
  echo "Unknown option: $1 (use --disable, or no option to enable)" >&2
  exit 1
fi

if [ ! -f /etc/systemd/system/fermentos.service ] \
  && [ -f "${INSTALL_DIR}/docker-compose.yml" ] && grep -qE '^HOST_PORT=' "${INSTALL_DIR}/.env" 2>/dev/null; then
  echo "This looks like a Docker install. Use docker-compose.https.yml instead — see README.md." >&2
  exit 1
fi

IP="${FERMENTOS_IP:-$(hostname -I | awk '{print $1}')}"
NAMES="${FERMENTOS_NAMES-$(hostname).local}"

args=(enable --ip "$IP" --http-port "${HTTP_PORT:-80}" --https-port "${HTTPS_PORT:-443}")
for n in $NAMES; do args+=(--name "$n"); done

exec bash "$HELPER" "${args[@]}"
