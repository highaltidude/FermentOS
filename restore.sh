#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  FermentOS — Restore Script
#
#  Restore the database from a pg_dump SQL file
#  (the kind produced by "Download SQL Dump" in
#  Settings → System → Database Backup, or the
#  scheduled SFTP push).
#
#  Usage:
#    ./restore.sh path/to/backup.sql
#
#  This is DESTRUCTIVE — every table in the
#  current database's public schema is dropped
#  before the dump is applied.
# ─────────────────────────────────────────────

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 <backup.sql>"
  echo ""
  echo "Restores a FermentOS pg_dump file into the database configured in .env."
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: file not found: $BACKUP_FILE"
  exit 1
fi

# Reject custom-format dumps — only plain SQL is supported here.
if head -c 5 "$BACKUP_FILE" | grep -q "PGDMP"; then
  echo "Error: '$BACKUP_FILE' looks like a custom-format pg_dump."
  echo "Use a plain-SQL dump (the file 'Download SQL Dump' produces)."
  exit 1
fi

if [ ! -f "${INSTALL_DIR}/.env" ]; then
  echo "Error: ${INSTALL_DIR}/.env not found. Run install.sh first."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "${INSTALL_DIR}/.env"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL is not set in .env"
  exit 1
fi

echo ""
echo "About to restore the FermentOS database from:"
echo "  $BACKUP_FILE"
echo ""
echo "This will DROP all existing tables in the 'public' schema first."
read -r -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo ""
echo "[1/3] Stopping fermentos service (if running)..."
sudo systemctl stop fermentos 2>/dev/null || true

echo "[2/3] Building combined wipe + restore script..."
# Wipe the public schema and apply the dump inside a single transaction so
# a corrupt dump rolls back cleanly and leaves the existing data intact.
COMBINED_FILE="$(mktemp -t fermentos_restore.XXXXXX.sql)"
trap 'rm -f "$COMBINED_FILE"' EXIT
{
  # psql -1 wraps the whole file in a single transaction, so we just
  # prepend the schema wipe — no explicit BEGIN/COMMIT needed.
  echo "DROP SCHEMA IF EXISTS public CASCADE;"
  echo "CREATE SCHEMA public;"
  echo "GRANT ALL ON SCHEMA public TO PUBLIC;"
  cat "$BACKUP_FILE"
} > "$COMBINED_FILE"

echo "[3/3] Restoring data from dump (single transaction)..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f "$COMBINED_FILE"

echo ""
echo "Restore complete. Starting fermentos service..."
sudo systemctl start fermentos 2>/dev/null || echo "(systemd unit not found — start the app manually)"

echo ""
echo "Done. The database has been restored from $BACKUP_FILE."
