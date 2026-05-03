import { Router } from "express";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import cron, { type ScheduledTask } from "node-cron";
import multer from "multer";
import SftpClient from "ssh2-sftp-client";
import { db } from "@workspace/db";
import { appConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

// Stash uploads in tmp; we delete them right after psql finishes.
const restoreUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, _file, cb) => cb(null, `fermentos_restore_${Date.now()}.sql`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB cap — pg_dump output for a homelab brew DB is tiny
});

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
  /** Days to keep backups. 0 / undefined = keep forever. Clamped 1–30 when set. */
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
const DEFAULT_LOCAL_PATH = path.join(os.homedir(), "fermentos-backups");

function defaultConfig(): BackupConfig {
  return { sftp: {}, schedule: "none", localPath: DEFAULT_LOCAL_PATH, retentionDays: 0, backupBeforeUpdate: "none" };
}

export async function getConfig(): Promise<BackupConfig> {
  const row = await db.select().from(appConfigTable).where(eq(appConfigTable.key, CONFIG_KEY)).limit(1);
  if (!row[0]?.value) return defaultConfig();
  try {
    const parsed = JSON.parse(row[0].value) as Partial<BackupConfig>;
    return { ...defaultConfig(), ...parsed, sftp: parsed.sftp ?? {} };
  } catch { return defaultConfig(); }
}

async function saveConfig(cfg: BackupConfig) {
  await db.insert(appConfigTable).values({ key: CONFIG_KEY, value: JSON.stringify(cfg) })
    .onConflictDoUpdate({ target: appConfigTable.key, set: { value: JSON.stringify(cfg), updatedAt: new Date() } });
}

async function getStatus(): Promise<BackupStatus> {
  const row = await db.select().from(appConfigTable).where(eq(appConfigTable.key, STATUS_KEY)).limit(1);
  if (!row[0]?.value) return { lastRun: null, lastResult: null, lastMessage: null };
  try { return JSON.parse(row[0].value) as BackupStatus; } catch { return { lastRun: null, lastResult: null, lastMessage: null }; }
}

async function saveStatus(s: BackupStatus) {
  await db.insert(appConfigTable).values({ key: STATUS_KEY, value: JSON.stringify(s) })
    .onConflictDoUpdate({ target: appConfigTable.key, set: { value: JSON.stringify(s), updatedAt: new Date() } });
}

async function runDump(): Promise<string> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  const tmpFile = path.join(os.tmpdir(), `fermentos_${Date.now()}.sql`);
  execSync(`pg_dump "${dbUrl}" -f "${tmpFile}"`, { timeout: 60000 });
  return tmpFile;
}

function backupFilename(prefix: string): string {
  return `${prefix || "fermentos"}_${new Date().toISOString().replace(/[:.]/g, "-")}.sql`;
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
  const filename = backupFilename(sftp.prefix || "fermentos");
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
  const dir = cfg.localPath || DEFAULT_LOCAL_PATH;
  fs.mkdirSync(dir, { recursive: true });
  const filename = backupFilename(cfg.sftp.prefix || "fermentos");
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
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_.*\\.sql$`);
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
  const prefix = sftp.prefix || "fermentos";
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_.*\\.sql$`);
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
    runBackup("sftp").catch((e) => logger.error({ e }, "Scheduled backup error"));
  });
  logger.info({ schedule, expr }, "Backup scheduler started");
}

export async function initBackupScheduler() {
  try {
    const cfg = await getConfig();
    startScheduler(cfg.schedule);
  } catch (e) {
    logger.error({ e }, "Failed to init backup scheduler");
  }
}

router.get("/backup/config", async (req, res) => {
  const cfg = await getConfig();
  const status = await getStatus();
  const masked = { ...cfg, sftp: { ...cfg.sftp, password: cfg.sftp.password ? "••••••••" : "" } };
  return res.json({ config: masked, status });
});

router.put("/backup/config", async (req, res) => {
  const body = req.body as Partial<BackupConfig & { sftp: Partial<SftpConfig> & { password?: string } }>;
  const current = await getConfig();
  const newSftp: Partial<SftpConfig> = {
    host: body.sftp?.host ?? current.sftp.host ?? "",
    port: body.sftp?.port ?? current.sftp.port ?? 22,
    username: body.sftp?.username ?? current.sftp.username ?? "",
    remotePath: body.sftp?.remotePath ?? current.sftp.remotePath ?? "",
    prefix: body.sftp?.prefix ?? current.sftp.prefix ?? "fermentos",
    password: body.sftp?.password && body.sftp.password !== "••••••••"
      ? body.sftp.password
      : current.sftp.password ?? "",
  };
  // Clamp retentionDays into 0..30 (0 = keep forever).
  let retention = body.retentionDays ?? current.retentionDays ?? 0;
  if (typeof retention !== "number" || !Number.isFinite(retention)) retention = 0;
  retention = Math.max(0, Math.min(30, Math.floor(retention)));

  const newCfg: BackupConfig = {
    sftp: newSftp,
    schedule: body.schedule ?? current.schedule ?? "none",
    localPath: (body.localPath ?? current.localPath ?? DEFAULT_LOCAL_PATH).trim() || DEFAULT_LOCAL_PATH,
    retentionDays: retention,
    backupBeforeUpdate: body.backupBeforeUpdate ?? current.backupBeforeUpdate ?? "none",
  };
  await saveConfig(newCfg);
  startScheduler(newCfg.schedule);
  return res.json({ ok: true });
});

