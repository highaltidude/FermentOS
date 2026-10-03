import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BASE } from "../shared";

const RETENTION_OPTIONS: Array<{ value: number | null; label: string; desc: string }> = [
  { value: null, label: "Forever",  desc: "Never delete readings automatically" },
  { value: 90,   label: "90 days",  desc: "Delete readings older than 3 months" },
  { value: 180,  label: "6 months", desc: "Delete readings older than 6 months" },
  { value: 365,  label: "1 year",   desc: "Delete readings older than 1 year"   },
  { value: 730,  label: "2 years",  desc: "Delete readings older than 2 years"  },
];

export function ReadingRetentionPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${BASE}api/settings/reading-retention`)
      .then((r) => r.json())
      .then((d: { days: number | null }) => setDays(d.days ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = async (next: number | null) => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE}api/settings/reading-retention`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDays(next);
      toast({ title: "Reading retention updated" });
    } catch (e) {
      toast({ title: "Failed to update", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-24 rounded-md" />;

  return (
    <div className="space-y-2">
      {RETENTION_OPTIONS.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          disabled={saving}
          onClick={() => handleChange(opt.value)}
          className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border text-left transition-colors ${
            days === opt.value
              ? "border-primary bg-primary/5 text-foreground"
              : "border-border bg-background text-foreground hover:border-primary/50"
          } ${saving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <div>
            <div className="text-sm font-medium">{opt.label}</div>
            <div className="text-xs text-muted-foreground">{opt.desc}</div>
          </div>
          <div className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${days === opt.value ? "border-primary" : "border-muted-foreground/30"}`}>
            {days === opt.value && <div className="h-2 w-2 rounded-full bg-primary" />}
          </div>
        </button>
      ))}
      <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md border border-dashed border-border p-3">
        <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
        <span>Cleanup runs nightly at 3 AM. Only readings from packaged brew sessions are eligible for deletion — active sessions are never affected.</span>
      </div>
    </div>
  );
}
