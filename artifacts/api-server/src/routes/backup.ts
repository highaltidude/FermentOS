import { Router, type Response } from "express";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import multer from "multer";
import SftpClient from "ssh2-sftp-client";
import { computeBackupAudit } from "../services/backupAudit";
import {
  type BackupConfig,
  type BackupTarget,
  type SftpConfig,
  DEFAULT_LOCAL_PATH,
  backupFilename,
  getConfig,
  getStatus,
  localBackupDir,
  runBackup,
  runDump,
  saveConfig,
  startScheduler,
} from "../services/backup.js";

const router = Router();

// Stash uploads in tmp; we delete them right after psql finishes.
const restoreUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, _file, cb) => cb(null, `fermentos_restore_${Date.now()}.sql`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB cap — pg_dump output for a homelab brew DB is tiny
});

type LocalBackupFile = {
  name: string;
  /** File size in bytes. */
  size: number;
  /** ISO timestamp — file mtime (reliable across filesystems). */
  modifiedAt: string;
  /** ISO timestamp — file birthtime (may equal mtime on some filesystems). */
  createdAt: string;
};

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

/**
 * Validate a :filename param and resolve it to an existing file in the local
 * backup directory. On failure the error response has already been sent and
 * this returns null.
 */
async function resolveExistingLocalBackup(filename: string, res: Response): Promise<string | null> {
  if (!isValidBackupFilename(filename)) {
    res.status(400).json({ error: "Invalid filename" });
    return null;
  }

  const cfg = await getConfig();
  const full = resolveLocalBackupPath(localBackupDir(cfg), filename);
  if (!full) {
    res.status(400).json({ error: "Invalid path" });
    return null;
  }
  if (!fs.existsSync(full)) {
    res.status(404).json({ error: "File not found" });
    return null;
  }
  return full;
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

  // Step 1: wipe the schema
  execSync(
    `psql "${dbUrl}" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;"`,
    { timeout: 30000 },
  );

  // Step 2: recreate all tables via Drizzle migrations
  execSync(`pnpm --filter @workspace/db run push`, {
    timeout: 60000,
    env: { ...process.env },
    stdio: "pipe",
  });

  // Step 3: replay the dump
  execSync(`psql "${dbUrl}" -v ON_ERROR_STOP=1 -f "${filePath}"`, { timeout: 120000 });

  return { message: "Database restored. Restart the app for a fully clean state." };
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
  // Clamp retentionDays into 0..60 (0 = keep forever).
  let retention = body.retentionDays ?? current.retentionDays ?? 0;
  if (typeof retention !== "number" || !Number.isFinite(retention)) retention = 0;
  retention = Math.max(0, Math.min(60, Math.floor(retention)));

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
    const filename = backupFilename("fermentos");
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
  const dir = localBackupDir(cfg);

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
  const full = await resolveExistingLocalBackup(filename, res);
  if (!full) return;

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
  const full = await resolveExistingLocalBackup(filename, res);
  if (!full) return;

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
  const full = await resolveExistingLocalBackup(filename, res);
  if (!full) return;

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
    const audit = await computeBackupAudit();
    res.setHeader("Cache-Control", "no-store");
    return res.json(audit);
  } catch (err) {
    req.log.error({ err }, "Backup audit failed");
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
