import { Router } from "express";
import { execSync, spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "fs";
import path from "path";
import os from "os";
import { getConfig as getBackupConfig, runBackup } from "./backup.js";

const router = Router();

// Detect Docker at startup — /.dockerenv is always present inside containers.
// Used to skip systemd-specific checks and wire up a process-exit restart.
const IS_DOCKER = existsSync("/.dockerenv");

// Git metadata baked into the image at build time (Docker only). The container
// has no .git directory at runtime, so we read this file instead of spawning git.
type GitMeta = { hash: string; branch: string; remote: string };
const DOCKER_GIT_META: GitMeta | null = (() => {
  if (!IS_DOCKER) return null;
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "git-meta.json"), "utf8")) as GitMeta;
  } catch {
    return null;
  }
})();


const REPO_ROOT = path.resolve(process.cwd());
const UPDATE_LOG = path.join(REPO_ROOT, "update.log");
const UPDATE_SCRIPT = path.join(REPO_ROOT, "update.sh");
const ROLLBACK_SCRIPT = path.join(REPO_ROOT, "rollback.sh");
const HISTORY_FILE = path.join(REPO_ROOT, "update-history.json");
// Single-flight lock for update + rollback. Both routes refuse to start a new
// run if a fresh lock is on disk; the spawned scripts remove this file on
// exit (success or failure) via a bash `trap`. We treat anything older than
// LOCK_STALE_MS as "the script crashed before clearing it" and let the user
// force-clear from the UI.
const UPDATE_LOCK_FILE = path.join(REPO_ROOT, "update.lock");
const LOCK_STALE_MS = 15 * 60 * 1000;
// The unix user the api-server is running as. Embedded in the sudoers-repair
// script so a copy-paste fix is targeted at the right account.
const SERVICE_USER = os.userInfo().username;
// Cap on retained deploy history. 10 is plenty for a "oh no, undo that
// release" workflow without letting the file grow unbounded over years of
// auto-updates. Oldest entries are evicted FIFO.
const HISTORY_MAX_ENTRIES = 10;

type HistoryEntry = {
  hash: string;
  message: string | null;
  // Author date of the commit itself (when the code was written).
  commitDate: string | null;
  // When this commit started running on this host. The thing you actually
  // care about when picking a rollback target ("which version was live last
  // Tuesday when everything still worked?").
  deployedAt: string;
  branch: string | null;
};

