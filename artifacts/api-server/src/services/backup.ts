import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import cron, { type ScheduledTask } from "node-cron";
import SftpClient from "ssh2-sftp-client";
import { logger } from "../lib/logger.js";
import { getConfigValue, setConfigValue } from "./appConfig.js";

export type SftpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath: string;
  prefix: string;
};

export type BackupTarget = "sftp" | "local";

export type BackupConfig = {
  sftp: Partial<SftpConfig>;
  schedule: "none" | "daily" | "weekly";
  /** Local directory where backups are written when target = "local". */
  localPath?: string;
  /** Days to keep backups. 0 / undefined = keep forever. Clamped 0–60 when set. */
  retentionDays?: number;
  /** Run a backup right before applying a software update. */
  backupBeforeUpdate?: "none" | "sftp" | "local";
};

export type BackupStatus = {
  lastRun: string | null;
  lastResult: "success" | "error" | null;
  lastMessage: string | null;
};

const CONFIG_KEY = "backup_config";
const STATUS_KEY = "backup_status";
// Mirrors the uploads convention in lib/paths.ts: cwd is the repo root under
// systemd and /app in the container, so one expression is correct in both. It
// must not come from os.homedir() — the image creates the service account with
// `adduser --system`, which leaves HOME as /nonexistent, so every local backup
// died with EACCES before a single byte was written (#155).
export const DEFAULT_LOCAL_PATH = path.resolve(process.cwd(), "data/backups");

// The literal marker Debian's `adduser --system` leaves as a home directory.
const NONEXISTENT_HOME_PREFIX = "/nonexistent";

const EMPTY_STATUS: BackupStatus = { lastRun: null, lastResult: null, lastMessage: null };

function defaultConfig(): BackupConfig {
  return { sftp: {}, schedule: "none", localPath: DEFAULT_LOCAL_PATH, retentionDays: 0, backupBeforeUpdate: "none" };
}

/** The directory local backups are written to and listed from. */
export function localBackupDir(cfg: BackupConfig): string {
  return cfg.localPath || DEFAULT_LOCAL_PATH;
}

export async function getConfig(): Promise<BackupConfig> {
  const value = await getConfigValue(CONFIG_KEY);
  if (!value) return defaultConfig();
  try {
    const parsed = JSON.parse(value) as Partial<BackupConfig>;
    return { ...defaultConfig(), ...parsed, sftp: parsed.sftp ?? {} };
  } catch { return defaultConfig(); }
}

export async function saveConfig(cfg: BackupConfig) {
  await setConfigValue(CONFIG_KEY, JSON.stringify(cfg));
}

export async function getStatus(): Promise<BackupStatus> {
  const value = await getConfigValue(STATUS_KEY);
  if (!value) return EMPTY_STATUS;
  try { return JSON.parse(value) as BackupStatus; } catch { return EMPTY_STATUS; }
}

async function saveStatus(s: BackupStatus) {
  await setConfigValue(STATUS_KEY, JSON.stringify(s));
}

export async function runDump(): Promise<string> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  const tmpFile = path.join(os.tmpdir(), `fermentos_${Date.now()}.sql`);
  execSync(`pg_dump "${dbUrl}" -f "${tmpFile}"`, { timeout: 60000 });
  return tmpFile;
}

export function backupFilename(prefix?: string): string {
  return `${prefix || "fermentos"}_${new Date().toISOString().replace(/[:.]/g, "-")}.sql`;
}

