import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, X } from "lucide-react";
import { useCreateRecipe, useAddRecipeIngredient, useAddRecipeStep, useDeleteRecipe, useListBeerStyles, getGetRecipeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

function StyleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: styles } = useListBeerStyles();
  const [useCustom, setUseCustom] = useState(false);

  if (!styles || styles.length === 0) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g., American IPA (add styles in Settings)"
      />
    );
  }

  const knownNames = styles.map((s) => s.name);
  const valueInList = knownNames.includes(value);

  if (useCustom || (!valueInList && value)) {
    return (
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type a style" className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={() => { setUseCustom(false); onChange(""); }}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={(v) => { if (v === "__custom__") { setUseCustom(true); onChange(""); } else onChange(v); }}>
      <SelectTrigger><SelectValue placeholder="Select a style…" /></SelectTrigger>
      <SelectContent>
        {styles.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
        <SelectItem value="__custom__">Other (type manually)…</SelectItem>
      </SelectContent>
    </Select>
  );
}

const INGREDIENT_TYPES = ["malt", "hop", "yeast", "adjunct", "water_agent", "other"];
const INGREDIENT_USES = ["mash", "boil", "dry_hop", "whirlpool", "primary", "secondary", "packaging", "other"];
const STEP_PHASES = ["mash", "boil", "fermentation", "conditioning", "packaging", "other"];

interface PendingIngredient {
  name: string;
  type: string;
  amount: string;
  unit: string;
  use: string;
  notes: string;
}

interface PendingStep {
  body: string;
  phase: string;
  durationMinutes: string;
}

const emptyIngredient = (): PendingIngredient => ({ name: "", type: "malt", amount: "", unit: "lbs", use: "", notes: "" });
const emptyStep = (): PendingStep => ({ body: "", phase: "", durationMinutes: "" });

export default function NewRecipe() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    name: "", style: "", batchSizeGallons: "5.5", originalGravity: "", finalGravity: "", abv: "", ibu: "", colorSrm: "", notes: "",
    daysPlanned: "", daysBrewing: "", daysFermenting: "", daysConditioning: "", daysPackaged: "",
  });

  const [ingredients, setIngredients] = useState<PendingIngredient[]>([emptyIngredient()]);
  const [steps, setSteps] = useState<PendingStep[]>([emptyStep()]);

  const createMutation = useCreateRecipe();
  const addIngredientMutation = useAddRecipeIngredient();
  const addStepMutation = useAddRecipeStep();
  const deleteRecipeMutation = useDeleteRecipe();

  const addIngredientRow = () => setIngredients([...ingredients, emptyIngredient()]);
  const removeIngredientRow = (i: number) => setIngredients(ingredients.filter((_, idx) => idx !== i));
  const updateIngredient = (i: number, field: keyof PendingIngredient, value: string) => {
    const updated = [...ingredients];
    updated[i] = { ...updated[i], [field]: value };
    setIngredients(updated);
  };

  const addStepRow = () => setSteps([...steps, emptyStep()]);
  const removeStepRow = (i: number) => setSteps(steps.filter((_, idx) => idx !== i));
  const updateStep = (i: number, field: keyof PendingStep, value: string) => {
    const updated = [...steps];
    updated[i] = { ...updated[i], [field]: value };
    setSteps(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.style || !form.batchSizeGallons) {
      toast({ title: "Name, style, and batch size are required", variant: "destructive" });
      return;
    }

    const recipe = await createMutation.mutateAsync({
      data: {
        name: form.name,
        style: form.style,
        batchSizeGallons: Number(form.batchSizeGallons),
        originalGravity: form.originalGravity ? Number(form.originalGravity) : undefined,
        finalGravity: form.finalGravity ? Number(form.finalGravity) : undefined,
        abv: form.abv ? Number(form.abv) : undefined,
        ibu: form.ibu ? Number(form.ibu) : undefined,
        colorSrm: form.colorSrm ? Number(form.colorSrm) : undefined,
        notes: form.notes || undefined,
        daysPlanned: form.daysPlanned ? Number(form.daysPlanned) : undefined,
        daysBrewing: form.daysBrewing ? Number(form.daysBrewing) : undefined,
        daysFermenting: form.daysFermenting ? Number(form.daysFermenting) : undefined,
        daysConditioning: form.daysConditioning ? Number(form.daysConditioning) : undefined,
        daysPackaged: form.daysPackaged ? Number(form.daysPackaged) : undefined,
      },
    });

    const validIngredients = ingredients.filter((i) => i.name && i.amount);
    const validSteps = steps.filter((s) => s.body.trim());
    try {
      for (const ing of validIngredients) {
        await addIngredientMutation.mutateAsync({
          id: recipe.id,
          data: {
            name: ing.name,
            type: ing.type as any,
            amount: Number(ing.amount),
            unit: ing.unit,
            use: (ing.use || undefined) as any,
            notes: ing.notes || undefined,
          },
        });
      }
      for (let i = 0; i < validSteps.length; i++) {
        const step = validSteps[i]!;
        await addStepMutation.mutateAsync({
          id: recipe.id,
          data: {
            body: step.body.trim(),
            phase: (step.phase || undefined) as any,
            durationMinutes: step.durationMinutes ? Number(step.durationMinutes) : undefined,
            position: i + 1,
          },
        });
      }
    } catch (err) {
      // Roll back the partially-created recipe so the user can retry cleanly.
      try {
        await deleteRecipeMutation.mutateAsync({ id: recipe.id });
      } catch {
        // Ignore rollback failure; surface the original error below.
      }
      toast({
        title: "Could not save all recipe details",
        description: "The recipe was rolled back. Please try again.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Recipe created!" });
    navigate(`/recipes/${recipe.id}`);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/recipes")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-bold text-foreground">New Recipe</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-card border border-card-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground mb-3">Recipe Details</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">Recipe Name *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Pacific IPA" /></div>
            <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">Style *</label>
              <StyleSelect value={form.style} onChange={(v) => setForm({ ...form, style: v })} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">Batch Size (gal) *</label>
              <Input type="number" step="0.1" value={form.batchSizeGallons} onChange={(e) => setForm({ ...form, batchSizeGallons: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">Color (SRM)</label>
              <Input type="number" step="0.1" value={form.colorSrm} onChange={(e) => setForm({ ...form, colorSrm: e.target.value })} placeholder="e.g., 8" /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">Original Gravity</label>
              <Input type="number" step="0.001" value={form.originalGravity} onChange={(e) => setForm({ ...form, originalGravity: e.target.value })} placeholder="1.065" /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">Final Gravity</label>
              <Input type="number" step="0.001" value={form.finalGravity} onChange={(e) => setForm({ ...form, finalGravity: e.target.value })} placeholder="1.012" /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">ABV %</label>
              <Input type="number" step="0.1" value={form.abv} onChange={(e) => setForm({ ...form, abv: e.target.value })} placeholder="6.9" /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">IBU</label>
              <Input type="number" value={form.ibu} onChange={(e) => setForm({ ...form, ibu: e.target.value })} placeholder="65" /></div>
          </div>
          <div><label className="text-xs text-muted-foreground mb-1 block">Notes</label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Brew notes, tips, observations..." /></div>
        </div>

        <div className="bg-card border border-card-border rounded-lg p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Stage Estimates</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Optional — estimated days spent in each stage</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {([
              { key: "daysPlanned", label: "Planned" },
              { key: "daysBrewing", label: "Brewing" },
              { key: "daysFermenting", label: "Fermenting" },
              { key: "daysConditioning", label: "Conditioning" },
              { key: "daysPackaged", label: "Packaged" },
            ] as const).map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs text-muted-foreground mb-1 block">{label} (days)</label>
                <Input type="number" min="0" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder="—" />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-card-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Ingredients</h2>
          {ingredients.map((ing, i) => (
            <div key={i} className="space-y-2 pb-3 border-b border-border last:border-0 last:pb-0">
              <div className="flex gap-2 items-center">
                <Input className="flex-1 text-sm min-w-0" placeholder="Ingredient name" value={ing.name} onChange={(e) => updateIngredient(i, "name", e.target.value)} />
                <button type="button" onClick={() => removeIngredientRow(i)} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input className="text-sm" placeholder="Amount" type="number" step="0.01" value={ing.amount} onChange={(e) => updateIngredient(i, "amount", e.target.value)} />
                <Input className="text-sm" placeholder="Unit (lbs, oz…)" value={ing.unit} onChange={(e) => updateIngredient(i, "unit", e.target.value)} />
                <Select value={ing.type} onValueChange={(v) => updateIngredient(i, "type", v)}>
                  <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{INGREDIENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={ing.use} onValueChange={(v) => updateIngredient(i, "use", v)}>
                  <SelectTrigger className="text-sm h-9"><SelectValue placeholder="Use" /></SelectTrigger>
                  <SelectContent>{INGREDIENT_USES.map((u) => <SelectItem key={u} value={u}>{u.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Input className="text-sm" placeholder="Notes (optional)" value={ing.notes} onChange={(e) => updateIngredient(i, "notes", e.target.value)} />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addIngredientRow}>
            <Plus className="w-3.5 h-3.5 mr-1" />Add Ingredient
          </Button>
        </div>

        <div className="bg-card border border-card-border rounded-lg p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Brewing Steps</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Step-by-step instructions in the order you'll perform them</p>
          </div>
          {steps.map((step, i) => (
            <div key={i} className="space-y-2 pb-3 border-b border-border last:border-0 last:pb-0">
              <div className="flex gap-2 items-start">
                <div className="shrink-0 w-7 h-9 flex items-center justify-center rounded bg-muted text-xs font-semibold text-muted-foreground">
                  {i + 1}
                </div>
                <Textarea
                  className="flex-1 text-sm min-w-0"
                  rows={2}
                  placeholder="Describe this step (e.g., Mash grains at 152°F for 60 minutes)"
                  value={step.body}
                  onChange={(e) => updateStep(i, "body", e.target.value)}
                />
                <button type="button" onClick={() => removeStepRow(i)} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1 mt-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 ml-9">
                <Select value={step.phase} onValueChange={(v) => updateStep(i, "phase", v)}>
                  <SelectTrigger className="text-sm h-9"><SelectValue placeholder="Phase (optional)" /></SelectTrigger>
                  <SelectContent>{STEP_PHASES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
                <Input
                  className="text-sm"
                  type="number"
                  min="0"
                  placeholder="Duration (min, optional)"
                  value={step.durationMinutes}
                  onChange={(e) => updateStep(i, "durationMinutes", e.target.value)}
                />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addStepRow}>
            <Plus className="w-3.5 h-3.5 mr-1" />Add Step
          </Button>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/recipes")}>Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending}>Create Recipe</Button>
        </div>
      </form>
    </div>
  );
}