function readHistory(): HistoryEntry[] {
  try {
    if (!existsSync(HISTORY_FILE)) return [];
    const raw = readFileSync(HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw) as { entries?: HistoryEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    // Corrupt file shouldn't break the app — just start a fresh history.
    return [];
  }
}

function writeHistory(entries: HistoryEntry[]) {
  // Atomic write: tmp + rename so a crash mid-write can't leave behind a
  // truncated history file the next boot would silently discard.
  const tmp = `${HISTORY_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify({ entries }, null, 2));
  renameSync(tmp, HISTORY_FILE);
}

// Called once at module load, after RUNNING_HASH is captured. If the most
// recent history entry doesn't match the hash we just booted on, append a
// new entry — that's how we record "v1.2.3 went live at this timestamp"
// without needing to instrument update.sh or rollback.sh.
function recordCurrentDeployIfNew() {
  if (IS_DOCKER) return; // Deploy history isn't meaningful in Docker (no .git, non-persistent container)
  if (RUNNING_HASH === "unknown") return;
  const entries = readHistory();
  const latest = entries[0];
  if (latest && latest.hash === RUNNING_HASH) return;
  let message: string | null = null;
  let commitDate: string | null = null;
  let branch: string | null = null;
  try {
    message = execSync(`git log -1 --format=%s ${RUNNING_HASH}`, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    commitDate = execSync(`git log -1 --format=%ci ${RUNNING_HASH}`, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    // Best-effort metadata — the hash + deployedAt are the only required fields.
  }
  const next: HistoryEntry = {
    hash: RUNNING_HASH,
    message,
    commitDate,
    deployedAt: new Date().toISOString(),
    branch,
  };
  // Newest-first, capped to HISTORY_MAX_ENTRIES.
  const updated = [next, ...entries].slice(0, HISTORY_MAX_ENTRIES);
  try {
    writeHistory(updated);
  } catch {
    // If we can't persist, just continue — history is non-critical.
  }
}

// Captured ONCE at module load — this is the commit the running process was
// built from. `getGitInfo()` reads HEAD on every request, which reflects what's
// on disk right now. If the two diverge, someone pulled new code (manually or
// via update.sh) but didn't restart the service, so the new code isn't live.
// In Docker, DOCKER_GIT_META holds the hash baked in at build time.
const RUNNING_HASH = (() => {
  if (IS_DOCKER) return DOCKER_GIT_META?.hash ?? "unknown";
  try {
    return execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
})();

// Returns null if the service user can run the given sudo command without a
// password prompt, otherwise a short human-readable reason. We use this as a
// pre-flight check on /restart-service and /reboot so the UI can fail fast
// with an actionable error message ("install the sudoers entry by re-running
// install.sh") instead of spawning a doomed `sudo` that hangs forever waiting
// for a password prompt that will never come.
function sudoPreflight(args: string[]): string | null {
  if (IS_DOCKER) return null;
  try {
    execSync(`sudo -n ${args.join(" ")}`, {
      stdio: "pipe",
      timeout: 3000,
      // -v alone would refresh the timestamp; we want to actually verify this
      // specific command is allowed, so we use --list against the real cmd.
      input: "",
    });
    return null;
  } catch (e) {
    // sudo prints "a password is required" or "user X is not allowed" on
    // stderr. Surface a short version of that.
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("password is required") || msg.includes("a terminal is required")) {
      return "passwordless sudo not configured";
    }
    if (msg.includes("not allowed")) {
      return "sudoers entry missing for this command";
    }
    return "sudo pre-flight failed";
  }
}

// Captured ONCE at module load. Exposed on /version so clients can definitively
// detect "the process actually restarted" by watching for this value to change.
// This is more robust than hash comparison: in-place restarts (no code change)
// also need to be detectable, and `RUNNING_HASH !== hash` only flips back to
// equal AFTER a successful restart — if the restart silently fails, the client
// has no way to tell. A changing startedAt is the ground truth.
const PROCESS_STARTED_AT = new Date().toISOString();

// Deferred so RUNNING_HASH is initialized before this runs.
recordCurrentDeployIfNew();

// Boot-time lock cleanup. systemd's default cgroup behaviour kills every
// descendant of the fermentos unit when `systemctl restart fermentos` runs —
// including the detached update.sh / rollback.sh that triggered the restart.
// That means their EXIT trap (which removes update.lock) often doesn't fire.
// Any lock present at boot was, by definition, written by a previous process
// that's no longer running, so we can safely clear it. Without this, the UI
// would show "Update in progress" indefinitely after every successful update
// until the LOCK_STALE_MS timeout, requiring the user to force-clear it.
try {
  const bootLock = readLock();
  if (bootLock) {
    const lockStartedAt = new Date(bootLock.startedAt).getTime();
    const procStartedAt = new Date(PROCESS_STARTED_AT).getTime();
    if (Number.isFinite(lockStartedAt) && lockStartedAt < procStartedAt) {
      // Stale-by-definition: the script that wrote this lock cannot still be
      // running because we (the api-server) have already restarted past it.
      clearLock();
    }
  }
} catch {
  // best-effort — never block boot on lock cleanup
}

// ── Remote hash cache ──────────────────────────────────────────────────────
// `git ls-remote origin HEAD` is a network call to GitHub. The Settings page
// polls /version every 2 seconds during an update, and previously each poll
// blocked the event loop on this network call. We now serve a cached value
// and refresh in the background when it expires. POST /update + POST /rollback
// also kick off a refresh so the user sees up-to-date "available" state.
let remoteHashCache: { hash: string | null; fetchedAt: number } = { hash: null, fetchedAt: 0 };
let remoteHashInFlight: Promise<void> | null = null;
const REMOTE_HASH_TTL_MS = 5 * 60 * 1000;

// In Docker, use the GitHub REST API (no .git directory available at runtime).
// Parses the baked-in remote URL to extract owner/repo, then calls the commits
// API with Accept: application/vnd.github.sha to get just the commit SHA.
async function refreshRemoteHashDockerAsync(): Promise<void> {
  const remote = DOCKER_GIT_META?.remote ?? "";
  const branch = DOCKER_GIT_META?.branch ?? "main";
  const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)/);
  if (!match) {
    remoteHashCache = { ...remoteHashCache, fetchedAt: Date.now() };
    remoteHashInFlight = null;
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://api.github.com/repos/${match[1]}/commits/${branch}`,
      { headers: { Accept: "application/vnd.github.sha" }, signal: controller.signal },
    );
    clearTimeout(timer);
    if (res.ok) {
      const sha = (await res.text()).trim().slice(0, 7);
      if (sha) remoteHashCache = { hash: sha, fetchedAt: Date.now() };
      else remoteHashCache = { ...remoteHashCache, fetchedAt: Date.now() };
    } else {
      remoteHashCache = { ...remoteHashCache, fetchedAt: Date.now() };
    }
  } catch {
    remoteHashCache = { ...remoteHashCache, fetchedAt: Date.now() };
  }
  remoteHashInFlight = null;
}