/** Matches the files backupFilename() produces for a given prefix. */
function backupFileRegex(prefix: string): RegExp {
  return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_.*\\.sql$`);
}

async function pushToSftp(localFile: string, cfg: BackupConfig): Promise<string> {
  const sftp = cfg.sftp;
  if (!sftp.host || !sftp.username) throw new Error("SFTP host and username are required");
  const client = new SftpClient();
  await client.connect({
    host: sftp.host,
    port: sftp.port ?? 22,
    username: sftp.username,
    password: sftp.password,
  });
  const filename = backupFilename(sftp.prefix);
  const remotePath = sftp.remotePath ? `${sftp.remotePath.replace(/\/$/, "")}/${filename}` : `/${filename}`;
  try {
    await client.put(localFile, remotePath);
    if (cfg.retentionDays && cfg.retentionDays > 0) {
      try {
        await pruneSftp(client, sftp, cfg.retentionDays);
      } catch (e) {
        logger.warn({ err: e }, "SFTP prune failed (backup itself succeeded)");
      }
    }
  } finally {
    await client.end();
  }
  return remotePath;
}

async function pushToLocal(localFile: string, cfg: BackupConfig): Promise<string> {
  const dir = localBackupDir(cfg);
  fs.mkdirSync(dir, { recursive: true });
  const filename = backupFilename(cfg.sftp.prefix);
  const dest = path.join(dir, filename);
  fs.copyFileSync(localFile, dest);
  if (cfg.retentionDays && cfg.retentionDays > 0) {
    try {
      pruneLocal(dir, cfg.sftp.prefix || "fermentos", cfg.retentionDays);
    } catch (e) {
      logger.warn({ err: e }, "Local prune failed (backup itself succeeded)");
    }
  }
  return dest;
}

function pruneLocal(dir: string, prefix: string, retentionDays: number): number {
  if (!fs.existsSync(dir)) return 0;
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const re = backupFileRegex(prefix);
  let deleted = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!re.test(name)) continue;
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(full);
        deleted += 1;
      }
    } catch { /* ignore individual file errors */ }
  }
  if (deleted > 0) logger.info({ dir, deleted, retentionDays }, "Pruned old local backups");
  return deleted;
}

async function pruneSftp(client: SftpClient, sftp: Partial<SftpConfig>, retentionDays: number): Promise<number> {
  const remoteDir = sftp.remotePath || "/";
  const re = backupFileRegex(sftp.prefix || "fermentos");
  const cutoffMs = Date.now() - retentionDays * 86_400_000;
  let deleted = 0;
  const list = await client.list(remoteDir);
  for (const item of list) {
    if (item.type !== "-" || !re.test(item.name)) continue;
    if (item.modifyTime < cutoffMs) {
      const full = `${remoteDir.replace(/\/$/, "")}/${item.name}`;
      try {
        await client.delete(full);
        deleted += 1;
      } catch { /* ignore individual file errors */ }
    }
  }
  if (deleted > 0) logger.info({ remoteDir, deleted, retentionDays }, "Pruned old SFTP backups");
  return deleted;
}

export async function runBackup(target: BackupTarget = "sftp"): Promise<{ ok: boolean; message: string }> {
  const cfg = await getConfig();
  let tmpFile: string | null = null;
  try {
    tmpFile = await runDump();
    const dest = target === "local" ? await pushToLocal(tmpFile, cfg) : await pushToSftp(tmpFile, cfg);
    const msg = target === "local" ? `Saved to ${dest}` : `Uploaded to ${dest}`;
    await saveStatus({ lastRun: new Date().toISOString(), lastResult: "success", lastMessage: msg });
    logger.info({ dest, target }, "Backup succeeded");
    return { ok: true, message: msg };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await saveStatus({ lastRun: new Date().toISOString(), lastResult: "error", lastMessage: msg });
    logger.error({ err, target }, "Backup failed");
    return { ok: false, message: msg };
  } finally {
    if (tmpFile) try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

async function runScheduledBackup(): Promise<void> {
  const cfg = await getConfig();

  // Try SFTP first if host is configured
  if (cfg.sftp?.host && cfg.sftp?.username) {
    const result = await runBackup("sftp");
    if (result.ok) {
      logger.info("Scheduled backup succeeded via SFTP");
      return;
    }
    // SFTP failed — fall through to local
    logger.warn({ message: result.message }, "Scheduled SFTP backup failed, falling back to local");

    // Save an interim status so the UI shows what happened
    await saveStatus({
      lastRun: new Date().toISOString(),
      lastResult: "error",
      lastMessage: `SFTP failed (${result.message}) — attempting local fallback`,
    });
  }

  // No SFTP configured or SFTP failed — run local
  const localResult = await runBackup("local");
  if (localResult.ok) {
    // Overwrite status with a message that explains what happened
    const usedFallback = cfg.sftp?.host && cfg.sftp?.username;
    await saveStatus({
      lastRun: new Date().toISOString(),
      lastResult: "success",
      lastMessage: usedFallback
        ? `SFTP unavailable — ${localResult.message}`
        : localResult.message,
    });
    logger.info({ message: localResult.message }, "Scheduled backup succeeded via local");
  } else {
    await saveStatus({
      lastRun: new Date().toISOString(),
      lastResult: "error",
      lastMessage: `Both SFTP and local backup failed: ${localResult.message}`,
    });
    logger.error({ message: localResult.message }, "Scheduled backup failed on both SFTP and local");
  }
}

let activeCronJob: ScheduledTask | null = null;

function cronExpression(schedule: BackupConfig["schedule"]): string | null {
  if (schedule === "daily") return "0 2 * * *";
  if (schedule === "weekly") return "0 2 * * 0";
  return null;
}

export function startScheduler(schedule: BackupConfig["schedule"]) {
  if (activeCronJob) { activeCronJob.stop(); activeCronJob = null; }
  const expr = cronExpression(schedule);
  if (!expr) { logger.info("Backup scheduler disabled"); return; }
  activeCronJob = cron.schedule(expr, () => {
    logger.info({ schedule }, "Running scheduled backup");
    runScheduledBackup().catch((e) => logger.error({ e }, "Scheduled backup error"));
  });
  logger.info({ schedule, expr }, "Backup scheduler started");
}

/**
 * Repairs a stored localPath that was derived from a home directory that does
 * not exist. Changing DEFAULT_LOCAL_PATH alone would only help fresh installs:
 * getConfig spreads the defaults *under* the saved row, so an install that ever
 * saved backup settings has the broken path persisted and would keep using it.
 *
 * Scoped to the /nonexistent marker on purpose. A path the user actually chose
 * is never second-guessed, and after one rewrite this no longer matches.
 */
async function repairNonexistentLocalPath(): Promise<void> {
  const cfg = await getConfig();
  if (!cfg.localPath?.startsWith(NONEXISTENT_HOME_PREFIX)) return;

  const from = cfg.localPath;
  await saveConfig({ ...cfg, localPath: DEFAULT_LOCAL_PATH });
  logger.warn(
    { from, to: DEFAULT_LOCAL_PATH },
    "Repaired backup localPath that pointed inside a nonexistent home directory",
  );
}

/**
 * Surfaces an unwritable backup directory at boot rather than at 2am. Only
 * warns: silently redirecting dumps somewhere other than the configured path
 * would mean the UI shows one location while backups land in another.
 */
function warnIfLocalPathUnwritable(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (e) {
    logger.warn({ err: e, dir }, "Local backup directory is not writable — local backups will fail");
  }
}

export async function initBackupScheduler() {
  try {
    await repairNonexistentLocalPath();
    const cfg = await getConfig();
    warnIfLocalPathUnwritable(localBackupDir(cfg));
    startScheduler(cfg.schedule);
  } catch (e) {
    logger.error({ e }, "Failed to init backup scheduler");
  }
}
