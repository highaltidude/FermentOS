import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BASE } from "../shared";

type UnitSystem = "imperial" | "metric" | "both";

export function UnitSystemPanel() {
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
  }, []);

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