function refreshRemoteHashAsync(): Promise<void> {
  if (remoteHashInFlight) return remoteHashInFlight;
  if (IS_DOCKER) {
    remoteHashInFlight = refreshRemoteHashDockerAsync();
    return remoteHashInFlight;
  }
  remoteHashInFlight = new Promise<void>((resolve) => {
    const proc = spawn("git", ["ls-remote", "origin", "HEAD"], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    // 8s timeout — homelab WANs can be slow but we shouldn't block forever.
    const timer = setTimeout(() => proc.kill("SIGTERM"), 8000);
    proc.stdout?.on("data", (b: Buffer) => { out += b.toString(); });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        const h = out.trim().split(/\s+/)[0]?.slice(0, 7) ?? null;
        // Only overwrite cache on a successful fetch — keep the last good
        // value if today's network call fails.
        if (h) remoteHashCache = { hash: h, fetchedAt: Date.now() };
        else remoteHashCache = { ...remoteHashCache, fetchedAt: Date.now() };
      } else {
        // Record the attempt time so we don't busy-retry, but keep last hash.
        remoteHashCache = { ...remoteHashCache, fetchedAt: Date.now() };
      }
      remoteHashInFlight = null;
      resolve();
    });
    proc.on("error", () => {
      clearTimeout(timer);
      remoteHashCache = { ...remoteHashCache, fetchedAt: Date.now() };
      remoteHashInFlight = null;
      resolve();
    });
  });
  return remoteHashInFlight;
}

function getRemoteHashCached(): string | null {
  if (Date.now() - remoteHashCache.fetchedAt > REMOTE_HASH_TTL_MS) {
    // Don't await — serve the stale value, refresh in background.
    refreshRemoteHashAsync().catch(() => {});
  }
  return remoteHashCache.hash;
}

// Kick off the first fetch at startup so the UI has data on the first poll.
refreshRemoteHashAsync().catch(() => {});

// ── Sudo-OK cache ──────────────────────────────────────────────────────────
// `sudo -n --list ...` is fast but still spawns a process. Cache for 30s so
// the version-poll loop doesn't fork sudo on every tick.
let sudoOkCache: { ok: boolean; fetchedAt: number } | null = null;
const SUDO_OK_TTL_MS = 30 * 1000;

// Returns null in Docker (not applicable), true/false on bare-metal.
function getSudoOkCached(): boolean | null {
  if (IS_DOCKER) return null;
  if (sudoOkCache && Date.now() - sudoOkCache.fetchedAt < SUDO_OK_TTL_MS) {
    return sudoOkCache.ok;
  }
  const ok =
    sudoPreflight(["--list", "/usr/bin/systemctl", "restart", "fermentos"]) === null &&
    sudoPreflight(["--list", "/sbin/reboot"]) === null;
  sudoOkCache = { ok, fetchedAt: Date.now() };
  return ok;
}

function invalidateSudoOkCache() {
  sudoOkCache = null;
}

// ── Update lock ────────────────────────────────────────────────────────────
type LockInfo = { kind: "update" | "rollback"; startedAt: string; hash?: string };

