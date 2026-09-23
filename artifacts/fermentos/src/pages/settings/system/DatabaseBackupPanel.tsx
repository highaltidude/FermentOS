import { useState, useEffect, useRef, useCallback } from "react";
import {
  Trash2,
  RefreshCw,
  Database,
  Upload,
  Download,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Activity,
} from "lucide-react";
import { useGetBackupAudit } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BASE, type BackupBeforeUpdate } from "../shared";

type SftpForm = {
  host: string; port: string; username: string; password: string;
  remotePath: string; prefix: string;
};

type BackupStatus = {
  lastRun: string | null; lastResult: "success" | "error" | null; lastMessage: string | null;
};

type LocalBackupFile = {
  name: string;
  size: number;
  modifiedAt: string;
  createdAt: string;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DatabaseBackupPanel() {
  const [sftp, setSftp] = useState<SftpForm>({ host: "", port: "22", username: "", password: "", remotePath: "", prefix: "fermentos" });
  const [schedule, setSchedule] = useState<"none" | "daily" | "weekly">("none");
  const [localPath, setLocalPath] = useState<string>("");
  const [retentionDays, setRetentionDays] = useState<number>(0); // 0 = keep forever
  const [backupBeforeUpdate, setBackupBeforeUpdate] = useState<BackupBeforeUpdate>("none");
  const [status, setStatus] = useState<BackupStatus>({ lastRun: null, lastResult: null, lastMessage: null });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState<null | "sftp" | "local">(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const restoreFileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [localFiles, setLocalFiles] = useState<LocalBackupFile[]>([]);
  const [localFilesDir, setLocalFilesDir] = useState<string>("");
  const [localFilesLoading, setLocalFilesLoading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);
  // Generated hook (see the API change workflow); the Updates panel reads the same query, so
  // TanStack Query serves both callers from one request.
  const { data: audit = null, isFetching: auditLoading, refetch: refetchAudit } = useGetBackupAudit();

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/backup/config`);
      if (res.ok) {
        const data = await res.json() as {
          config: {
            sftp: Partial<SftpForm>;
            schedule: string;
            localPath?: string;
            retentionDays?: number;
            backupBeforeUpdate?: BackupBeforeUpdate;
          };
          status: BackupStatus;
        };
        const s = data.config.sftp;
        setSftp({ host: s.host ?? "", port: String(s.port ?? 22), username: s.username ?? "", password: s.password ?? "", remotePath: s.remotePath ?? "", prefix: s.prefix ?? "fermentos" });
        setSchedule((data.config.schedule as "none" | "daily" | "weekly") ?? "none");
        setLocalPath(data.config.localPath ?? "");
        setRetentionDays(typeof data.config.retentionDays === "number" ? data.config.retentionDays : 0);
        setBackupBeforeUpdate(data.config.backupBeforeUpdate ?? "none");
        setStatus(data.status);
      }
    } catch { /* ignore */ } finally {
      setConfigLoaded(true);
    }
  }, []);

  const fetchLocalFiles = useCallback(async () => {
    setLocalFilesLoading(true);
    try {
      const res = await fetch(`${BASE}api/backup/local-files`);
      if (res.ok) {
        const data = await res.json() as { files: LocalBackupFile[]; dir: string };
        setLocalFiles(data.files);
        setLocalFilesDir(data.dir);
      }
    } catch { /* ignore */ } finally { setLocalFilesLoading(false); }
  }, []);

  const handleDownloadLocalFile = (filename: string) => {
    window.location.href = `${BASE}api/backup/local-files/${encodeURIComponent(filename)}/download`;
  };

  const handleDeleteLocalFile = async (filename: string) => {
    if (!confirm(`Delete backup "${filename}"?\n\nThis will permanently remove the file from disk. This cannot be undone.`)) return;
    setDeletingFile(filename);
    try {
      const res = await fetch(`${BASE}api/backup/local-files/${encodeURIComponent(filename)}`, { method: "DELETE" });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast({ title: "Backup deleted", description: filename });
      await fetchLocalFiles();
    } catch (e) {
      toast({ title: "Delete failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setDeletingFile(null); }
  };

  const handleRestoreLocalFile = async (filename: string) => {
    if (!confirm(
      `Restore from "${filename}"?\n\n` +
      `This will replace all current FermentOS data with the selected backup.\n\n` +
      `This cannot be undone.`,
    )) return;
    setRestoringFile(filename);
    try {
      const res = await fetch(`${BASE}api/backup/local-files/${encodeURIComponent(filename)}/restore`, { method: "POST" });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast({ title: "Database restored", description: data.message ?? "Restore complete. Restart the app for a fully clean state." });
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      toast({ title: "Restore failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setRestoringFile(null); }
  };

  useEffect(() => { loadConfig(); fetchLocalFiles(); }, [loadConfig, fetchLocalFiles]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}api/backup/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sftp: { ...sftp, port: Number(sftp.port) || 22 },
          schedule,
          localPath: localPath.trim(),
          retentionDays,
          backupBeforeUpdate,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast({ title: "Backup config saved" });
    } catch (e) {
      toast({ title: "Failed to save", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch(`${BASE}api/backup/test`, { method: "POST" });
      const data = await res.json() as { ok: boolean; message: string };
      setTestResult(data);
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally { setTesting(false); }
  };

  const handleRunNow = async (target: "sftp" | "local") => {
    setRunning(target);
    try {
      const res = await fetch(`${BASE}api/backup/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const data = await res.json() as { ok: boolean; message: string };
      toast({ title: data.ok ? "Backup complete" : "Backup failed", description: data.message, variant: data.ok ? "default" : "destructive" });
      await loadConfig();
    } catch (e) {
      toast({ title: "Backup error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally { setRunning(null); }
  };

  const handleDownload = () => {
    window.location.href = `${BASE}api/backup/download`;
  };

  const handleRestoreFile = async (file: File) => {
    const ok = window.confirm(
      `Restore database from "${file.name}"?\n\n` +
      `This will PERMANENTLY DELETE all current data (recipes, brews, inventory, settings) ` +
      `and replace it with the contents of the backup file.\n\nThis cannot be undone.`,
    );
    if (!ok) {
      if (restoreFileRef.current) restoreFileRef.current.value = "";
      return;
    }
    setRestoring(true);
    try {
      const fd = new FormData();
      fd.append("backup", file);
      const res = await fetch(`${BASE}api/backup/restore`, { method: "POST", body: fd });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast({
        title: "Database restored",
        description: data.message ?? "Restore complete. Restart the app for a fully clean state.",
      });
      // The whole DB just changed under us — bounce the page so every cached
      // query refetches against the new data.
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      toast({
        title: "Restore failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setRestoring(false);
      if (restoreFileRef.current) restoreFileRef.current.value = "";
    }
  };

  const fieldClass = "text-sm";
  const labelClass = "text-xs text-muted-foreground mb-1 block";

  if (!configLoaded) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-md" />)}</div>;

  return (
    <div className="space-y-4">

      {/* Backup status + primary actions */}
      <div className="space-y-2">
        {status.lastRun ? (
          <div className={`flex items-center gap-2 text-xs rounded-md px-3 py-2 border ${status.lastResult === "success" ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
            {status.lastResult === "success"
              ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              : <XCircle className="w-3.5 h-3.5 shrink-0" />}
            <span>Last backup: {new Date(status.lastRun).toLocaleString()} — {status.lastMessage}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md px-3 py-2 border border-dashed border-border">
            <Database className="w-3.5 h-3.5 shrink-0" />
            <span>No backup recorded yet.</span>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => handleRunNow("sftp")} disabled={running !== null || !sftp.host}>
            {running === "sftp" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
            Push to SFTP
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleRunNow("local")} disabled={running !== null}>
            {running === "local" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5 mr-1.5" />}
            Save Local
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownload}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download SQL Dump
          </Button>
        </div>
      </div>

      {/* Schedule & Retention side by side */}
      <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Schedule</div>
          <div className="flex flex-col gap-1">
            {(["none", "daily", "weekly"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setSchedule(opt)}
                className={`px-2.5 py-1.5 rounded-md text-xs border transition-colors text-left ${schedule === opt ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
              >
                {opt === "none" ? "Disabled" : opt === "daily" ? "Daily (2 AM)" : "Weekly (Sun 2 AM)"}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Pushes to SFTP. Uses server local time.</p>
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Retention</div>
          <select
            value={retentionDays}
            onChange={(e) => setRetentionDays(Number(e.target.value))}
            className="w-full text-sm rounded-md border border-input bg-background px-2 py-1.5"
          >
            <option value={0}>Keep forever</option>
            {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((d) => (
              <option key={d} value={d}>Delete after {d} days</option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">Pruned after each backup. Applies to both SFTP and local; other files untouched.</p>
        </div>
      </div>

      {/* Configure Backup Destinations (collapsible) */}
      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setConfigOpen((v) => !v)}
          className="w-full flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          {configOpen ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
          <span className="font-medium">Configure Backup Destinations</span>
          {sftp.host && !configOpen && <span className="ml-auto font-mono text-[10px]">{sftp.host}</span>}
        </button>

        {configOpen && (
          <div className="mt-3 space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SFTP Server</div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className={labelClass}>Host</label>
                  <Input className={fieldClass} placeholder="192.168.1.10" value={sftp.host} onChange={(e) => setSftp({ ...sftp, host: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>Port</label>
                  <Input className={fieldClass} type="number" placeholder="22" value={sftp.port} onChange={(e) => setSftp({ ...sftp, port: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>Username</label>
                  <Input className={fieldClass} placeholder="pi" value={sftp.username} onChange={(e) => setSftp({ ...sftp, username: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>Password</label>
                  <Input className={fieldClass} type="password" placeholder="••••••••" value={sftp.password} onChange={(e) => setSftp({ ...sftp, password: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>Remote Path</label>
                  <Input className={fieldClass} placeholder="/backups" value={sftp.remotePath} onChange={(e) => setSftp({ ...sftp, remotePath: e.target.value })} />
                </div>
                <div className="col-span-3">
                  <label className={labelClass}>Filename Prefix</label>
                  <Input className={fieldClass} placeholder="fermentos" value={sftp.prefix} onChange={(e) => setSftp({ ...sftp, prefix: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Local Backup Directory</div>
              <Input
                className={fieldClass}
                placeholder="/home/user/fermentos-backups"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Used for "Save Local" and pre-update safety backups. Created automatically if missing.</p>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pre-Update Backup</div>
              <div className="flex gap-2 flex-wrap">
                {(["none", "local", "sftp"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setBackupBeforeUpdate(opt)}
                    className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${backupBeforeUpdate === opt ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                  >
                    {opt === "none" ? "Off" : opt === "local" ? "Save Local" : "Push to SFTP"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Run before each update. If the backup fails, the update is aborted.</p>
            </div>

            {testResult && (
              <div className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${testResult.ok ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
                {testResult.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                {testResult.message}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !sftp.host}>
                {testing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
                Test SFTP Connection
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Save Config
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Local Backups */}
      <div className="border-t border-border pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <FolderOpen className="w-3.5 h-3.5" />
            Local Backups
          </div>
          <Button size="sm" variant="ghost" onClick={fetchLocalFiles} disabled={localFilesLoading} className="h-7 px-2">
            {localFilesLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
        {localFilesDir && (
          <p className="text-[11px] text-muted-foreground font-mono leading-snug">{localFilesDir}</p>
        )}
        {localFilesLoading && localFiles.length === 0 ? (
          <div className="space-y-1">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}</div>
        ) : localFiles.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-5 border border-dashed border-border rounded-md">
            No .sql files found in local backup directory.
          </div>
        ) : (
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {localFiles.map((f) => (
              <div key={f.name} className="flex items-center gap-2 text-xs rounded-md border border-border px-3 py-2 bg-muted/20">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[11px] truncate">{f.name}</div>
                  <div className="text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <span>{formatFileSize(f.size)}</span>
                    <span>·</span>
                    <span>{new Date(f.modifiedAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    size="sm" variant="ghost" className="h-7 w-7 p-0"
                    title="Download" onClick={() => handleDownloadLocalFile(f.name)}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                    title="Restore from this backup"
                    onClick={() => handleRestoreLocalFile(f.name)}
                    disabled={restoringFile === f.name || deletingFile === f.name}
                  >
                    {restoringFile === f.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Delete"
                    onClick={() => handleDeleteLocalFile(f.name)}
                    disabled={deletingFile === f.name || restoringFile === f.name}
                  >
                    {deletingFile === f.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Backup Audit */}
      <div className="border-t border-border pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Activity className="w-3.5 h-3.5" />
            Backup Audit
          </div>
          <Button size="sm" variant="ghost" onClick={() => void refetchAudit()} disabled={auditLoading} className="h-7 px-2">
            {auditLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>

        {audit === null ? (
          <div className="space-y-1">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-7 rounded-md" />)}</div>
        ) : (
          <div className="space-y-3">
            {audit.missing.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Unprotected tables detected — updates are disabled.</span>
                  {" "}Add{" "}
                  <span className="font-mono">{audit.missing.join(", ")}</span>
                  {" "}to <code className="font-mono">BACKUP_REGISTRY</code> or{" "}
                  <code className="font-mono">EXCLUDED_TABLES</code> in{" "}
                  <code className="font-mono">lib/db/src/backup-registry.ts</code>.
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border px-3 py-2 space-y-0.5">
                <div className="text-muted-foreground">Coverage</div>
                <div className={`text-base font-semibold tabular-nums ${audit.coveragePercent === 100 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                  {audit.coveragePercent}%
                </div>
              </div>
              <div className="rounded-md border border-border px-3 py-2 space-y-0.5">
                <div className="text-muted-foreground">Total tables</div>
                <div className="text-base font-semibold tabular-nums">{audit.totalTables}</div>
              </div>
              <div className="rounded-md border border-border px-3 py-2 space-y-0.5">
                <div className="text-muted-foreground">Backed up</div>
                <div className="text-base font-semibold tabular-nums text-green-600 dark:text-green-400">{audit.backedUp.length}</div>
              </div>
              <div className="rounded-md border border-border px-3 py-2 space-y-0.5">
                <div className="text-muted-foreground">Missing</div>
                <div className={`text-base font-semibold tabular-nums ${audit.missing.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {audit.missing.length}
                </div>
              </div>
            </div>

            {audit.excluded.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Not required in backups (still included in the dump): {audit.excluded.join(", ")}
              </p>
            )}
            {audit.orphaned.length > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Stale registry entries (no matching table): {audit.orphaned.join(", ")}
              </p>
            )}
            {audit.coveragePercent === 100 && audit.missing.length === 0 && (
              <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                <CheckCircle className="w-3.5 h-3.5" />
                All tables are covered — backups are complete.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Restore — destructive, visually separated */}
      <div className="border-t-2 border-destructive/15 pt-4 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive/70 uppercase tracking-wide">
          <AlertTriangle className="w-3.5 h-3.5" />
          Restore from Backup
        </div>
        <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            Restoring replaces <span className="text-foreground font-medium">all current data</span> with the contents of an SQL dump (the file produced by <em>Download SQL Dump</em>). Useful for moving to a fresh host or rolling back after a bad change. This cannot be undone.
          </div>
        </div>
        <input
          ref={restoreFileRef}
          type="file"
          accept=".sql,application/sql,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleRestoreFile(f);
          }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => restoreFileRef.current?.click()}
          disabled={restoring}
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {restoring ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
          {restoring ? "Restoring…" : "Choose .sql file & restore"}
        </Button>
      </div>
    </div>
  );
}
