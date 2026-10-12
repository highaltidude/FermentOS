import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useCreateBrewSession, useListRecipes, type BrewStatus, type PackagingMethod, type RecipeVariant } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useFermentTempUnit } from "@/hooks/useFermentTempUnit";
import { TempRangeFields } from "@/components/TempRangeFields";
import { BREW_STATUSES, STATUS_LABELS, PACKAGING_METHODS, PACKAGING_LABELS } from "@/lib/brewStatus";
import { apiErrorMessage, shortageLines } from "@/lib/inventoryShortage";
import { isMultiVariant, VARIANT_LABELS } from "@/lib/recipeVariants";

export default function NewBrewSession() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: recipes } = useListRecipes({});
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("none");
  const [recipeVariant, setRecipeVariant] = useState<RecipeVariant | "">("");
  const selectedRecipe = recipes?.find((r) => String(r.id) === selectedRecipeId);
  const recipeVariants = isMultiVariant(selectedRecipe?.variants) ? selectedRecipe.variants : null;
  const [form, setForm] = useState({
    recipeName: "", status: "brew_day" as BrewStatus, brewDate: new Date().toISOString().split("T")[0],
    batchSizeGallons: "5.5", originalGravityActual: "", finalGravityActual: "", notes: "",
    fermentTempMin: "", fermentTempMax: "", fermentTempIdeal: "",
    conditionTempMin: "", conditionTempMax: "", conditionTempIdeal: "",
    packagingMethod: "keg" as NonNullable<PackagingMethod>,
  });
  const tempUnit = useFermentTempUnit();

  const createMutation = useCreateBrewSession({
    mutation: {
      onSuccess: (session) => {
        toast({ title: "Brew session logged!" });
        navigate(`/brew-sessions/${session.id}`);
      },
      onError: (err: unknown) => {
        // 409 + shortages[] when inventory enforcement is on and stock is short.
        const shortages = shortageLines(err);
        if (shortages) {
          toast({ title: "Insufficient inventory", description: shortages.join("\n"), variant: "destructive" });
          return;
        }
        toast({ title: "Failed to create session", description: apiErrorMessage(err) ?? "Please try again", variant: "destructive" });
      },
    },
  });

  const handleRecipeSelect = (recipeId: string) => {
    setSelectedRecipeId(recipeId);
    // A version belongs to one recipe; it means nothing against another.
    setRecipeVariant("");
    if (recipeId && recipeId !== "none") {
      const recipe = recipes?.find((r) => String(r.id) === recipeId);
      if (recipe) {
        setForm((f) => ({
          ...f,
          recipeName: recipe.name,
          batchSizeGallons: String(recipe.batchSizeGallons),
          fermentTempMin: recipe.fermentTempMin != null ? String(recipe.fermentTempMin) : f.fermentTempMin,
          fermentTempMax: recipe.fermentTempMax != null ? String(recipe.fermentTempMax) : f.fermentTempMax,
          fermentTempIdeal: recipe.fermentTempIdeal != null ? String(recipe.fermentTempIdeal) : f.fermentTempIdeal,
          conditionTempMin: recipe.conditionTempMin != null ? String(recipe.conditionTempMin) : f.conditionTempMin,
          conditionTempMax: recipe.conditionTempMax != null ? String(recipe.conditionTempMax) : f.conditionTempMax,
          conditionTempIdeal: recipe.conditionTempIdeal != null ? String(recipe.conditionTempIdeal) : f.conditionTempIdeal,
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
    if (recipeVariants && !recipeVariant) {
      toast({ title: "Choose which version of the recipe you're brewing", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      data: {
        recipeId: selectedRecipeId && selectedRecipeId !== "none" ? Number(selectedRecipeId) : undefined,
        recipeName: form.recipeName,
        recipeVariant: recipeVariants && recipeVariant ? recipeVariant : undefined,
        status: form.status,
        brewDate: form.brewDate,
        batchSizeGallons: Number(form.batchSizeGallons),
        originalGravityActual: form.originalGravityActual ? Number(form.originalGravityActual) : undefined,
        finalGravityActual: form.finalGravityActual ? Number(form.finalGravityActual) : undefined,
        notes: form.notes || undefined,
        fermentTempMin: form.fermentTempMin ? Number(form.fermentTempMin) : undefined,
        fermentTempMax: form.fermentTempMax ? Number(form.fermentTempMax) : undefined,
        fermentTempIdeal: form.fermentTempIdeal ? Number(form.fermentTempIdeal) : undefined,
        conditionTempMin: form.conditionTempMin ? Number(form.conditionTempMin) : undefined,
        conditionTempMax: form.conditionTempMax ? Number(form.conditionTempMax) : undefined,
        conditionTempIdeal: form.conditionTempIdeal ? Number(form.conditionTempIdeal) : undefined,
        packagingMethod: form.status === "packaged" ? form.packagingMethod : undefined,
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

        {recipeVariants && (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Version *</label>
            <Select value={recipeVariant} onValueChange={(v) => setRecipeVariant(v as RecipeVariant)}>
              <SelectTrigger><SelectValue placeholder="Which version are you brewing?" /></SelectTrigger>
              <SelectContent>
                {recipeVariants.map((v) => <SelectItem key={v} value={v}>{VARIANT_LABELS[v]}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Decides which ingredients come out of inventory and show on the boil timer.</p>
          </div>
        )}

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
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as BrewStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{BREW_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.status === "packaged" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Packaged In</label>
              <Select value={form.packagingMethod} onValueChange={(v) => setForm({ ...form, packagingMethod: v as NonNullable<PackagingMethod> })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PACKAGING_METHODS.map((m) => <SelectItem key={m} value={m}>{PACKAGING_LABELS[m] ?? m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
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
          <div className="text-xs text-muted-foreground mb-2 font-medium">Fermentation Temperature</div>
          <TempRangeFields prefix="fermentTemp" values={form} unit={tempUnit} onChange={(p) => setForm({ ...form, ...p })} />
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-2 font-medium">Conditioning Temperature (optional)</div>
          <TempRangeFields prefix="conditionTemp" values={form} unit={tempUnit} onChange={(p) => setForm({ ...form, ...p })} />
          <p className="text-xs text-muted-foreground mt-1">Leave blank for no temperature alerts while conditioning.</p>
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
