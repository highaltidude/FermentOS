#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  FermentOS — Update Script
# ─────────────────────────────────────────────

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${INSTALL_DIR}/update.log"
LOCK_FILE="${INSTALL_DIR}/update.lock"

exec > >(tee -a "$LOG_FILE") 2>&1

# The api-server route writes update.lock before spawning us; we clear it on
# exit so the UI can surface "in progress" while we run and "done" the moment
# we exit. Trap covers all exit paths — success, errors, signals.
trap 'rm -f "$LOCK_FILE"' EXIT

echo ""
echo "=== Update started at $(date) ==="

cd "$INSTALL_DIR"

# Ignore file permission changes so chmod never blocks a future pull.
git config core.fileMode false
echo "  Resetting local changes before pull..."
git reset --hard HEAD

echo "[1/5] Pulling latest changes from GitHub..."
# Recover from a detached HEAD (the state left behind by a rollback). Without
# this, `git pull --ff-only` fails with "You are not currently on a branch."
# and the update aborts cryptically. We try `main` first, then `master`, so
# both upstream conventions work.
if ! git symbolic-ref -q HEAD >/dev/null; then
  echo "  Detached HEAD detected — checking out a branch to resume updates."
  if git show-ref --verify --quiet refs/heads/main; then
    git checkout main
  elif git show-ref --verify --quiet refs/heads/master; then
    git checkout master
  else
    echo "ERROR: cannot find a 'main' or 'master' branch to check out from a detached HEAD." >&2
    exit 1
  fi
fi
PREVIOUS_HASH=$(git rev-parse --short HEAD)
echo "  Resetting local changes before pull..."
git reset --hard HEAD
git pull --ff-only

echo "[2/5] Installing dependencies..."
pnpm install --no-frozen-lockfile

echo "[3/5] Running database migrations..."
set -a
# shellcheck disable=SC1091
source "${INSTALL_DIR}/.env"
set +a
pnpm --filter @workspace/db run push

build_and_rollback_on_failure() {
  if ! { pnpm --filter @workspace/api-server run build && \
         BASE_PATH=/ pnpm --filter @workspace/fermentos run build; }; then
    echo ""
    echo "ERROR: Build failed — automatic rollback to $PREVIOUS_HASH is starting..."
    bash rollback.sh "$PREVIOUS_HASH"
    exit 1
  fi
}

echo "[4/5] Building application..."
build_and_rollback_on_failure

echo "[5/5] Restarting services..."
# `sudo -n` runs non-interactively — it succeeds only if a NOPASSWD sudoers
# entry exists for this exact command. If it doesn't, sudo would normally
# block waiting for a password we can't provide (no TTY when this script is
# invoked by the api-server), which is what historically made the in-app
# Update bar freeze at 95%. Bail out early with an actionable message instead.
if ! sudo -n systemctl restart fermentos 2>/tmp/fermentos-sudo-err; then
  echo ""
  echo "ERROR: Could not restart the fermentos service via sudo."
  echo "  sudo said: $(cat /tmp/fermentos-sudo-err 2>/dev/null | head -3)"
  echo ""
  echo "  The most likely cause is a missing NOPASSWD sudoers entry. Re-run"
  echo "  the installer once from a shell to install it:"
  echo ""
  echo "    cd \"${INSTALL_DIR}\" && bash install.sh"
  echo ""
  echo "  After that, the in-app Update / Restart / Reboot buttons will work."
  rm -f /tmp/fermentos-sudo-err
  exit 1
fi
rm -f /tmp/fermentos-sudo-err

echo "=== Update complete at $(date) ==="
