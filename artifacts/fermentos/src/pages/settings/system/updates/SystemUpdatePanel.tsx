import { useState, useEffect, useRef, useCallback } from "react";
import {
  RefreshCw,
  Database,
  CheckCircle,
  Loader2,
  Copy,
  AlertTriangle,
  Package,
  GitBranch,
  AlertCircle,
  History,
  Undo2,
  ChevronDown,
  ChevronRight,
  Check,
  Info,
  Tag,
} from "lucide-react";
import { useGetBackupAudit } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BASE, RESTART_TIMEOUT_MS, type BackupBeforeUpdate, type VersionInfo } from "../../shared";
import { renderReleaseMarkdown } from "./releaseMarkdown";
import { parseLastStep, timeAgo, type HistoryEntry, type ReleaseNote, type UpdatePhase } from "./updateSteps";

export function SystemUpdatePanel() {
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
  // Only the newest release auto-expands; older ones start collapsed to a
  // summary row so opening "Release notes" doesn't dump every changelog at
  // once. Tracks tags the user has manually expanded.
  const [expandedReleaseTags, setExpandedReleaseTags] = useState<Set<string>>(new Set());
  // Shares the backup panel's query. isError matters as much as the value:
  // an unreadable audit is not the same as a passing one, and the button must
  // not imply a safety check that never ran. The server enforces this too.
  const { data: auditData, isError: auditError, refetch: refetchAuditCoverage } = useGetBackupAudit();
  const auditCoverage = auditData?.coveragePercent ?? null;
  const auditBlocksUpdate = auditError || (auditCoverage !== null && auditCoverage < 100);
  const [copiedHash, setCopiedHash] = useState(false);
  const logBoxRef = useRef<HTMLPreElement>(null);
  const startHashRef = useRef<string | null>(null);
  // Snapshot of the api-server's PROCESS_STARTED_AT taken right before we
  // request a restart. The poller treats "startedAt has changed" as the
  // definitive sign that the process actually restarted — more reliable than
  // hash/restartPending comparisons, which depend on git state being right.
  const startStartedAtRef = useRef<string | null>(null);
  // Wall-clock timestamp at which the *restart* phase began (NOT the whole
  // update). The 120-second comeback budget is measured from here. We only
  // arm this clock once we observe step 5/5 in the log (or immediately for
  // the restart-only flow), so a slow `pnpm install` / `pnpm build` on a
  // Pi 4 — easily 2–5 minutes — never trips the comeback timeout.
  const restartStartedAtRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyAbortRef = useRef(false);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    verifyAbortRef.current = true;
  };

  const fetchVersion = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`${BASE}api/admin/version`);
      if (res.ok) setVersion(await res.json() as VersionInfo);
    } catch { /* ignore */ } finally {
      setChecking(false);
    }
  }, []);

  const fetchPreBackup = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/backup/config`);
      if (res.ok) {
        const data = await res.json() as { config: { backupBeforeUpdate?: BackupBeforeUpdate } };
        setPreBackup(data.config.backupBeforeUpdate ?? "none");
      }
    } catch { /* ignore */ }
  }, []);

  const fetchReleases = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/admin/release-notes`);
      if (res.ok) {
        const data = await res.json() as { entries: ReleaseNote[]; error: string | null };
        setReleases(Array.isArray(data.entries) ? data.entries : []);
        setReleasesError(data.error);
      }
    } catch { /* offline / network — leave the panel hidden */ }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/admin/update-history`);
      if (res.ok) {
        const data = await res.json() as { entries: HistoryEntry[] };
        setHistory(Array.isArray(data.entries) ? data.entries : []);
      }
    } catch { /* ignore — history is non-critical */ }
  }, []);

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
  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [logTail]);

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
        const tail = logRes.value.log.split("\n").slice(-30).join("\n");
        setLogTail(tail);
        const parsed = parseLastStep(logRes.value.log);
        if (parsed) {
          setStep(parsed.step);
          setStepLabel(parsed.label);
          // Arm the 120-second comeback clock the first time we see step 5
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
          setStepLabel("Verifying server is ready…");
          setPhase("verifying");
          // Poll until lock is clear before showing Reload now
          verifyAbortRef.current = false;
          (async () => {
            for (let i = 0; i < 120; i++) {
              if (verifyAbortRef.current) return;
              try {
                const res = await fetch(`${BASE}api/admin/version`);
                if (res.ok) {
                  const data = await res.json() as VersionInfo;
                  if (!data.lock && !verifyAbortRef.current) {
                    setStepLabel("Update complete");
                    setPhase("complete");
                    stopPolling();
                    return;
                  }
                }
              } catch { /* server still starting */ }
              await new Promise((r) => setTimeout(r, 1000));
            }
            if (!verifyAbortRef.current) {
              setStepLabel("Update complete");
              setPhase("complete");
              stopPolling();
            }
          })();
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
          "Update timed out — the server did not come back within 120 seconds. The systemctl restart may have failed silently. Check the log tail above for details, or run `sudo systemctl restart fermentos` from the host shell.",
        );
      }
    }, 2000);
  }, []);

  const handleReloadNow = () => {
    window.location.reload();
  };

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
    verifyAbortRef.current = false;
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
    if (phase === "verifying") return 98;
    if (phase === "restarting") return Math.max(95, (step / 5) * 100);
    // running
    return Math.min(95, Math.max(10, (step / 5) * 100));
  })();

  const phaseLabel = (() => {
    if (phase === "starting") return "Preparing…";
    if (phase === "running") return step > 0 ? `Step ${step} of 5 — ${stepLabel}` : (stepLabel || "Running…");
    if (phase === "restarting") return "Restarting service — server is briefly offline";
    if (phase === "verifying") return "Verifying server is ready…";
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
          setLogTail(logRes.value.log.split("\n").slice(-30).join("\n"));
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
            "Restart timed out — the service did not come back within 120 seconds. The systemctl restart may have failed silently (often a missing `NOPASSWD` sudoers entry for `systemctl restart fermentos`). Check the log tail above, or run the restart manually from the host shell.",
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

  const inProgress = phase === "starting" || phase === "running" || phase === "restarting" || phase === "verifying";
  const restartPending = !!version.restartPending && phase === "idle";
  // Active lock from any source — this tab, another tab, or a CLI invocation.
  // We treat "lock present + idle in this tab" as "another session is doing
  // it" so we don't accidentally start a parallel update.
  const externalLock = phase === "idle" && version.lock && !version.lock.stale ? version.lock : null;
  const staleLock = phase === "idle" && version.lock && version.lock.stale ? version.lock : null;
  const sudoBroken = version.sudoOk === false;
  const isDocker = version.isDocker === true;
  const buttonsDisabled = inProgress || !!externalLock || isDocker;

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

  // Read from package.json by the api-server, not inferred from the release
  // list. The old derivation (first release not newer than the running commit)
  // was always wrong on Docker: isAncestorOfRunning() bails there, so nothing
  // was ever marked newer and this resolved to whatever was newest upstream —
  // showing an available version as though it were the installed one. When this
  // is null we fall through to the commit-only layout, which at least does not
  // claim to know.
  const currentVersionLabel = version.version ?? undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1 min-w-0">
          {currentVersionLabel && (
            <div className="flex items-center gap-2 text-sm">
              <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="font-semibold text-foreground">{currentVersionLabel}</span>
              {version.updateAvailable && phase === "idle" && (
                <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">Update available</span>
              )}
            </div>
          )}
          <div className={`flex items-center gap-2 ${currentVersionLabel ? "text-xs text-muted-foreground" : "text-sm"}`}>
            <GitBranch className={currentVersionLabel ? "w-3 h-3 shrink-0" : "w-3.5 h-3.5 text-muted-foreground shrink-0"} />
            <span className={currentVersionLabel ? "font-mono" : "font-mono text-foreground"}>{version.hash}</span>
            <button
              type="button"
              title="Copy commit hash"
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                navigator.clipboard.writeText(version.hash);
                setCopiedHash(true);
                setTimeout(() => setCopiedHash(false), 2000);
              }}
            >
              {copiedHash
                ? <Check className={currentVersionLabel ? "w-3 h-3" : "w-3.5 h-3.5"} />
                : <Copy className={currentVersionLabel ? "w-3 h-3" : "w-3.5 h-3.5"} />}
            </button>
            <span className={currentVersionLabel ? "" : "text-xs text-muted-foreground"}>on {version.branch}</span>
            {!currentVersionLabel && version.updateAvailable && phase === "idle" && (
              <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">Update available</span>
            )}
          </div>
          {version.message && <p className="text-xs text-muted-foreground truncate" title={version.message}>{version.message}</p>}
          {version.date && (
            <p className="text-xs text-muted-foreground" title={new Date(version.date).toLocaleString()}>
              Deployed {timeAgo(version.date)}
            </p>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => { fetchVersion(); void refetchAuditCoverage(); }} disabled={checking || inProgress} title="Check GitHub for the latest version">
          {checking ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          Check for updates
        </Button>
      </div>

      {isDocker && phase === "idle" && (
        <div className={`rounded-md border p-3 space-y-1 ${version.updateAvailable ? "border-amber-500/30 bg-amber-500/10" : "border-blue-500/30 bg-blue-500/10"}`}>
          <div className={`flex items-start gap-2 text-sm ${version.updateAvailable ? "text-amber-700 dark:text-amber-400" : "text-blue-700 dark:text-blue-400"}`}>
            {version.updateAvailable
              ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              : <Info className="w-4 h-4 shrink-0 mt-0.5" />
            }
            <div className="flex-1">
              <div className="font-medium">
                {version.updateAvailable ? "New version available" : "Running in Docker"}
              </div>
              <div className="text-xs opacity-80 mt-0.5">
                {version.updateAvailable
                  ? "A new version is available on GitHub. Run to update:"
                  : "Update and Rollback aren't available — the source code is baked into the image. Restart works via Docker's restart policy. To update:"}
              </div>
            </div>
          </div>
          <pre className={`text-[10px] leading-snug font-mono bg-background/60 border rounded p-2 overflow-x-auto whitespace-pre ml-6 ${version.updateAvailable ? "border-amber-500/30" : "border-blue-500/30"}`}>bash docker-install.sh</pre>
        </div>
      )}

      {sudoBroken && !isDocker && phase === "idle" && (
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
              {releases.map((rel, i) => {
                // Newest release is always shown expanded; older ones start
                // collapsed to a summary row and expand on click.
                const canToggle = i > 0;
                const isExpanded = !canToggle || expandedReleaseTags.has(rel.tag);
                const header = (
                  <div className="flex items-center gap-2 flex-wrap">
                    {canToggle && (
                      isExpanded
                        ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                        : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                    <a
                      href={rel.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
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
                );
                return (
                  <div key={rel.tag + (rel.publishedAt ?? "")} className="px-3 py-2 space-y-1.5">
                    {canToggle ? (
                      <button
                        type="button"
                        onClick={() => setExpandedReleaseTags((prev) => {
                          const next = new Set(prev);
                          if (next.has(rel.tag)) next.delete(rel.tag); else next.add(rel.tag);
                          return next;
                        })}
                        className="w-full text-left"
                      >
                        {header}
                      </button>
                    ) : header}
                    {isExpanded && (
                      rel.body ? (
                        <div
                          className="text-xs text-muted-foreground leading-relaxed max-h-48 overflow-auto"
                          // Body is sanitized server-side-style: escapeHtml + whitelist
                          // transforms in renderReleaseMarkdown. No raw HTML reaches here.
                          dangerouslySetInnerHTML={{ __html: renderReleaseMarkdown(rel.body) }}
                        />
                      ) : (
                        <div className="text-xs text-muted-foreground italic">No release notes.</div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {auditBlocksUpdate && phase === "idle" && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/8 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="flex-1">
            {auditCoverage === null
              ? <>Backup coverage could not be checked — update is disabled until the audit can be read.</>
              : <>Backup coverage is <strong>{auditCoverage}%</strong> — update is disabled until all schema tables
                are in <code className="font-mono">BACKUP_REGISTRY</code> or <code className="font-mono">EXCLUDED_TABLES</code>.</>}
            {" "}Fix this in Settings → Backups → Backup Audit.
          </span>
          <button
            type="button"
            onClick={() => void refetchAuditCoverage()}
            className="shrink-0 flex items-center gap-1 font-medium underline underline-offset-2 hover:opacity-70 transition-opacity"
            title="Re-run backup audit"
          >
            <RefreshCw className="w-3 h-3" />
            Re-check
          </button>
        </div>
      )}

      {phase === "idle" && (
        <div className="space-y-1.5">
          {preBackup !== "none" && !restartPending && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Database className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                Pre-update backup: <span className="text-foreground font-medium">{preBackup === "sftp" ? "Push to SFTP" : "Save Local"}</span>
                {" "}— if it fails, the update is aborted. Change this in <em>Backup Options</em> below.
              </span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {version.updateAvailable ? (
              <Button size="sm" onClick={handleUpdate} disabled={buttonsDisabled || auditBlocksUpdate}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Update now
              </Button>
            ) : restartPending ? (
              <Button size="sm" onClick={handleRestartService} disabled={buttonsDisabled}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Restart to apply
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-500/15 border border-green-500/30 rounded-md px-2.5 py-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                Up to date
              </span>
            )}
          </div>
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
          {(inProgress || logTail || phase === "complete" || phase === "verifying") && (
            <div className="space-y-2">
              {/* Step indicators */}
              <div className="space-y-1">
                {[
                  { n: 1, label: "Pulling latest changes" },
                  { n: 2, label: "Installing dependencies" },
                  { n: 3, label: "Running database migrations" },
                  { n: 4, label: "Building application" },
                  { n: 5, label: "Restarting services" },
                ].map(({ n, label }) => {
                  const isDone = phase === "complete" || step > n;
                  const isActive = step === n && phase !== "complete";
                  return (
                    <div key={n} className={`flex items-center gap-2 text-xs ${isDone ? "text-green-600 dark:text-green-400" : isActive ? "text-foreground" : "text-muted-foreground opacity-50"}`}>
                      {isDone
                        ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                        : isActive
                          ? <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                          : <div className="w-3.5 h-3.5 shrink-0 rounded-full border border-muted-foreground/30" />
                      }
                      <span>{n}/5 — {label}</span>
                    </div>
                  );
                })}
              </div>
              {/* Raw log output */}
              <pre
                ref={logBoxRef}
                className="text-[10px] leading-snug font-mono text-muted-foreground bg-muted/40 border border-border rounded p-2 h-40 overflow-auto whitespace-pre-wrap break-words"
              >
                {logTail || "Connecting to update service…"}
              </pre>
            </div>
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
              <Button size="sm" onClick={handleReloadNow}>
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
