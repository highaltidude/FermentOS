import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useCreateBrewSession, useListRecipes } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const STATUSES = ["brew_day", "fermenting", "conditioning", "packaged"];
const STATUS_LABELS: Record<string, string> = {
  brew_day: "Brew Day",
  fermenting: "Fermenting",
  conditioning: "Conditioning",
  packaged: "Packaged",
};

export default function NewBrewSession() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: recipes } = useListRecipes({});
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("none");
  const [form, setForm] = useState({
    recipeName: "", status: "brew_day", brewDate: new Date().toISOString().split("T")[0],
    batchSizeGallons: "5.5", originalGravityActual: "", finalGravityActual: "", notes: "",
  });

  const createMutation = useCreateBrewSession({
    mutation: {
      onSuccess: (session) => {
        toast({ title: "Brew session logged!" });
        navigate(`/brew-sessions/${session.id}`);
      },
      onError: (err: unknown) => {
        // The generated client throws an `ApiError` with `.status` and `.data`
        // directly on the error (see lib/api-client-react/src/custom-fetch.ts).
        // The server returns 409 + shortages[] when inventory enforcement
        // is on and ingredients are missing — surface that to the user.
        type Shortage = { name: string; required: number; available: number; unit: string; reason: string };
        const e = err as { status?: number; data?: { error?: string; shortages?: Shortage[] } };
        if (e?.status === 409 && e.data?.shortages) {
          const lines = e.data.shortages.slice(0, 5).map((s) => {
            if (s.reason === "missing") return `${s.name}: not in inventory (need ${s.required} ${s.unit})`;
            if (s.reason === "unit_mismatch") return `${s.name}: unit mismatch (need ${s.unit})`;
            return `${s.name}: have ${s.available} ${s.unit}, need ${s.required} ${s.unit}`;
          });
          const more = e.data.shortages.length > 5 ? `\n…and ${e.data.shortages.length - 5} more` : "";
          toast({ title: "Insufficient inventory", description: lines.join("\n") + more, variant: "destructive" });
          return;
        }
        toast({ title: "Failed to create session", description: e?.data?.error ?? "Please try again", variant: "destructive" });
      },
    },
  });

  const handleRecipeSelect = (recipeId: string) => {
    setSelectedRecipeId(recipeId);
    if (recipeId && recipeId !== "none") {
      const recipe = recipes?.find((r) => String(r.id) === recipeId);
      if (recipe) {
        setForm((f) => ({
          ...f,
          recipeName: recipe.name,
          batchSizeGallons: String(recipe.batchSizeGallons),
        }));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.recipeName || !form.brewDate) {
      toast({ title: "Recipe name and brew date are required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      data: {
        recipeId: selectedRecipeId && selectedRecipeId !== "none" ? Number(selectedRecipeId) : undefined,
        recipeName: form.recipeName,
        status: form.status as any,
        brewDate: form.brewDate,
        batchSizeGallons: Number(form.batchSizeGallons),
        originalGravityActual: form.originalGravityActual ? Number(form.originalGravityActual) : undefined,
        finalGravityActual: form.finalGravityActual ? Number(form.finalGravityActual) : undefined,
        notes: form.notes || undefined,
      },
    });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/brew-sessions")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-bold text-foreground">Log a Brew Session</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-card border border-card-border rounded-lg p-4 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Link to Recipe (optional)</label>
          <Select value={selectedRecipeId} onValueChange={handleRecipeSelect}>
            <SelectTrigger><SelectValue placeholder="Select a recipe..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No linked recipe</SelectItem>
              {recipes?.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Recipe Name *</label>
          <Input value={form.recipeName} onChange={(e) => setForm({ ...form, recipeName: e.target.value })} placeholder="What are you brewing?" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Brew Date *</label>
            <Input type="date" value={form.brewDate} onChange={(e) => setForm({ ...form, brewDate: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Status</label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Batch Size (gal)</label>
            <Input type="number" step="0.1" value={form.batchSizeGallons} onChange={(e) => setForm({ ...form, batchSizeGallons: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Original Gravity (actual)</label>
            <Input type="number" step="0.001" value={form.originalGravityActual} onChange={(e) => setForm({ ...form, originalGravityActual: e.target.value })} placeholder="1.065" />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Anything noteworthy about brew day..." />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate("/brew-sessions")}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending}>Log Session</Button>
        </div>
      </form>
    </div>
  );
}
