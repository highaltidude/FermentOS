import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Trash2, GripVertical, Settings as SettingsIcon, Cpu, MemoryStick, HardDrive, Network, RefreshCw, Clock, Database, Upload, Download, CheckCircle, XCircle, Loader2, Lock, Copy, KeyRound, AlertTriangle, Package, Beer, Server, GitBranch, AlertCircle, FolderOpen, Power, History, Undo2, ChevronDown, ChevronRight } from "lucide-react";
import {
  useListBeerStyles,
  useCreateBeerStyle,
  useDeleteBeerStyle,
  getListBeerStylesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type SystemStats = {
  uptime: number;
  loadAvg: [number, number, number];
  cpu: { model: string; cores: number; usagePercent: number | null };
  memory: { totalMB: number; usedMB: number; freeMB: number; usedPercent: number };
  disk: { totalGB: number; usedGB: number; freeGB: number; usedPercent: number } | null;
  network: Array<{ name: string; rxBytes: number; txBytes: number; rxBytesPerSec: number; txBytesPerSec: number }>;
};

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function formatBytes(bytes: number) {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB/s`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB/s`;
  return `${bytes} B/s`;
}

function UsageBar({ percent, color = "bg-primary" }: { percent: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, percent));
  const barColor = pct > 85 ? "bg-destructive" : pct > 60 ? "bg-amber-500" : color;
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="bg-background border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function SystemStatsPanel() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchingRef = useRef(false);

  const fetchStats = async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/system/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SystemStats = await res.json();
      setStats(data);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    fetchStats();
    intervalRef.current = setInterval(fetchStats, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  if (error || !stats) {
    return <p className="text-sm text-muted-foreground text-center py-4">Could not load system stats: {error}</p>;
  }

  const primaryNet = stats.network[0];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<Cpu className="w-3.5 h-3.5" />} label="CPU">
          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-lg font-bold text-foreground">{stats.cpu.usagePercent ?? "—"}%</span>
              <span className="text-xs text-muted-foreground">{stats.cpu.cores} cores</span>
            </div>
            <UsageBar percent={stats.cpu.usagePercent ?? 0} />
            <div className="text-xs text-muted-foreground truncate" title={stats.cpu.model}>{stats.cpu.model}</div>
            <div className="text-xs text-muted-foreground">Load: {stats.loadAvg.map((v) => v.toFixed(2)).join(" / ")}</div>
          </div>
        </StatCard>

        <StatCard icon={<MemoryStick className="w-3.5 h-3.5" />} label="Memory">
          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-lg font-bold text-foreground">{stats.memory.usedPercent}%</span>
              <span className="text-xs text-muted-foreground">{stats.memory.usedMB} / {stats.memory.totalMB} MB</span>
            </div>
            <UsageBar percent={stats.memory.usedPercent} />
            <div className="text-xs text-muted-foreground">{stats.memory.freeMB} MB free</div>
          </div>
        </StatCard>

        {stats.disk && (
          <StatCard icon={<HardDrive className="w-3.5 h-3.5" />} label="Disk (/)">
            <div className="space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-lg font-bold text-foreground">{stats.disk.usedPercent}%</span>
                <span className="text-xs text-muted-foreground">{stats.disk.usedGB} / {stats.disk.totalGB} GB</span>
              </div>
              <UsageBar percent={stats.disk.usedPercent} />
              <div className="text-xs text-muted-foreground">{stats.disk.freeGB} GB free</div>
            </div>
          </StatCard>
        )}

        <StatCard icon={<Network className="w-3.5 h-3.5" />} label={primaryNet ? `Network (${primaryNet.name})` : "Network"}>
          {primaryNet ? (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">↓ RX</div>
                  <div className="font-semibold text-foreground">{formatBytes(primaryNet.rxBytesPerSec)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">↑ TX</div>
                  <div className="font-semibold text-foreground">{formatBytes(primaryNet.txBytesPerSec)}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground pt-0.5">
                Total RX: {(primaryNet.rxBytes / 1e9).toFixed(2)} GB &nbsp;·&nbsp; TX: {(primaryNet.txBytes / 1e9).toFixed(2)} GB
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No network interface data</div>
          )}
        </StatCard>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Uptime: {formatUptime(stats.uptime)}
        </div>
        <div className="flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Updating…"} · auto-refreshes every 5s
        </div>
      </div>
    </div>
  );
}

type SftpForm = {
  host: string; port: string; username: string; password: string;
  remotePath: string; prefix: string;
};

type BackupStatus = {
  lastRun: string | null; lastResult: "success" | "error" | null; lastMessage: string | null;
};

type BackupBeforeUpdate = "none" | "sftp" | "local";

