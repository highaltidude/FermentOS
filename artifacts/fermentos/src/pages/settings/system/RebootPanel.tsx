import { useState, useEffect, useRef } from "react";
import { RefreshCw, CheckCircle, Loader2, AlertTriangle, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { BASE } from "../shared";

export function RebootPanel() {
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