router.post("/backup/test", async (req, res) => {
  const cfg = await getConfig();
  const client = new SftpClient();
  try {
    await client.connect({
      host: cfg.sftp.host ?? "",
      port: cfg.sftp.port ?? 22,
      username: cfg.sftp.username ?? "",
      password: cfg.sftp.password ?? "",
    });
    const list = await client.list(cfg.sftp.remotePath || "/");
    await client.end();
    return res.json({ ok: true, message: `Connected — ${list.length} item(s) at remote path` });
  } catch (err) {
    try { await client.end(); } catch { /* ignore */ }
    return res.json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/backup/run", async (req, res) => {
  const target: BackupTarget = req.body?.target === "local" ? "local" : "sftp";
  const result = await runBackup(target);
  return res.status(result.ok ? 200 : 500).json(result);
});

/**
 * Restore the database from an uploaded pg_dump SQL file.
 *
 * This is destructive: it drops every table in the `public` schema first so
 * the restore runs cleanly on top of either a fresh install or an existing
 * one. The dump file must be plain-SQL (`pg_dump` default), not custom format.
 *
 * After restore the API server keeps running — the pg pool just reconnects
 * to the new tables on next query — but a manual service restart is a good
 * idea so any cached config (e.g. backup scheduler, auth flag) reloads.
 */
router.post("/backup/restore", restoreUpload.single("backup"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No backup file uploaded (expected field 'backup')" });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    return res.status(500).json({ error: "DATABASE_URL not set on server" });
  }

  // Sanity check: the file should look like text SQL. pg_dump custom format
  // starts with "PGDMP" binary magic and won't restore via psql.
  let head = "";
  try {
    const fd = fs.openSync(req.file.path, "r");
    const buf = Buffer.alloc(512);
    fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    head = buf.toString("utf8");
  } catch { /* ignore */ }
  if (head.startsWith("PGDMP")) {
    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    return res.status(400).json({ error: "This looks like a custom-format pg_dump. Use a plain SQL dump (the file produced by 'Download SQL Dump')." });
  }

  // Prepend the schema wipe to the dump so the whole thing runs in ONE
  // transaction (-1). If the dump has a syntax error or constraint violation,
  // psql rolls back everything — including the DROP — and the existing
  // database is preserved. Doing the DROP in a separate psql call would
  // commit the wipe before we know whether the restore succeeds.
  const combinedFile = `${req.file.path}.combined.sql`;
  try {
    // psql -1 wraps the whole file in a single transaction, so we just
    // prepend the schema wipe — no explicit BEGIN/COMMIT needed.
    // Stream the upload onto disk after the wipe header to avoid loading
    // potentially large dumps into a JS string (would OOM a small host at the 200MB cap).
    const wipeSql = `DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\nGRANT ALL ON SCHEMA public TO PUBLIC;\n`;
    fs.writeFileSync(combinedFile, wipeSql);
    await new Promise<void>((resolve, reject) => {
      const src = fs.createReadStream(req.file!.path);
      const dst = fs.createWriteStream(combinedFile, { flags: "a" });
      src.on("error", reject);
      dst.on("error", reject);
      dst.on("close", resolve);
      src.pipe(dst);
    });

    execSync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -1 -f "${combinedFile}"`, { timeout: 120000 });

    req.log.info({ size: req.file.size }, "Database restored from uploaded dump");
    return res.json({ ok: true, message: "Database restored. Restart the app for a fully clean state." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Restore failed");
    return res.status(500).json({ error: `Restore failed: ${msg}` });
  } finally {
    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    try { fs.unlinkSync(combinedFile); } catch { /* ignore */ }
  }
});

router.get("/backup/download", async (req, res) => {
  let tmpFile: string | null = null;
  try {
    tmpFile = await runDump();
    const filename = `fermentos_${new Date().toISOString().replace(/[:.]/g, "-")}.sql`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/sql");
    const stream = fs.createReadStream(tmpFile);
    stream.on("end", () => { if (tmpFile) try { fs.unlinkSync(tmpFile); } catch { /* ignore */ } });
    stream.pipe(res);
    return;
  } catch (err) {
    if (tmpFile) try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
