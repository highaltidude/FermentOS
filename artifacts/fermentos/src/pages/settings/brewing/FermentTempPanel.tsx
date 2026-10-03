import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BASE } from "../shared";

export function FermentTempPanel() {
  const { toast } = useToast();
  const [unit, setUnit] = useState<"F" | "C">("F");
  const [alertCount, setAlertCount] = useState(2);
  const [autoConditioning, setAutoConditioning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}api/settings/ferment-temp-unit`).then((r) => r.json() as Promise<{ unit: string }>),
      fetch(`${BASE}api/settings/temp-alert-readings`).then((r) => r.json() as Promise<{ count: number }>),
      fetch(`${BASE}api/settings/auto-conditioning`).then((r) => r.json() as Promise<{ enabled: boolean }>),
    ])
      .then(([unitData, countData, autoData]) => {
        setUnit(unitData.unit === "C" ? "C" : "F");
        setAlertCount(countData.count ?? 2);
        setAutoConditioning(autoData.enabled ?? false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleUnitChange = async (next: "F" | "C") => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}api/settings/ferment-temp-unit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUnit(next);
      toast({ title: "Temperature unit updated" });
    } catch (e) {
      toast({ title: "Failed to update", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAlertCountChange = async (next: number) => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}api/settings/temp-alert-readings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAlertCount(next);
      toast({ title: "Alert threshold updated" });
    } catch (e) {
      toast({ title: "Failed to update", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAutoConditioningChange = async (next: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}api/settings/auto-conditioning`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAutoConditioning(next);
      toast({ title: next ? "Auto-conditioning enabled" : "Auto-conditioning disabled" });
    } catch (e) {
      toast({ title: "Failed to update", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-24 rounded-md" />;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 p-3 rounded-md border border-border bg-background">
        <div className="space-y-0.5">
          <div className="text-sm font-medium text-foreground">Temperature Unit</div>
          <div className="text-xs text-muted-foreground">Used for fermentation temperature thresholds and alerts</div>
        </div>
        <div className="flex items-center rounded-md border border-border bg-muted/30 overflow-hidden shrink-0">
          {(["F", "C"] as const).map((u) => (
            <button
              key={u}
              type="button"
              disabled={saving}
              onClick={() => handleUnitChange(u)}
              className={`px-3 py-1.5 text-xs transition-colors ${unit === u ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground"} ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              °{u}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-start justify-between gap-3 p-3 rounded-md border border-border bg-background">
        <div className="space-y-0.5 flex-1">
          <div className="text-sm font-medium text-foreground">Temperature Alert Threshold</div>
          <div className="text-xs text-muted-foreground">Number of consecutive out-of-range readings before alerting</div>
        </div>
        <select
          value={alertCount}
          disabled={saving}
          onChange={(e) => handleAlertCountChange(Number(e.target.value))}
          className="text-sm rounded-md border border-input bg-background px-2 py-1.5 shrink-0 disabled:opacity-50"
        >
          {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
            <option key={n} value={n}>{n} readings</option>
          ))}
        </select>
      </div>
      <div className="flex items-start justify-between gap-3 p-3 rounded-md border border-border bg-background">
        <div className="space-y-0.5">
          <div className="text-sm font-medium text-foreground">Auto-advance to Conditioning</div>
          <div className="text-xs text-muted-foreground">
            Global default — automatically move fermenting sessions to conditioning when gravity has been stable for 24+ hours. Can be overridden per-brew.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autoConditioning}
          disabled={saving}
          onClick={() => handleAutoConditioningChange(!autoConditioning)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${autoConditioning ? "bg-primary" : "bg-input"}`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${autoConditioning ? "translate-x-4" : "translate-x-1"}`} />
        </button>
      </div>
    </div>
  );
}