function readLock(): LockInfo | null {
  try {
    if (!existsSync(UPDATE_LOCK_FILE)) return null;
    const raw = readFileSync(UPDATE_LOCK_FILE, "utf8");
    return JSON.parse(raw) as LockInfo;
  } catch {
    return null;
  }
}

function writeLock(info: LockInfo) {
  const tmp = `${UPDATE_LOCK_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(info));
  renameSync(tmp, UPDATE_LOCK_FILE);
}

function clearLock() {
  try {
    if (existsSync(UPDATE_LOCK_FILE)) unlinkSync(UPDATE_LOCK_FILE);
  } catch {
    // best-effort
  }
}

function getLockState(): (LockInfo & { ageMs: number; stale: boolean }) | null {
  const l = readLock();
  if (!l) return null;
  const ageMs = Date.now() - new Date(l.startedAt).getTime();
  return { ...l, ageMs, stale: ageMs > LOCK_STALE_MS };
}

function getGitInfo() {
  // In Docker there is no .git directory — use the metadata baked in at build time.
  if (IS_DOCKER) {
    const hash = DOCKER_GIT_META?.hash ?? "unknown";
    const branch = DOCKER_GIT_META?.branch ?? "unknown";
    const remoteHash = getRemoteHashCached();
    return {
      hash,
      date: null,
      message: null,
      branch,
      updateAvailable: remoteHash !== null && remoteHash !== hash,
      runningHash: RUNNING_HASH,
      restartPending: false,
      startedAt: PROCESS_STARTED_AT,
      sudoOk: null,
      isDocker: true,
      lock: getLockState(),
    };
  }

  try {
    const hash = execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    const date = execSync("git log -1 --format=%ci", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    const message = execSync("git log -1 --format=%s", { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    // `symbolic-ref` returns the branch ref or fails on detached HEAD (post-
    // rollback state). `rev-parse --abbrev-ref HEAD` would silently return
    // the misleading string "HEAD" in that case.
    let branch = "(detached)";
    try {
      branch = execSync("git symbolic-ref --short -q HEAD", { cwd: REPO_ROOT, encoding: "utf8" }).trim() || "(detached)";
    } catch { /* detached HEAD */ }
    const remoteHash = getRemoteHashCached();
    return {
      hash,
      date,
      message,
      branch,
      updateAvailable: remoteHash !== null && remoteHash !== hash,
      runningHash: RUNNING_HASH,
      restartPending: RUNNING_HASH !== "unknown" && hash !== "unknown" && RUNNING_HASH !== hash,
      startedAt: PROCESS_STARTED_AT,
      sudoOk: getSudoOkCached(),
      isDocker: IS_DOCKER,
      lock: getLockState(),
    };
  } catch {
    return {
      hash: "unknown",
      date: null,
      message: null,
      branch: "unknown",
      updateAvailable: false,
      runningHash: RUNNING_HASH,
      restartPending: false,
      startedAt: PROCESS_STARTED_AT,
      sudoOk: getSudoOkCached(),
      isDocker: IS_DOCKER,
      lock: getLockState(),
    };
  }
}

// GET /api/admin/version
router.get("/version", (_req, res) => {
  const git = getGitInfo();
  res.json(git);
});

// POST /api/admin/update-lock/clear
// Force-clear a stale lock. Refuses unless the lock is past LOCK_STALE_MS so
// users can't accidentally race a healthy update by spamming this.
router.post("/update-lock/clear", (req, res) => {
  const state = getLockState();
  if (!state) {
    res.json({ cleared: false, message: "No lock to clear." });
    return;
  }
  if (!state.stale) {
    const minutes = Math.ceil((LOCK_STALE_MS - state.ageMs) / 60000);
    res.status(409).json({
      error: `Lock is only ${Math.floor(state.ageMs / 1000)}s old — refusing to clear a likely-active ${state.kind}. Try again in ${minutes} more minute(s) if it's actually stuck.`,
    });
    return;
  }
  req.log.warn({ kind: state.kind, ageMs: state.ageMs }, "Force-clearing stale update lock");
  clearLock();
  res.json({ cleared: true, message: `Cleared stale ${state.kind} lock.` });
});

