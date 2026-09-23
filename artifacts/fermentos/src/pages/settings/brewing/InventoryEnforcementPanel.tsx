import { useState, useEffect, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BASE } from "../shared";

export function InventoryEnforcementPanel() {
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
  }, [toast]);

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
