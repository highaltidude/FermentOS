#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  FermentOS — Rollback Script
# ─────────────────────────────────────────────
#
# Rolls the working tree back to a previous commit and rebuilds. Invoked from
# the api-server's POST /api/admin/rollback handler with a single argument:
# the short or full commit hash to roll back to.
#
# IMPORTANT: This script intentionally does NOT run database migrations. A
# rollback may target a commit with an older schema, and drizzle-kit push is
# not safe to run "backwards" — it could destroy data that the newer schema
# added. Schema changes from after the target commit are left in place; the
# old code must be backwards-compatible with them, or you must restore a
# matching database backup separately.

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${INSTALL_DIR}/update.log"
LOCK_FILE="${INSTALL_DIR}/update.lock"

exec > >(tee -a "$LOG_FILE") 2>&1

# Same lock-cleanup contract as update.sh — see comment there.
trap 'rm -f "$LOCK_FILE"' EXIT

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo "ERROR: rollback.sh requires exactly one argument: the commit hash."
  exit 2
fi

TARGET_HASH="$1"

echo ""
echo "=== Rollback to ${TARGET_HASH} started at $(date) ==="

cd "$INSTALL_DIR"

# Reject anything that doesn't look like a git short/full hash. Defence in
# depth — the API handler also validates, but `git reset --hard` on attacker-
# controlled input would be game over.
if ! [[ "$TARGET_HASH" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
  echo "ERROR: invalid hash format: ${TARGET_HASH}"
  exit 2
fi

if ! git cat-file -e "${TARGET_HASH}^{commit}" 2>/dev/null; then
  echo "ERROR: commit ${TARGET_HASH} does not exist locally. Try \`git fetch\` first."
  exit 2
fi

echo "[1/5] Resetting working tree to ${TARGET_HASH}..."
git reset --hard "${TARGET_HASH}"

echo "[2/5] Installing dependencies..."
pnpm install --no-frozen-lockfile

echo "[3/5] Skipping database migrations (rollback does not revert schema)..."

echo "[4/5] Building application..."
pnpm --filter @workspace/api-server run build
BASE_PATH=/ pnpm --filter @workspace/fermentos run build

echo "[5/5] Restarting services..."
if ! sudo -n systemctl restart fermentos 2>/tmp/fermentos-sudo-err; then
  echo ""
  echo "ERROR: Could not restart the fermentos service via sudo."
  echo "  sudo said: $(cat /tmp/fermentos-sudo-err 2>/dev/null | head -3)"
  echo ""
  echo "  The most likely cause is a missing NOPASSWD sudoers entry."
  echo "  Re-run the installer once from a shell on the host:"
  echo ""
  echo "    cd \"${INSTALL_DIR}\" && bash install.sh"
  rm -f /tmp/fermentos-sudo-err
  exit 1
fi
rm -f /tmp/fermentos-sudo-err

echo "=== Rollback complete at $(date) ==="