// GET /api/admin/repair-script
// Returns a self-contained bash script the user can pipe into sudo to
// (re)install the NOPASSWD sudoers entry without re-running install.sh.
// This is the "no shell after install" escape hatch for the one operation
// the running api-server can't do itself (write to /etc/sudoers.d).
router.get("/repair-script", (_req, res) => {
  // Defend the SERVICE_USER value: usernames are well-bounded on Linux. If
  // the captured value somehow has shell metachars, refuse rather than
  // generate a script that runs them as root.
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(SERVICE_USER)) {
    res.status(500).type("text/plain").send(
      `# Cannot generate a safe repair script: detected service user '${SERVICE_USER}'\n# does not match the expected linux username format. Re-run install.sh manually.\n`,
    );
    return;
  }
  const sudoersLine = `${SERVICE_USER} ALL=(root) NOPASSWD: /bin/systemctl restart fermentos, /usr/bin/systemctl restart fermentos, /bin/systemctl daemon-reload, /usr/bin/systemctl daemon-reload, /bin/systemctl reboot, /usr/bin/systemctl reboot, /sbin/reboot, /usr/sbin/reboot`;
  const script = `#!/usr/bin/env bash
set -euo pipefail

# FermentOS — sudoers repair (generated by /api/admin/repair-script).
# Run with: curl -sSL <this-url> | sudo bash
# Or save to a file and: sudo bash fermentos-repair.sh

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: must run as root (try: sudo bash $0 — or pipe through 'sudo bash')" >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
cat > "$TMP" <<'SUDOERS'
# FermentOS — installed by /api/admin/repair-script. Allows the service user
# to restart the fermentos unit, reload systemd, and reboot the host from
# the in-app admin UI without a password prompt.
${sudoersLine}
SUDOERS
chmod 0440 "$TMP"
if ! visudo -cf "$TMP" >/dev/null; then
  echo "ERROR: generated sudoers file failed visudo validation. Aborting." >&2
  exit 1
fi
install -o root -g root -m 0440 "$TMP" /etc/sudoers.d/fermentos
echo "OK: /etc/sudoers.d/fermentos installed for user '${SERVICE_USER}'."
echo "    Reload the Settings page in your browser — the 'Repair install' card should disappear."
`;
  // Invalidate the cached sudo-OK flag so the next /version poll re-checks
  // immediately rather than waiting for the 30s TTL. (Yes, technically the
  // user hasn't run the script yet — but a) they're about to, and b) we'd
  // rather show "ok" 30s late than show "broken" 30s after it's fixed.)
  invalidateSudoOkCache();
  res.type("text/plain").send(script);
});

// GET /api/admin/sudoers-line
// Returns the raw sudoers line for users who'd rather copy-paste the line
// into `sudo visudo -f /etc/sudoers.d/fermentos` themselves.
router.get("/sudoers-line", (_req, res) => {
  res.type("text/plain").send(
    `${SERVICE_USER} ALL=(root) NOPASSWD: /bin/systemctl restart fermentos, /usr/bin/systemctl restart fermentos, /bin/systemctl daemon-reload, /usr/bin/systemctl daemon-reload, /bin/systemctl reboot, /usr/bin/systemctl reboot, /sbin/reboot, /usr/sbin/reboot`,
  );
});