function DatabaseBackupPanel() {
  const BASE = import.meta.env.BASE_URL;
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
  const restoreFileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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
  }, [BASE]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

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
    <div className="space-y-5">
      <div className="space-y-3">
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

        {testResult && (
          <div className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${testResult.ok ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"}`}>
            {testResult.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            {testResult.message}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !sftp.host}>
            {testing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
            Test Connection
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            Save Config
          </Button>
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Local Backup</div>
        <div>
          <label className={labelClass}>Local Backup Directory</label>
          <Input
            className={fieldClass}
            placeholder="/home/user/fermentos-backups"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Used for "Save Local" backups and the pre-update safety backup. Created automatically if missing.
          </p>
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Retention</div>
        <div className="flex items-center gap-3">
          <select
            value={retentionDays}
            onChange={(e) => setRetentionDays(Number(e.target.value))}
            className="text-sm rounded-md border border-input bg-background px-2 py-1.5"
          >
            <option value={0}>Keep forever</option>
            {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>Delete after {d} day{d === 1 ? "" : "s"}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          When enabled, old backup files matching the configured prefix are pruned after every successful backup. Applies to both SFTP and local destinations. Other files in the same folder are left alone.
        </p>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Schedule</div>
        <div className="flex gap-2 flex-wrap">
          {(["none", "daily", "weekly"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setSchedule(opt)}
              className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${schedule === opt ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
            >
              {opt === "none" ? "Disabled" : opt === "daily" ? "Daily (2 AM)" : "Weekly (Sun 2 AM)"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Scheduled backups push to SFTP. Schedule uses the server's local time. Changes take effect after saving.</p>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
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
        <p className="text-xs text-muted-foreground">
          When set, an update started from <em>App Update</em> below will first create a backup. If the backup fails, the update is aborted so you don't lose data.
        </p>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Manual Actions</div>
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
        {status.lastRun && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {status.lastResult === "success"
              ? <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
              : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
            <span>Last backup: {new Date(status.lastRun).toLocaleString()} — {status.lastMessage}</span>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Restore from Backup</div>
        <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            Restoring replaces <span className="text-foreground font-medium">all current data</span> with the contents of an SQL dump
            (the file produced by <em>Download SQL Dump</em>). Useful for moving to a fresh host install or rolling back after a bad change.
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
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => restoreFileRef.current?.click()}
            disabled={restoring}
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {restoring
              ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              : <Upload className="w-3.5 h-3.5 mr-1.5" />}
            {restoring ? "Restoring…" : "Choose .sql file & restore"}
          </Button>
        </div>
      </div>
    </div>
  );
}

type LockInfo = {
  kind: "update" | "rollback";
  startedAt: string;
  hash?: string;
  ageMs: number;
  stale: boolean;
};

type VersionInfo = {
  hash: string;
  date: string | null;
  message: string | null;
  branch: string;
  updateAvailable: boolean;
  runningHash?: string;
  restartPending?: boolean;
  // ISO timestamp captured at api-server module load. Changes whenever the
  // process actually restarts — the most reliable "restart finished" signal
  // because it doesn't depend on git state lining up.
  startedAt?: string;
  // True when the api-server's `sudo -n --list` checks pass for both
  // `systemctl restart fermentos` and `reboot`. False means the in-app
  // Update / Restart / Reboot buttons will fail without the sudoers fix.
  sudoOk?: boolean;
  // Set when an update or rollback is currently running. The UI uses this
  // to disable the start buttons across browser tabs and to surface a
  // "looks stuck — force clear?" affordance after LOCK_STALE_MS.
  lock?: LockInfo | null;
};

type ReleaseNote = {
  tag: string;
  name: string | null;
  body: string | null;
  url: string;
  publishedAt: string | null;
  prerelease: boolean;
  isNewerThanCurrent: boolean;
};

// Tiny + safe markdown renderer for GitHub release notes. Deliberately not
// pulling in react-markdown — release notes are short, mostly bullets/links/
// inline code, and the bundle cost isn't worth it. We escape HTML first, then
// apply a small whitelist of inline transforms, so even a malicious release
// body can't inject script tags.
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}
function renderReleaseMarkdown(src: string): string {
  // Escape first — every transform below operates on already-safe text and
  // emits a fixed set of tags, so nothing user-controlled reaches the DOM raw.
  let html = escapeHtml(src);
  // Fenced code blocks ```...``` (do this before inline so backticks inside
  // aren't mangled).
  html = html.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre class="text-[10px] font-mono bg-muted/60 border border-border rounded p-2 overflow-auto whitespace-pre-wrap">${code.trim()}</pre>`);
  // Inline code `...`
  html = html.replace(/`([^`\n]+)`/g, '<code class="font-mono text-[11px] bg-muted/60 px-1 py-0.5 rounded">$1</code>');
  // Bold **...**
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  // Markdown links [text](url) — only allow http(s) URLs.
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${text}</a>`);
  // Bare URLs
  html = html.replace(/(^|[\s(])(https?:\/\/[^\s)]+)/g, (_m, pre, url) =>
    `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${url}</a>`);
  // Headings (### / ## / #) at line start
  html = html.replace(/^###\s+(.+)$/gm, '<div class="font-semibold text-foreground mt-2">$1</div>');
  html = html.replace(/^##\s+(.+)$/gm, '<div class="font-semibold text-foreground mt-2">$1</div>');
  html = html.replace(/^#\s+(.+)$/gm, '<div class="font-semibold text-foreground mt-2">$1</div>');
  // Bullet lines starting with -, *, or +
  html = html.replace(/^[\-*+]\s+(.+)$/gm, '<div class="flex gap-2"><span class="text-muted-foreground">•</span><span>$1</span></div>');
  // Paragraph breaks for double-newlines
  html = html.replace(/\n{2,}/g, '<div class="h-1.5"></div>');
  // Single newlines → <br>
  html = html.replace(/\n/g, "<br>");
  return html;
}

type HistoryEntry = {
  hash: string;
  message: string | null;
  commitDate: string | null;
  deployedAt: string;
  branch: string | null;
  isCurrent: boolean;
};

// Hard cap on how long either poller will wait for the service to come back
// before surfacing an actionable error. Real restarts complete in <15s on a
// Pi 4; if we're past 90s the systemctl restart almost certainly failed
// silently (missing sudoers entry, build failure, etc.).
const RESTART_TIMEOUT_MS = 90_000;

// Update lifecycle:
//   idle      — nothing happening
//   starting  — POST /api/admin/update is in flight (covers pre-update backup
//               which the server runs synchronously before spawning update.sh)
//   running   — update.sh is running on the server; we poll update.log
//   restarting— API server is unreachable (build finished, services restarting)
//   complete  — server reachable again with a new git hash; show Reload button
//   error     — POST returned non-2xx (e.g. backup failed) OR something unexpected
type UpdatePhase = "idle" | "starting" | "running" | "restarting" | "complete" | "error";

// Steps emitted by update.sh as `[N/5] ...` markers in update.log.
const UPDATE_STEPS = [
  "Pulling latest from GitHub",
  "Installing dependencies",
  "Running database migrations",
  "Building application",
  "Restarting services",
];

function parseLastStep(log: string): { step: number; label: string } | null {
  // Find the last `[N/5] some text...` marker. We rely on update.sh's exact
  // formatting; if the format changes the bar just sits at its previous step.
  const matches = [...log.matchAll(/\[(\d+)\/5\]\s*([^\n]*)/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]!;
  const step = Math.min(5, Math.max(1, parseInt(last[1]!, 10)));
  const raw = (last[2] ?? "").trim().replace(/\.{2,}$/, "");
  return { step, label: raw || (UPDATE_STEPS[step - 1] ?? `Step ${step}`) };
}

function SystemUpdatePanel() {
  const BASE = import.meta.env.BASE_URL;
  const { toast } = useToast();
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [checking, setChecking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preBackup, setPreBackup] = useState<BackupBeforeUpdate>("none");
  const [step, setStep] = useState(0); // 0..5
  const [stepLabel, setStepLabel] = useState<string>("");
  const [logTail, setLogTail] = useState<string>("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [releases, setReleases] = useState<ReleaseNote[]>([]);
  const [releasesError, setReleasesError] = useState<string | null>(null);
  const [releasesOpen, setReleasesOpen] = useState(false);
  const startHashRef = useRef<string | null>(null);
  // Snapshot of the api-server's PROCESS_STARTED_AT taken right before we
  // request a restart. The poller treats "startedAt has changed" as the
  // definitive sign that the process actually restarted — more reliable than
  // hash/restartPending comparisons, which depend on git state being right.
  const startStartedAtRef = useRef<string | null>(null);
  // Wall-clock timestamp at which the *restart* phase began (NOT the whole
  // update). The 90-second comeback budget is measured from here. We only
  // arm this clock once we observe step 5/5 in the log (or immediately for
  // the restart-only flow), so a slow `pnpm install` / `pnpm build` on a
  // Pi 4 — easily 2–5 minutes — never trips the comeback timeout.
  const restartStartedAtRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const fetchVersion = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`${BASE}api/admin/version`);
      if (res.ok) setVersion(await res.json() as VersionInfo);
    } catch { /* ignore */ } finally {
      setChecking(false);
    }
  }, [BASE]);

  const fetchPreBackup = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/backup/config`);
      if (res.ok) {
        const data = await res.json() as { config: { backupBeforeUpdate?: BackupBeforeUpdate } };
        setPreBackup(data.config.backupBeforeUpdate ?? "none");
      }
    } catch { /* ignore */ }
  }, [BASE]);

  const fetchReleases = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/admin/release-notes`);
      if (res.ok) {
        const data = await res.json() as { entries: ReleaseNote[]; error: string | null };
        setReleases(Array.isArray(data.entries) ? data.entries : []);
        setReleasesError(data.error);
      }
    } catch { /* offline / network — leave the panel hidden */ }
  }, [BASE]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/admin/update-history`);
      if (res.ok) {
        const data = await res.json() as { entries: HistoryEntry[] };
        setHistory(Array.isArray(data.entries) ? data.entries : []);
      }
    } catch { /* ignore — history is non-critical */ }
  }, [BASE]);

  useEffect(() => { fetchVersion(); fetchPreBackup(); fetchHistory(); fetchReleases(); }, [fetchVersion, fetchPreBackup, fetchHistory, fetchReleases]);
  // Auto-expand release notes the first time we learn there's an update
  // available — saves a click for the most useful moment.
  useEffect(() => {
    if (version?.updateAvailable && releases.some((r) => r.isNewerThanCurrent)) {
      setReleasesOpen(true);
    }
  }, [version?.updateAvailable, releases]);
  // Re-fetch history once an update or rollback finishes — the api-server
  // will have appended a new entry on its next boot.
  useEffect(() => { if (phase === "complete") fetchHistory(); }, [phase, fetchHistory]);
  // Tear down polling if the user navigates away mid-update.
  useEffect(() => () => stopPolling(), []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      // Two parallel probes: log progress and version. Both can fail when the
      // service is mid-restart — that's the signal we use to flip to "restarting".
      const [logRes, verRes] = await Promise.allSettled([
        fetch(`${BASE}api/admin/update-log`).then((r) => r.ok ? r.json() as Promise<{ log: string | null }> : Promise.reject(new Error(`HTTP ${r.status}`))),
        fetch(`${BASE}api/admin/version`).then((r) => r.ok ? r.json() as Promise<VersionInfo> : Promise.reject(new Error(`HTTP ${r.status}`))),
      ]);

      if (logRes.status === "fulfilled" && logRes.value.log) {
        const tail = logRes.value.log.split("\n").slice(-12).join("\n");
        setLogTail(tail);
        const parsed = parseLastStep(logRes.value.log);
        if (parsed) {
          setStep(parsed.step);
          setStepLabel(parsed.label);
          // Arm the 90-second comeback clock the first time we see step 5
          // in the log. Doing it here (not at the start of handleUpdate)
          // means slow `pnpm install` + build phases on low-end hardware
          // can take as long as they need without tripping the timeout.
          if (parsed.step >= 5 && restartStartedAtRef.current === null) {
            restartStartedAtRef.current = Date.now();
          }
        }
      }

      if (verRes.status === "fulfilled") {
        const v = verRes.value;
        // Two independent completion signals — either is sufficient:
        //   1. A new commit hash is live (the normal "code update" case).
        //   2. The process startedAt has changed (catches in-place restarts
        //      AND the case where update.sh ran but git state didn't move,
        //      e.g. when only dependencies changed).
        const hashChanged = !!startHashRef.current && v.hash !== "unknown" && v.hash !== startHashRef.current;
        const processChanged = !!startStartedAtRef.current && !!v.startedAt && v.startedAt !== startStartedAtRef.current;
        if (hashChanged || processChanged) {
          setVersion(v);
          setStep(5);
          setStepLabel("Update complete");
          setPhase("complete");
          stopPolling();
          return;
        }
        // Server is reachable but still on the old hash/process — we're either
        // mid-build (steps 1–4) or the restart hasn't dropped the connection
        // yet. Keep "running".
        setPhase((p) => (p === "restarting" ? "running" : p));
      } else {
        // Both probes failed (or version probe failed) — treat as restarting.
        // This usually corresponds to step 5/5 ("Restarting services").
        setPhase("restarting");
      }

      // Safety net: if we've been spinning for too long, surface an error so
      // the user isn't staring at a frozen progress bar. This was the
      // long-standing "stuck at 95%" bug — silent systemctl failures (missing
      // NOPASSWD sudoers entry, build error in the new code, etc.) used to
      // leave the UI hanging indefinitely with no actionable message.
      if (restartStartedAtRef.current && Date.now() - restartStartedAtRef.current > RESTART_TIMEOUT_MS) {
        stopPolling();
        setPhase("error");
        setErrorMsg(
          "Update timed out — the server did not come back within 90 seconds. The systemctl restart may have failed silently. Check the log tail above for details, or run `sudo systemctl restart fermentos` from the host shell.",
        );
      }
    }, 2000);
  }, [BASE]);

  const handleUpdate = async () => {
    const preMsg =
      preBackup === "sftp" ? "\n\nA backup will be pushed to SFTP first. If it fails, the update is aborted." :
      preBackup === "local" ? "\n\nA local backup will be saved first. If it fails, the update is aborted." :
      "";
    if (!confirm(`Pull the latest version from GitHub and restart the app?\n\nThe page will go offline briefly during the restart.${preMsg}`)) return;

    // Make absolutely sure no previous poller is still running before we
    // arm a new one — otherwise rapid double-clicks (or clicking Update
    // after a Restart) would leave parallel intervals racing each other.
    stopPolling();
    startHashRef.current = version?.hash ?? null;
    startStartedAtRef.current = version?.startedAt ?? null;
    // Cleared here, then armed by the poller the first time it sees
    // step 5/5 in update.log — see comment on the ref declaration.
    restartStartedAtRef.current = null;
    setPhase("starting");
    setStep(0);
    setStepLabel(preBackup !== "none" ? "Running pre-update backup" : "Starting update");
    setLogTail("");
    setErrorMsg(null);

    try {
      const res = await fetch(`${BASE}api/admin/update`, { method: "POST" });
      const body = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setPhase("running");
      setStepLabel("Update started");
      startPolling();
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  // Progress percentage. While starting (pre-update backup) we fake a small
  // amount of progress so the bar isn't empty. While restarting we pin near
  // the end since the build/restart steps are the slow ones.
  const progressPct = (() => {
    if (phase === "idle" || phase === "error") return 0;
    if (phase === "starting") return 5;
    if (phase === "complete") return 100;
    if (phase === "restarting") return Math.max(95, (step / 5) * 100);
    // running
    return Math.min(95, Math.max(10, (step / 5) * 100));
  })();

  const phaseLabel = (() => {
    if (phase === "starting") return "Preparing…";
    if (phase === "running") return step > 0 ? `Step ${step} of 5 — ${stepLabel}` : (stepLabel || "Running…");
    if (phase === "restarting") return "Restarting service — server is briefly offline";
    if (phase === "complete") return "Update complete";
    return "";
  })();

  const handleRollback = async (entry: HistoryEntry) => {
    if (entry.isCurrent) return;
    const shortHash = entry.hash.slice(0, 7);
    if (!confirm(
      `Roll back to ${shortHash}?\n\n` +
      `"${entry.message ?? "(no message)"}"\n\n` +
      `This will reset the working tree, reinstall dependencies, rebuild, and restart the service. ` +
      `The page will go offline briefly.\n\n` +
      `IMPORTANT: Database schema changes are NOT reverted. If the older code is incompatible with the current database schema, restore a matching database backup separately.`,
    )) return;

    // Mirrors handleUpdate: snapshot the current state, clear refs, kick off
    // the same poller. The api-server hash will change once rollback.sh
    // finishes, which startPolling treats as completion.
    stopPolling();
    startHashRef.current = version?.hash ?? null;
    startStartedAtRef.current = version?.startedAt ?? null;
    restartStartedAtRef.current = null;
    setPhase("starting");
    setStep(0);
    setStepLabel(`Rolling back to ${shortHash}`);
    setLogTail("");
    setErrorMsg(null);

    try {
      const res = await fetch(`${BASE}api/admin/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash: entry.hash }),
      });
      const body = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setPhase("running");
      setStepLabel(`Rolling back to ${shortHash}`);
      startPolling();
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRestartService = async () => {
    if (!confirm("Restart the fermentos service?\n\nThe app will be unreachable for ~5–15 seconds.")) return;

    // Reuse the same poll-and-detect-comeback flow as a full update, but here
    // we expect the hash NOT to change — only the process needs to be replaced.
    // We watch for `startedAt` to change (the ground-truth signal that the
    // process actually restarted) and fall back to `restartPending===false`
    // for older API servers that don't yet expose `startedAt`.
    // Same anti-double-click guard as handleUpdate.
    stopPolling();
    startHashRef.current = version?.hash ?? null;
    startStartedAtRef.current = version?.startedAt ?? null;
    // The restart-only flow IS the restart phase, so arm the comeback
    // clock immediately — there's no slow build phase to wait through.
    restartStartedAtRef.current = Date.now();
    setPhase("starting");
    setStep(0);
    setStepLabel("Restarting service");
    setLogTail("");
    setErrorMsg(null);

    try {
      const res = await fetch(`${BASE}api/admin/restart-service`, { method: "POST" });
      const body = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setPhase("running");
      setStep(5);
      setStepLabel("Restarting service");
      stopPolling();
      pollRef.current = setInterval(async () => {
        // Pull the update.log tail too — the restart command now appends its
        // own stderr there, so a missing-sudoers failure shows up live.
        const [logRes, verRes] = await Promise.allSettled([
          fetch(`${BASE}api/admin/update-log`).then((r) => r.ok ? r.json() as Promise<{ log: string | null }> : Promise.reject(new Error(`HTTP ${r.status}`))),
          fetch(`${BASE}api/admin/version`, { cache: "no-store" }).then((r) => r.ok ? r.json() as Promise<VersionInfo> : Promise.reject(new Error(`HTTP ${r.status}`))),
        ]);
        if (logRes.status === "fulfilled" && logRes.value.log) {
          setLogTail(logRes.value.log.split("\n").slice(-12).join("\n"));
        }
        if (verRes.status === "fulfilled") {
          const v = verRes.value;
          const processChanged = !!startStartedAtRef.current && !!v.startedAt && v.startedAt !== startStartedAtRef.current;
          // Fallback for installs running an older api-server that doesn't
          // emit startedAt yet — keep the original restartPending heuristic.
          const fallbackPendingClear = v.startedAt === undefined && v.restartPending === false;
          if (processChanged || fallbackPendingClear) {
            setVersion(v);
            setStep(5);
            setStepLabel("Service restarted");
            setPhase("complete");
            stopPolling();
            return;
          }
          setPhase((p) => (p === "restarting" ? "running" : p));
        } else {
          setPhase("restarting");
        }
        if (restartStartedAtRef.current && Date.now() - restartStartedAtRef.current > RESTART_TIMEOUT_MS) {
          stopPolling();
          setPhase("error");
          setErrorMsg(
            "Restart timed out — the service did not come back within 90 seconds. The systemctl restart may have failed silently (often a missing `NOPASSWD` sudoers entry for `systemctl restart fermentos`). Check the log tail above, or run the restart manually from the host shell.",
          );
        }
      }, 2000);
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  if (!version) {
    return <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-md" />)}</div>;
  }

  const inProgress = phase === "starting" || phase === "running" || phase === "restarting";
  const restartPending = !!version.restartPending && phase === "idle";
  // Active lock from any source — this tab, another tab, or a CLI invocation.
  // We treat "lock present + idle in this tab" as "another session is doing
  // it" so we don't accidentally start a parallel update.
  const externalLock = phase === "idle" && version.lock && !version.lock.stale ? version.lock : null;
  const staleLock = phase === "idle" && version.lock && version.lock.stale ? version.lock : null;
  const sudoBroken = version.sudoOk === false;
  const buttonsDisabled = inProgress || !!externalLock;

  const handleClearStaleLock = async () => {
    if (!confirm("Force-clear the stuck update lock?\n\nOnly do this if you're sure no update or rollback is actually still running.")) return;
    try {
      const res = await fetch(`${BASE}api/admin/update-lock/clear`, { method: "POST" });
      const body = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      fetchVersion();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  // Copy-paste curl command pointing at this api-server. Built from the
  // browser's URL so it works regardless of the homelab's hostname / port.
  const repairCurlCmd = `curl -sSL ${window.location.origin}${BASE}api/admin/repair-script | sudo bash`;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="font-mono text-foreground">{version.hash}</span>
            <span className="text-xs text-muted-foreground">on {version.branch}</span>
            {version.updateAvailable && phase === "idle" && (
              <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">Update available</span>
            )}
          </div>
          {version.message && <p className="text-xs text-muted-foreground truncate" title={version.message}>{version.message}</p>}
          {version.date && (
            <p className="text-xs text-muted-foreground">
              {new Date(version.date).toLocaleString()}
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={fetchVersion} disabled={checking || inProgress}>
          {checking ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Check for updates
        </Button>
      </div>

      {sudoBroken && phase === "idle" && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
          <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">Repair install</div>
              <div className="text-xs opacity-80 mt-0.5">
                Passwordless sudo isn't configured for the service user. The Update,
                Restart, Rollback, and Reboot buttons will all fail until this is
                fixed. Run this once on the host (no other shell steps needed):
              </div>
            </div>
          </div>
          <div className="flex items-stretch gap-2">
            <pre className="flex-1 text-[10px] leading-snug font-mono bg-background/60 border border-amber-500/30 rounded p-2 overflow-x-auto whitespace-pre">{repairCurlCmd}</pre>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(repairCurlCmd).catch(() => {});
                toast({ title: "Copied", description: "Paste into a shell on the host." });
              }}
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" />
              Copy
            </Button>
          </div>
          <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80">
            What it does: writes <code className="font-mono">/etc/sudoers.d/fermentos</code>
            {" "}so this app can restart its own service. Validated with
            {" "}<code className="font-mono">visudo</code> before install — safe to re-run.
          </p>
        </div>
      )}

      {externalLock && (
        <div className="flex items-start gap-3 text-sm rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400 p-3">
          <Loader2 className="w-4 h-4 shrink-0 mt-0.5 animate-spin" />
          <div className="flex-1">
            <div className="font-medium">
              {externalLock.kind === "rollback" ? "Rollback" : "Update"} in progress
            </div>
            <div className="text-xs opacity-80">
              Started {Math.floor(externalLock.ageMs / 1000)}s ago — likely from another browser tab.
              The buttons below are disabled until it finishes.
            </div>
          </div>
        </div>
      )}

      {staleLock && (
        <div className="flex items-start gap-3 text-sm rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div>
              <div className="font-medium">Stuck {staleLock.kind} lock</div>
              <div className="text-xs opacity-80">
                A {staleLock.kind} started {Math.floor(staleLock.ageMs / 60000)} min ago and hasn't finished.
                It's almost certainly crashed. Clear it to re-enable the buttons.
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleClearStaleLock}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Force-clear lock
            </Button>
          </div>
        </div>
      )}

      {restartPending && (
        <div className="flex items-start gap-3 text-sm rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Restart pending</div>
            <div className="text-xs opacity-80">
              Code on disk is <span className="font-mono">{version.hash}</span> but the running process is still
              {" "}<span className="font-mono">{version.runningHash}</span>. Use the button below to apply it.
            </div>
          </div>
        </div>
      )}

      {phase === "idle" && releases.length > 0 && (
        <div className="rounded-md border border-border">
          <button
            type="button"
            onClick={() => setReleasesOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {releasesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Package className="w-3.5 h-3.5" />
              <span>Release notes</span>
              {releases.some((r) => r.isNewerThanCurrent) && (
                <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                  {releases.filter((r) => r.isNewerThanCurrent).length} new
                </span>
              )}
            </span>
            <span className="text-[10px] text-muted-foreground">{releases[0]?.tag}</span>
          </button>
          {releasesOpen && (
            <div className="border-t border-border divide-y divide-border">
              {releasesError && (
                <div className="px-3 py-2 text-xs text-muted-foreground">{releasesError}</div>
              )}
              {releases.map((rel) => (
                <div key={rel.tag + (rel.publishedAt ?? "")} className="px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={rel.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono font-medium text-foreground hover:underline"
                    >
                      {rel.tag}
                    </a>
                    {rel.name && rel.name !== rel.tag && (
                      <span className="text-xs text-muted-foreground truncate">{rel.name}</span>
                    )}
                    {rel.prerelease && (
                      <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                        Pre-release
                      </span>
                    )}
                    {rel.isNewerThanCurrent && (
                      <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                        Newer than current
                      </span>
                    )}
                    {rel.publishedAt && (
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(rel.publishedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {rel.body ? (
                    <div
                      className="text-xs text-muted-foreground leading-relaxed max-h-48 overflow-auto"
                      // Body is sanitized server-side-style: escapeHtml + whitelist
                      // transforms in renderReleaseMarkdown. No raw HTML reaches here.
                      dangerouslySetInnerHTML={{ __html: renderReleaseMarkdown(rel.body) }}
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground italic">No release notes.</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {preBackup !== "none" && phase === "idle" && !restartPending && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md border border-dashed border-border p-3">
          <Database className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
          <span>
            Pre-update backup is set to <span className="text-foreground font-medium">{preBackup === "sftp" ? "Push to SFTP" : "Save Local"}</span>.
            If the backup fails the update will be aborted. Change this in <em>Backup Options</em> below.
          </span>
        </div>
      )}

      {phase === "idle" && (
        <div className="flex flex-wrap gap-2">
          {version.updateAvailable ? (
            <Button size="sm" onClick={handleUpdate} disabled={buttonsDisabled}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Update now
            </Button>
          ) : restartPending ? (
            <Button size="sm" onClick={handleRestartService} disabled={buttonsDisabled}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Restart to apply
            </Button>
          ) : (
            <Button size="sm" disabled>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Up to date
            </Button>
          )}
        </div>
      )}

      {(inProgress || phase === "complete") && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5 min-w-0 truncate">
              {phase === "complete"
                ? <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
                : <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
              <span className="truncate">{phaseLabel}</span>
            </span>
            <span className="font-mono text-muted-foreground tabular-nums shrink-0 ml-2">{Math.round(progressPct)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${phase === "complete" ? "bg-green-600" : "bg-primary"}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {logTail && phase !== "complete" && (
            <pre className="text-[10px] leading-snug font-mono text-muted-foreground bg-muted/40 border border-border rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap break-words">
              {logTail}
            </pre>
          )}
        </div>
      )}

      {phase === "complete" && (
        <div className="flex items-start gap-3 text-sm rounded-md border border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400 p-3">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div>
              <div className="font-medium">Update finished — running {version.hash}</div>
              <div className="text-xs opacity-80">Reload the page to load the new app code.</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => window.location.reload()}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Reload now
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setPhase("idle"); setStep(0); setLogTail(""); }}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === "idle" && history.length > 0 && (
        <div className="rounded-md border border-border">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {historyOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <History className="w-3.5 h-3.5" />
              <span>Deploy history ({history.length})</span>
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Roll back</span>
          </button>
          {historyOpen && (
            <ul className="border-t border-border divide-y divide-border">
              {history.map((entry) => (
                <li key={entry.hash + entry.deployedAt} className="px-3 py-2 flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-foreground">{entry.hash.slice(0, 7)}</span>
                      {entry.isCurrent && (
                        <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/30">
                          Current
                        </span>
                      )}
                      {entry.branch && (
                        <span className="text-[10px] text-muted-foreground">on {entry.branch}</span>
                      )}
                    </div>
                    {entry.message && (
                      <p className="text-xs text-muted-foreground truncate" title={entry.message}>
                        {entry.message}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      Deployed {new Date(entry.deployedAt).toLocaleString()}
                    </p>
                  </div>
                  {!entry.isCurrent && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRollback(entry)}
                      disabled={buttonsDisabled}
                      className="shrink-0"
                    >
                      <Undo2 className="w-3.5 h-3.5 mr-1.5" />
                      Roll back
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {phase === "error" && (
        <div className="flex items-start gap-2 text-sm rounded-md border border-destructive/30 bg-destructive/10 text-destructive p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Update failed</div>
            {errorMsg && <div className="text-xs opacity-80 break-words mt-0.5">{errorMsg}</div>}
            <Button size="sm" variant="outline" className="mt-2" onClick={() => { setPhase("idle"); setErrorMsg(null); }}>
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function RebootPanel() {
  const BASE = import.meta.env.BASE_URL;
  const { toast } = useToast();
  const [phase, setPhase] = useState<"idle" | "rebooting" | "back">("idle");
  const [secondsDown, setSecondsDown] = useState(0);
  const probeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopProbe = () => {
    if (probeRef.current) { clearInterval(probeRef.current); probeRef.current = null; }
  };

  useEffect(() => () => stopProbe(), []);

  const handleReboot = async () => {
    if (!confirm(
      "Reboot the host machine?\n\n" +
      "The app will be unreachable for ~30–90 seconds. Any in-progress brew session timers on the device will be interrupted."
    )) return;

    setPhase("rebooting");
    setSecondsDown(0);
    try {
      const res = await fetch(`${BASE}api/admin/reboot`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
    } catch (e) {
      setPhase("idle");
      toast({ title: "Reboot failed to start", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      return;
    }

    // Wait for the host to drop and come back. We poll every 2 s; once we get
    // a successful response after having seen failures, we know it's back.
    let sawFailure = false;
    const start = Date.now();
    probeRef.current = setInterval(async () => {
      setSecondsDown(Math.floor((Date.now() - start) / 1000));
      try {
        const res = await fetch(`${BASE}api/admin/version`, { cache: "no-store" });
        if (!res.ok) throw new Error("not ok");
        if (sawFailure) {
          setPhase("back");
          stopProbe();
        }
      } catch {
        sawFailure = true;
      }
    }, 2000);
  };

  if (phase === "rebooting") {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 text-sm rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3">
          <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Reboot in progress</div>
            <div className="text-xs opacity-80">
              The host is restarting. Server has been unreachable for {secondsDown}s. This page will tell you when it comes back.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "back") {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 text-sm rounded-md border border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400 p-3">
          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div>
              <div className="font-medium">Host is back online</div>
              <div className="text-xs opacity-80">Reload the page to reconnect cleanly.</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => window.location.reload()}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Reload now
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPhase("idle")}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md border border-dashed border-border p-3">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
        <span>
          Reboots the entire host (not just the app). Use this if you've changed system-level config or things feel stuck. Make sure no brew session is running first — any device-side timers will be interrupted.
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleReboot}
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Power className="w-3.5 h-3.5 mr-1.5" />
        Reboot Host
      </Button>
    </div>
  );
}

type ApiToken = {
  id: number;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

function ApiAccessPanel() {
  const BASE = import.meta.env.BASE_URL;
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [required, setRequired] = useState(false);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedToken, setRevealedToken] = useState<{ id: number; token: string } | null>(null);
  const [savingToggle, setSavingToggle] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/admin/auth/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { required: boolean; tokens: ApiToken[] };
      setRequired(data.required);
      setTokens(data.tokens);
    } catch (e) {
      toast({ title: "Failed to load API access settings", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [BASE, toast]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (next: boolean) => {
    if (next && tokens.length === 0) {
      toast({ title: "Create a token first", description: "Add at least one API token before enabling lockdown.", variant: "destructive" });
      return;
    }
    setSavingToggle(true);
    try {
      const res = await fetch(`${BASE}api/admin/auth/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ required: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setRequired(next);
      toast({ title: next ? "API lockdown enabled" : "API lockdown disabled" });
    } catch (e) {
      toast({ title: "Failed to update", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSavingToggle(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch(`${BASE}api/admin/auth/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const created = await res.json() as ApiToken & { token: string };
      setTokens((t) => [{ id: created.id, name: created.name, prefix: created.prefix, createdAt: created.createdAt, lastUsedAt: created.lastUsedAt }, ...t]);
      setRevealedToken({ id: created.id, token: created.token });
      setNewName("");
      toast({ title: "Token created — copy it now!" });
    } catch (e) {
      toast({ title: "Failed to create token", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (token: ApiToken) => {
    if (!confirm(`Revoke token "${token.name}"? Any client using it will stop working immediately.`)) return;
    try {
      const res = await fetch(`${BASE}api/admin/auth/tokens/${token.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTokens((t) => t.filter((x) => x.id !== token.id));
      if (revealedToken?.id === token.id) setRevealedToken(null);
      // Reload to pick up auto-disabled lockdown if this was the last token.
      await load();
      toast({ title: "Token revoked" });
    } catch (e) {
      toast({ title: "Failed to revoke", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-md" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 p-3 rounded-md border border-border bg-background">
        <div className="space-y-0.5">
          <div className="text-sm font-medium text-foreground">Require API token for external clients</div>
          <div className="text-xs text-muted-foreground">
            When enabled, any request without a valid <code>Authorization: Bearer …</code> header is rejected unless it comes from this site's web UI.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={required}
          disabled={savingToggle || (tokens.length === 0 && !required)}
          onClick={() => handleToggle(!required)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${required ? "bg-primary" : "bg-muted"} ${savingToggle || (tokens.length === 0 && !required) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${required ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      {tokens.length === 0 && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md border border-dashed border-border p-3">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <span>You don't have any tokens yet. Create one below before enabling lockdown.</span>
        </div>
      )}

      {revealedToken && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
            <KeyRound className="w-4 h-4" />
            Save this token now — it won't be shown again
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono break-all bg-background border border-border rounded px-2 py-1.5 text-foreground">
              {revealedToken.token}
            </code>
            <Button size="sm" variant="outline" onClick={() => handleCopy(revealedToken.token)}>
              <Copy className="w-3.5 h-3.5 mr-1.5" />Copy
            </Button>
          </div>
          <button onClick={() => setRevealedToken(null)} className="text-xs text-muted-foreground hover:text-foreground">
            I've saved it — hide
          </button>
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Create New Token</div>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g., Home Assistant, mobile app"
            className="text-sm"
            maxLength={80}
          />
          <Button type="submit" size="sm" disabled={creating || !newName.trim()}>
            {creating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
            Generate
          </Button>
        </div>
      </form>

      {tokens.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active Tokens</div>
          <div className="space-y-1">
            {tokens.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-border bg-background group hover:border-primary/30 transition-colors">
                <KeyRound className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-foreground truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {t.prefix}…
                    <span className="ml-2 font-sans">
                      created {new Date(t.createdAt).toLocaleDateString()}
                      {t.lastUsedAt ? ` · last used ${new Date(t.lastUsedAt).toLocaleString()}` : " · never used"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(t)}
                  className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-colors"
                  title="Revoke token"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground border-t border-border pt-3 space-y-1">
        <div className="font-medium text-foreground">Usage</div>
        <pre className="bg-background border border-border rounded p-2 overflow-x-auto text-[11px] leading-relaxed">{`curl -H "Authorization: Bearer <your-token>" \\
  http://${typeof window !== "undefined" ? window.location.host : "your-pi"}${BASE}api/recipes`}</pre>
      </div>
    </div>
  );
}

type UnitSystem = "imperial" | "metric" | "both";

function UnitSystemPanel() {
  const BASE = import.meta.env.BASE_URL;
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [system, setSystem] = useState<UnitSystem>("imperial");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${BASE}api/settings/unit-system`)
      .then((r) => r.json())
      .then((d: { system: UnitSystem }) => setSystem(d.system))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [BASE]);

  const handleChange = async (next: UnitSystem) => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}api/settings/unit-system`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSystem(next);
      toast({ title: "Unit system updated" });
    } catch (e) {
      toast({ title: "Failed to update", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-24 rounded-md" />;

  const options: Array<{ value: UnitSystem; label: string; desc: string }> = [
    { value: "imperial", label: "Imperial", desc: "lbs, oz, gal, fl oz, tsp, tbsp" },
    { value: "metric",   label: "Metric",   desc: "kg, g, L, mL, tsp, tbsp" },
    { value: "both",     label: "Both",     desc: "All imperial and metric units" },
  ];

  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={saving}
          onClick={() => handleChange(opt.value)}
          className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border text-left transition-colors ${
            system === opt.value
              ? "border-primary bg-primary/5 text-foreground"
              : "border-border bg-background text-foreground hover:border-primary/50"
          } ${saving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <div>
            <div className="text-sm font-medium">{opt.label}</div>
            <div className="text-xs text-muted-foreground">{opt.desc}</div>
          </div>
          <div className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${system === opt.value ? "border-primary" : "border-muted-foreground/30"}`}>
            {system === opt.value && <div className="h-2 w-2 rounded-full bg-primary" />}
          </div>
        </button>
      ))}
    </div>
  );
}

function InventoryEnforcementPanel() {
  const BASE = import.meta.env.BASE_URL;
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/settings/inventory-enforcement`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { enabled: boolean };
      setEnabled(data.enabled);
    } catch (e) {
      toast({ title: "Failed to load setting", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [BASE, toast]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}api/settings/inventory-enforcement`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEnabled(next);
      toast({ title: next ? "Inventory enforcement enabled" : "Inventory enforcement disabled" });
    } catch (e) {
      toast({ title: "Failed to update", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-16 rounded-md" />;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 p-3 rounded-md border border-border bg-background">
        <div className="space-y-0.5">
          <div className="text-sm font-medium text-foreground">Require ingredients to start a brew</div>
          <div className="text-xs text-muted-foreground">
            When enabled, starting a brew session linked to a recipe will check that all ingredients are on hand and deduct them. Sessions without a linked recipe are unaffected.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={() => handleToggle(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted"} ${saving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
      <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md border border-dashed border-border p-3">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
        <span>Ingredients are matched by name + type + unit. If a recipe calls for "Cascade hops · oz" but you only have it stored as "g", the check will fail. Keep names and units consistent across recipes and ingredients for this to work smoothly.</span>
      </div>
    </div>
  );
}

type SettingsTab = "brewing" | "system";

export default function Settings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: styles, isLoading } = useListBeerStyles();
  const [newStyle, setNewStyle] = useState("");

  const createMutation = useCreateBeerStyle({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBeerStylesQueryKey() });
        setNewStyle("");
        toast({ title: "Style added" });
      },
      onError: () => toast({ title: "Failed to add style", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteBeerStyle({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBeerStylesQueryKey() });
        toast({ title: "Style removed" });
      },
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newStyle.trim();
    if (!name) return;
    createMutation.mutate({ data: { name } });
  };

  const [tab, setTab] = useState<SettingsTab>("brewing");

  const beerStylesCard = (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 border-b border-card-border">
        <h2 className="text-sm font-semibold text-foreground">Beer Styles</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Define the styles available in the recipe dropdown.
        </p>
      </div>
      <div className="p-4 space-y-3">
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            value={newStyle}
            onChange={(e) => setNewStyle(e.target.value)}
            placeholder="e.g., American IPA"
            className="text-sm"
          />
          <Button type="submit" size="sm" disabled={createMutation.isPending || !newStyle.trim()}>
            <Plus className="w-3.5 h-3.5 mr-1" />Add
          </Button>
        </form>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        ) : styles && styles.length > 0 ? (
          <div className="space-y-1">
            {styles.map((style) => (
              <div
                key={style.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-border bg-background group hover:border-primary/30 transition-colors"
              >
                <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                <span className="flex-1 text-sm text-foreground">{style.name}</span>
                <button
                  onClick={() => {
                    if (confirm(`Remove "${style.name}"?`)) {
                      deleteMutation.mutate({ id: style.id });
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No styles yet — add your first one above.
          </p>
        )}
      </div>
    </div>
  );

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: "brewing", label: "Brewing", icon: <Beer className="w-3.5 h-3.5" /> },
    { id: "system", label: "System", icon: <Server className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <SettingsIcon className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "brewing" && (
        <div className="space-y-5">
          {beerStylesCard}

          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <Beer className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Unit System</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose which units appear in the ingredients form. Affects new entries only — existing ingredient items keep their current units.
              </p>
            </div>
            <div className="p-4">
              <UnitSystemPanel />
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Ingredient Enforcement</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Optionally require ingredients to be on hand (and deduct them) when starting a brew session from a recipe.
              </p>
            </div>
            <div className="p-4">
              <InventoryEnforcementPanel />
            </div>
          </div>
        </div>
      )}

      {tab === "system" && (
        <div className="space-y-5">
          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">App Update</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Check for the latest version on GitHub and apply updates. Configure pre-update backups in Backup Options below.</p>
            </div>
            <div className="p-4">
              <SystemUpdatePanel />
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <Power className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Reboot Host</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Restart the host. The app will be offline for about a minute.</p>
            </div>
            <div className="p-4">
              <RebootPanel />
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Backup Options</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Export the database manually, save locally, or push to an SFTP server on a schedule. Configure retention and pre-update safety backups.</p>
            </div>
            <div className="p-4">
              <DatabaseBackupPanel />
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">API Access</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Optionally require an API token for external clients (scripts, integrations, mobile apps). Browser requests from this site keep working without a token. This is a homelab-grade lock — sufficient to deflect casual probes, not a substitute for network-level security.
              </p>
            </div>
            <div className="p-4">
              <ApiAccessPanel />
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border">
              <h2 className="text-sm font-semibold text-foreground">System Stats</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Live host system performance — CPU, memory, disk, and network.</p>
            </div>
            <div className="p-4">
              <SystemStatsPanel />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
