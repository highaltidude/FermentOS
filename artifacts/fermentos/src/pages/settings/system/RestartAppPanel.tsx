import { useState, useEffect, useRef } from "react";
import { RefreshCw, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BASE, RESTART_TIMEOUT_MS, type VersionInfo } from "../shared";

export function RestartAppPanel() {
  const [phase, setPhase] = useState<"idle" | "restarting" | "complete" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [logTail, setLogTail] = useState("");
  const probeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const restartStartedAtRef = useRef<number | null>(null);

  const stopProbe = () => {
    if (probeRef.current) { clearInterval(probeRef.current); probeRef.current = null; }
  };

  useEffect(() => () => stopProbe(), []);

  const handleReloadNow = () => {
    window.location.reload();
  };

  const handleRestart = async () => {
    if (!confirm("Restart the fermentos service?\n\nThe app will be unreachable for ~5–15 seconds.")) return;
    stopProbe();
    setPhase("restarting");
    setErrorMsg(null);
    setLogTail("");
    restartStartedAtRef.current = Date.now();

    try {
      const vr = await fetch(`${BASE}api/admin/version`, { cache: "no-store" });
      if (vr.ok) {
        const v = await vr.json() as VersionInfo;
        startedAtRef.current = v.startedAt ?? null;
      }
    } catch { /* ignore */ }

    try {
      const res = await fetch(`${BASE}api/admin/restart-service`, { method: "POST" });
      const body = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
      return;
    }

    probeRef.current = setInterval(async () => {
      const [logRes, verRes] = await Promise.allSettled([
        fetch(`${BASE}api/admin/update-log`).then((r) => r.ok ? r.json() as Promise<{ log: string | null }> : Promise.reject()),
        fetch(`${BASE}api/admin/version`, { cache: "no-store" }).then((r) => r.ok ? r.json() as Promise<VersionInfo> : Promise.reject()),
      ]);

      if (logRes.status === "fulfilled" && logRes.value.log) {
        setLogTail(logRes.value.log.split("\n").slice(-6).join("\n"));
      }

      if (verRes.status === "fulfilled") {
        const v = verRes.value;
        const processChanged = !!startedAtRef.current && !!v.startedAt && v.startedAt !== startedAtRef.current;
        const fallbackClear = v.startedAt === undefined && v.restartPending === false;
        if (processChanged || fallbackClear) {
          setPhase("complete");
          stopProbe();
          return;
        }
      }

      if (restartStartedAtRef.current && Date.now() - restartStartedAtRef.current > RESTART_TIMEOUT_MS) {
        stopProbe();
        setPhase("error");
        setErrorMsg("Restart timed out — the service did not come back within 120 seconds. Check your sudoers config or run `sudo systemctl restart fermentos` from the host shell.");
      }
    }, 2000);
  };

  if (phase === "restarting") {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 text-sm rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3">
          <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Service restarting…</div>
            <div className="text-xs opacity-80">The app will be back in ~5–15 seconds.</div>
          </div>
        </div>
        {logTail && (
          <pre className="text-[10px] leading-snug font-mono text-muted-foreground bg-muted/40 border border-border rounded p-2 max-h-24 overflow-auto whitespace-pre-wrap">{logTail}</pre>
        )}
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div className="flex items-start gap-3 text-sm rounded-md border border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400 p-3">
        <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="font-medium">Service restarted — reload to reconnect cleanly.</div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleReloadNow}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Reload now
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setPhase("idle"); setLogTail(""); }}>Dismiss</Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex items-start gap-2 text-sm rounded-md border border-destructive/30 bg-destructive/10 text-destructive p-3">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="font-medium">Restart failed</div>
          {errorMsg && <div className="text-xs opacity-80 break-words mt-0.5">{errorMsg}</div>}
          <Button size="sm" variant="outline" className="mt-2" onClick={() => { setPhase("idle"); setErrorMsg(null); }}>Dismiss</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md border border-dashed border-border p-3">
        <RefreshCw className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>Restarts the fermentos service without rebooting the host. Use this after config changes or if the app feels stuck. The page will be offline for ~5–15 seconds.</span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleRestart}
        className="border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
      >
        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
        Restart App
      </Button>
    </div>
  );
}
