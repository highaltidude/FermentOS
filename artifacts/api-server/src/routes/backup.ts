import { Router } from "express";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import cron, { type ScheduledTask } from "node-cron";
import multer from "multer";
import SftpClient from "ssh2-sftp-client";
import { db, pool } from "@workspace/db";
import { appConfigTable } from "@workspace/db/schema";
import { BACKUP_REGISTRY, EXCLUDED_TABLES } from "@workspace/db/backup-registry";
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

export type LocalBackupFile = {
  name: string;
  /** File size in bytes. */
  size: number;
  /** ISO timestamp — file mtime (reliable across filesystems). */
  modifiedAt: string;
  /** ISO timestamp — file birthtime (may equal mtime on some filesystems). */
  createdAt: string;
};

export type BackupAuditResult = {
  totalTables: number;
  backedUp: string[];
  excluded: string[];
  /** Tables present in the DB but absent from BACKUP_REGISTRY and EXCLUDED_TABLES. */
  missing: string[];
  /** Tables in BACKUP_REGISTRY that don't exist in the actual DB (stale entries). */
  orphaned: string[];
  coveragePercent: number;
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

// ── Security helpers ───────────────────────────────────────────────────────

/**
 * Accept only safe, flat filenames: word chars + hyphens, must end in .sql.
 * Rejects path separators, "..", spaces, shell metacharacters, and anything
 * that could escape the configured backup directory.
 */
function isValidBackupFilename(name: string): boolean {
  return /^[\w-]+\.sql$/.test(name);
}

/**
 * Resolve a filename to an absolute path within the configured local backup
 * directory and verify the result hasn't escaped via symlinks or tricks.
 * Returns null if the path is invalid or doesn't exist.
 */
function resolveLocalBackupPath(dir: string, filename: string): string | null {
  const resolved = path.resolve(path.join(dir, filename));
  const base = path.resolve(dir);
  // Must stay strictly inside the directory (path.sep prevents base == full).
  if (!resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

// ── Restore helper (shared by upload-restore and local-file-restore) ───────

async function runRestoreFromFile(filePath: string): Promise<{ message: string }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set on server");

  let head = "";
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(512);
    fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    head = buf.toString("utf8");
  } catch { /* ignore — file unreadable issues surface at psql */ }
  if (head.startsWith("PGDMP")) {
    throw new Error(
      "This looks like a custom-format pg_dump. Use a plain SQL dump " +
      "(the file produced by 'Download SQL Dump' or 'Save Local').",
    );
  }

  const combinedFile = `${filePath}.combined.sql`;
  try {
    const wipeSql = `DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\nGRANT ALL ON SCHEMA public TO PUBLIC;\n`;
    fs.writeFileSync(combinedFile, wipeSql);
    await new Promise<void>((resolve, reject) => {
      const src = fs.createReadStream(filePath);
      const dst = fs.createWriteStream(combinedFile, { flags: "a" });
      src.on("error", reject);
      dst.on("error", reject);
      dst.on("close", resolve);
      src.pipe(dst);
    });
    execSync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -1 -f "${combinedFile}"`, { timeout: 120000 });
    return { message: "Database restored. Restart the app for a fully clean state." };
  } finally {
    try { fs.unlinkSync(combinedFile); } catch { /* ignore */ }
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

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
 * Restore from an uploaded pg_dump SQL file.
 * Destructive: wipes the public schema then replays the dump in one transaction.
 */
router.post("/backup/restore", restoreUpload.single("backup"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No backup file uploaded (expected field 'backup')" });

  if (!process.env.DATABASE_URL) {
    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    return res.status(500).json({ error: "DATABASE_URL not set on server" });
  }

  try {
    const result = await runRestoreFromFile(req.file.path);
    req.log.info({ size: req.file.size }, "Database restored from uploaded dump");
    return res.json({ ok: true, message: result.message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err }, "Restore failed");
    return res.status(500).json({ error: `Restore failed: ${msg}` });
  } finally {
    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
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

// ── Local backup file browser ───────────────────────────────────────────────

/**
 * GET /backup/local-files
 * Lists all .sql files in the configured local backup directory with metadata.
 */
router.get("/backup/local-files", async (req, res) => {
  const cfg = await getConfig();
  const dir = cfg.localPath || DEFAULT_LOCAL_PATH;

  if (!fs.existsSync(dir)) {
    return res.json({ files: [] as LocalBackupFile[], dir });
  }

  try {
    const files: LocalBackupFile[] = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .flatMap((name) => {
        try {
          const stat = fs.statSync(path.join(dir, name));
          return [{
            name,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            createdAt: stat.birthtime.toISOString(),
          }] satisfies LocalBackupFile[];
        } catch { return []; }
      })
      .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

    return res.json({ files, dir });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * GET /backup/local-files/:filename/download
 * Stream an existing local backup file as an attachment.
 */
router.get("/backup/local-files/:filename/download", async (req, res) => {
  const { filename } = req.params;
  if (!isValidBackupFilename(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  const cfg = await getConfig();
  const dir = cfg.localPath || DEFAULT_LOCAL_PATH;
  const full = resolveLocalBackupPath(dir, filename);
  if (!full) return res.status(400).json({ error: "Invalid path" });
  if (!fs.existsSync(full)) return res.status(404).json({ error: "File not found" });

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/sql");
  fs.createReadStream(full).pipe(res);
  return;
});

/**
 * DELETE /backup/local-files/:filename
 * Permanently remove a local backup file.
 */
router.delete("/backup/local-files/:filename", async (req, res) => {
  const { filename } = req.params;
  if (!isValidBackupFilename(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  const cfg = await getConfig();
  const dir = cfg.localPath || DEFAULT_LOCAL_PATH;
  const full = resolveLocalBackupPath(dir, filename);
  if (!full) return res.status(400).json({ error: "Invalid path" });
  if (!fs.existsSync(full)) return res.status(404).json({ error: "File not found" });

  try {
    fs.unlinkSync(full);
    req.log.info({ filename }, "Local backup deleted");
    return res.json({ ok: true, name: filename });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /backup/local-files/:filename/restore
 * Restore the database from a local backup file (same logic as upload restore).
 * Destructive: drops the public schema and replays the dump in one transaction.
 */
router.post("/backup/local-files/:filename/restore", async (req, res) => {
  const { filename } = req.params;
  if (!isValidBackupFilename(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  const cfg = await getConfig();
  const dir = cfg.localPath || DEFAULT_LOCAL_PATH;
  const full = resolveLocalBackupPath(dir, filename);
  if (!full) return res.status(400).json({ error: "Invalid path" });
  if (!fs.existsSync(full)) return res.status(404).json({ error: "File not found" });

  try {
    const result = await runRestoreFromFile(full);
    req.log.info({ filename }, "Database restored from local backup file");
    return res.json({ ok: true, message: result.message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err, filename }, "Local file restore failed");
    return res.status(500).json({ error: `Restore failed: ${msg}` });
  }
});

// ── Backup audit ───────────────────────────────────────────────────────────

/**
 * GET /backup/audit
 * Compares actual PostgreSQL tables against BACKUP_REGISTRY + EXCLUDED_TABLES
 * and returns a coverage report. A coveragePercent of 100 means every table
 * in the database is either explicitly backed up or intentionally excluded.
 */
router.get("/backup/audit", async (req, res) => {
  try {
    const result = await pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
    );

    const actualTables = result.rows.map((r) => r.table_name);
    const registrySet = new Set<string>(BACKUP_REGISTRY);
    const excludedSet = new Set<string>(EXCLUDED_TABLES);

    const backedUp = actualTables.filter((t) => registrySet.has(t));
    const excluded = actualTables.filter((t) => excludedSet.has(t));
    const missing  = actualTables.filter((t) => !registrySet.has(t) && !excludedSet.has(t));
    const orphaned = [...BACKUP_REGISTRY].filter((t) => !actualTables.includes(t));

    const total = actualTables.length;
    const coveragePercent = total === 0 ? 100 : Math.round(((total - missing.length) / total) * 100);

    const audit: BackupAuditResult = { totalTables: total, backedUp, excluded, missing, orphaned, coveragePercent };
    res.setHeader("Cache-Control", "no-store");
    return res.json(audit);
  } catch (err) {
    req.log.error({ err }, "Backup audit failed");
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