// POST /api/admin/restart-service
// Restart just the fermentos systemd service (no full host reboot). Used when
// new code is on disk but the running process is older — see `restartPending`
// on the version endpoint.
router.post("/restart-service", (req, res) => {
  req.log.warn("Service restart requested");

  if (IS_DOCKER) {
    // In Docker there is no systemd. Exit cleanly and rely on the container's
    // restart policy (unless-stopped) to bring the process back up.
    res.json({ started: true, message: "Container restart scheduled in ~1 second." });
    setTimeout(() => process.exit(0), 1000);
    return;
  }

  // Fail fast if the sudoers entry isn't in place — otherwise the spawned
  // `sudo systemctl restart` would hang forever waiting for a password.
  const sudoErr = sudoPreflight(["--list", "/usr/bin/systemctl", "restart", "fermentos"]);
  if (sudoErr) {
    req.log.error({ sudoErr }, "Restart blocked: sudo pre-flight failed");
    res.status(412).json({
      error:
        `Cannot restart service: ${sudoErr}. The api-server's user needs a NOPASSWD sudoers entry for \`systemctl restart fermentos\`. Re-run \`bash install.sh\` once from a shell on the host to install it (this is a one-time fix).`,
    });
    return;
  }
  // 1s delay so the response flushes before systemd kills us. Detached + new
  // session so the restart command survives even if systemd kills our cgroup
  // before sudo finishes talking to systemd. Stderr is appended to update.log
  // so silent failures (missing sudoers entry, etc.) become visible to the
  // user via the existing log tail in the Settings UI.
  const child = spawn(
    "bash",
    [
      "-c",
      `sleep 1 && { echo "[restart] $(date) — sudo systemctl restart fermentos"; sudo systemctl restart fermentos; } >> "${UPDATE_LOG}" 2>&1`,
    ],
    {
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();
  res.json({ started: true, message: "Service restart scheduled in ~1 second." });
});

// GET /api/admin/update-log
router.get("/update-log", (req, res) => {
  try {
    if (!existsSync(UPDATE_LOG)) return res.json({ log: null });
    const lines = readFileSync(UPDATE_LOG, "utf8").split("\n");
    const last200 = lines.slice(-200).join("\n");
    return res.json({ log: last200 });
  } catch {
    return res.json({ log: null });
  }
});

// POST /api/admin/update
router.post("/update", async (req, res) => {
  if (!existsSync(UPDATE_SCRIPT)) {
    return res.status(404).json({ error: "update.sh not found in project root" });
  }

  // Single-flight check FIRST — before any expensive work like the pre-update
  // backup. Otherwise a fast double-click would run two parallel pg_dumps
  // before the second request reached the lock check below the backup. The
  // duplicate lock check after the backup is intentional defense-in-depth in
  // case a slow backup overlaps with another caller's lock.
  const earlyLock = getLockState();
  if (earlyLock && !earlyLock.stale) {
    return res.status(409).json({
      error: `An ${earlyLock.kind} is already in progress (started ${Math.floor(earlyLock.ageMs / 1000)}s ago). Wait for it to finish before starting another.`,
      lock: earlyLock,
    });
  }

  // Optional pre-update backup. If the user enabled it, we must succeed
  // before kicking off the update — otherwise the safety net isn't there.
  try {
    const cfg = await getBackupConfig();
    const target = cfg.backupBeforeUpdate;
    if (target === "sftp" || target === "local") {
      req.log.info({ target }, "Running pre-update backup");
      const result = await runBackup(target);
      if (!result.ok) {
        return res.status(500).json({
          error: `Pre-update backup failed: ${result.message}. Update aborted to keep your data safe — fix the backup target or disable pre-update backup, then try again.`,
        });
      }
      req.log.info({ target, message: result.message }, "Pre-update backup complete");
    }
  } catch (err) {
    return res.status(500).json({
      error: `Pre-update backup error: ${err instanceof Error ? err.message : String(err)}. Update aborted.`,
    });
  }

  // Single-flight: refuse to start a second update/rollback while one is
  // still in flight. The script clears the lock on exit (success or fail);
  // if it crashes hard the lock ages out after LOCK_STALE_MS and the user
  // can force-clear it from the UI.
  const existingLock = getLockState();
  if (existingLock && !existingLock.stale) {
    return res.status(409).json({
      error: `An ${existingLock.kind} is already in progress (started ${Math.floor(existingLock.ageMs / 1000)}s ago). Wait for it to finish before starting another.`,
      lock: existingLock,
    });
  }

  // Reset file permission changes and any other local modifications so
  // git pull always succeeds. chmod +x previously caused fileMode drift.
  try {
    execSync("git config core.fileMode false", { cwd: REPO_ROOT, stdio: "pipe" });
    execSync("git reset --hard HEAD", { cwd: REPO_ROOT, stdio: "pipe" });
    req.log.info("git reset completed before update");
  } catch (err) {
    req.log.warn({ err }, "git reset before update failed — continuing anyway");
  }

  // Write the lock BEFORE spawning so a fast retry can't race past the check.
  writeLock({ kind: "update", startedAt: new Date().toISOString() });
  // Refresh the cached remote hash in the background so the next /version
  // poll reflects the new state without waiting for the 5-min TTL.
  refreshRemoteHashAsync().catch(() => {});

  // Spawn detached so it survives the API server restart
  const child = spawn("bash", [UPDATE_SCRIPT], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  req.log.info("Update process started (pid detached)");
  return res.json({ started: true, message: "Update started. The app will restart automatically when complete." });
});

// GitHub repo this install was cloned from. Hardcoded rather than parsed from
// `git remote get-url origin` because forks shouldn't accidentally hit the
// upstream's release feed (and the URL parse adds a failure mode for offline
// installs). If you fork FermentOS and want your own release notes here,
// change this string.
const GITHUB_REPO = "highaltidude/FermentOS";

type GithubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
};

// In-memory cache to stay well under GitHub's 60-req/hr unauthenticated rate
// limit. Settings page mounts and "Check for updates" both hit this; without
// caching a user spamming refresh could lock themselves out for an hour.
let releaseCache: { fetchedAt: number; data: GithubRelease[]; error: string | null } | null = null;
const RELEASE_CACHE_TTL_MS = 5 * 60 * 1000;

async function getReleases(): Promise<{ data: GithubRelease[]; error: string | null; cachedAt: number }> {
  const now = Date.now();
  if (releaseCache && now - releaseCache.fetchedAt < RELEASE_CACHE_TTL_MS) {
    return { data: releaseCache.data, error: releaseCache.error, cachedAt: releaseCache.fetchedAt };
  }
  try {
    // 5s timeout — release notes are nice-to-have, never block the UI.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "FermentOS-self-host" },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const error = res.status === 403
        ? "GitHub API rate limit reached. Try again in a few minutes."
        : `GitHub API returned HTTP ${res.status}`;
      releaseCache = { fetchedAt: now, data: [], error };
      return { data: [], error, cachedAt: now };
    }
    const raw = (await res.json()) as GithubRelease[];
    // Drop drafts (private to repo maintainers) but keep prereleases — homelab
    // users may explicitly opt into running them.
    const data = Array.isArray(raw) ? raw.filter((r) => !r.draft) : [];
    releaseCache = { fetchedAt: now, data, error: null };
    return { data, error: null, cachedAt: now };
  } catch (e) {
    const error = e instanceof Error && e.name === "AbortError"
      ? "GitHub API timed out (no internet?)"
      : `Could not reach GitHub: ${e instanceof Error ? e.message : String(e)}`;
    releaseCache = { fetchedAt: now, data: [], error };
    return { data: [], error, cachedAt: now };
  }
}

// GET /api/admin/release-notes
// Returns the most recent GitHub Releases for the upstream repo, lightly
// pre-processed: each entry includes whether it's "newer" than the currently
// running commit (best-effort: we compare tag dates to the running commit's
// commit date since we can't resolve tags → SHAs without a fetch).
router.get("/release-notes", async (_req, res) => {
  const { data, error, cachedAt } = await getReleases();
  let runningCommitDate: string | null = null;
  try {
    runningCommitDate = execSync(`git log -1 --format=%cI ${RUNNING_HASH}`, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    // running commit not in local history (shallow clone?) — skip the "newer than current" flag
  }
  const entries = data.map((r) => ({
    tag: r.tag_name,
    name: r.name,
    body: r.body,
    url: r.html_url,
    publishedAt: r.published_at,
    prerelease: r.prerelease,
    isNewerThanCurrent:
      !!runningCommitDate && !!r.published_at && new Date(r.published_at).getTime() > new Date(runningCommitDate).getTime(),
  }));
  res.json({ entries, error, cachedAt, repo: GITHUB_REPO });
});

// GET /api/admin/update-history
// Returns the last N deploys (newest first), with a flag marking which one
// is currently running. Used by the Settings UI to render the rollback list.
router.get("/update-history", (_req, res) => {
  const entries = readHistory();
  res.json({
    current: RUNNING_HASH,
    entries: entries.map((e) => ({ ...e, isCurrent: e.hash === RUNNING_HASH })),
  });
});

// POST /api/admin/rollback  body: { hash: string }
// Rolls the working tree back to the given commit hash and rebuilds. Same
// fail-fast sudo preflight as /restart-service — without NOPASSWD, the
// rollback script's final `sudo systemctl restart fermentos` would hang.
router.post("/rollback", (req, res) => {
  const body = (req.body ?? {}) as { hash?: unknown };
  const hash = typeof body.hash === "string" ? body.hash.trim() : "";
  // Strict whitelist — git short/full SHAs are 7–40 hex chars. Anything else
  // could try to inject shell metachars or git refspecs that escape the
  // intended commit (e.g. `master --` or `HEAD; rm -rf /`).
  if (!/^[0-9a-fA-F]{7,40}$/.test(hash)) {
    res.status(400).json({ error: "Invalid hash. Must be a 7–40 character hex git SHA." });
    return;
  }
  if (hash === RUNNING_HASH) {
    res.status(400).json({ error: "Already running that version — nothing to roll back." });
    return;
  }
  if (!existsSync(ROLLBACK_SCRIPT)) {
    res.status(404).json({ error: "rollback.sh not found in project root" });
    return;
  }
  // Confirm the commit actually exists locally before kicking off — better
  // to fail fast in the API than after step 1/5 of the script.
  try {
    execSync(`git cat-file -e ${hash}^{commit}`, { cwd: REPO_ROOT, stdio: "ignore" });
  } catch {
    res.status(404).json({
      error: `Commit ${hash} not found in local git history. The commit may have been garbage-collected, or you may need to fetch from origin first.`,
    });
    return;
  }
  if (IS_DOCKER) {
    res.status(409).json({ error: "Rollback is not available in Docker. The source code is baked into the image — to roll back, rebuild from an earlier commit." });
    return;
  }
  const sudoErr = sudoPreflight(["--list", "/usr/bin/systemctl", "restart", "fermentos"]);
  if (sudoErr) {
    req.log.error({ sudoErr }, "Rollback blocked: sudo pre-flight failed");
    res.status(412).json({
      error: `Cannot roll back: ${sudoErr}. Re-run \`bash install.sh\` once from a shell on the host to install the sudoers entry (this is a one-time fix).`,
    });
    return;
  }

  // Same single-flight check as /update.
  const existingLock = getLockState();
  if (existingLock && !existingLock.stale) {
    res.status(409).json({
      error: `An ${existingLock.kind} is already in progress (started ${Math.floor(existingLock.ageMs / 1000)}s ago). Wait for it to finish before starting another.`,
      lock: existingLock,
    });
    return;
  }

  req.log.warn({ hash }, "Rollback requested");
  writeLock({ kind: "rollback", startedAt: new Date().toISOString(), hash });
  // Detached so it survives the api-server restart that happens at step 5.
  const child = spawn("bash", [ROLLBACK_SCRIPT, hash], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  res.json({ started: true, message: `Rollback to ${hash} started.` });
});

// POST /api/admin/reboot
// Reboot the host machine. Requires that the user running the API server has
// passwordless `sudo reboot` configured (the install.sh sudoers entry already
// covers `systemctl restart fermentos` — for reboot you'll want a similar
// NOPASSWD line for `/sbin/reboot`).
router.post("/reboot", (req, res) => {
  req.log.warn("Host reboot requested");

  if (IS_DOCKER) {
    res.status(409).json({ error: "Host reboot is not available in Docker." });
    return;
  }

  // Same fail-fast logic as /restart-service. Without the sudoers entry,
  // `sudo reboot` would hang and the user would just see the "rebooting"
  // spinner forever, never knowing why the host never went down.
  const sudoErr = sudoPreflight(["--list", "/sbin/reboot"]);
  if (sudoErr) {
    req.log.error({ sudoErr }, "Reboot blocked: sudo pre-flight failed");
    res.status(412).json({
      error:
        `Cannot reboot host: ${sudoErr}. The api-server's user needs a NOPASSWD sudoers entry for \`/sbin/reboot\`. Re-run \`bash install.sh\` once from a shell on the host to install it (this is a one-time fix).`,
    });
    return;
  }
  // Defer the reboot a couple seconds so this response can flush to the client
  // before the kernel pulls the rug out. Detached + unref so the API server
  // process exiting (or being signalled) doesn't kill the scheduled reboot.
  const child = spawn("bash", ["-c", "sleep 2 && sudo reboot"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  res.json({ started: true, message: "Reboot scheduled in ~2 seconds." });
});

export default router;
