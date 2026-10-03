import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "fs";
import path from "path";

// Single-flight lock for update + rollback. Both routes refuse to start a new
// run if a fresh lock is on disk; the spawned scripts remove this file on
// exit (success or failure) via a bash `trap`. We treat anything older than
// LOCK_STALE_MS as "the script crashed before clearing it" and let the user
// force-clear from the UI. The HTTPS job also checks it, since both it and an
// update install packages and restart services.
export const UPDATE_LOCK_FILE = path.join(path.resolve(process.cwd()), "update.lock");
export const LOCK_STALE_MS = 15 * 60 * 1000;

export type LockInfo = { kind: "update" | "rollback"; startedAt: string; hash?: string };

export function readLock(): LockInfo | null {
  try {
    if (!existsSync(UPDATE_LOCK_FILE)) return null;
    const raw = readFileSync(UPDATE_LOCK_FILE, "utf8");
    return JSON.parse(raw) as LockInfo;
  } catch {
    return null;
  }
}

export function writeLock(info: LockInfo) {
  const tmp = `${UPDATE_LOCK_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(info));
  renameSync(tmp, UPDATE_LOCK_FILE);
}

export function clearLock() {
  try {
    if (existsSync(UPDATE_LOCK_FILE)) unlinkSync(UPDATE_LOCK_FILE);
  } catch {
    // best-effort
  }
}

export type LockState = LockInfo & { ageMs: number; stale: boolean };

export function getLockState(): LockState | null {
  const l = readLock();
  if (!l) return null;
  const ageMs = Date.now() - new Date(l.startedAt).getTime();
  return { ...l, ageMs, stale: ageMs > LOCK_STALE_MS };
}

// 409 body for "an update or rollback already holds the lock".
export function lockBusyBody(lock: LockState) {
  return {
    error: `An ${lock.kind} is already in progress (started ${Math.floor(lock.ageMs / 1000)}s ago). Wait for it to finish before starting another.`,
    lock,
  };
}
