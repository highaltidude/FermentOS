import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, GripVertical } from "lucide-react";
import {
  useGetRecipe,
  useUpdateRecipe,
  useDeleteRecipe,
  useAddRecipeIngredient,
  useUpdateRecipeIngredient,
  useDeleteRecipeIngredient,
  useAddRecipeStep,
  useUpdateRecipeStep,
  useDeleteRecipeStep,
  useReorderRecipeSteps,
  useListBeerStyles,
  useListInventory,
  getGetRecipeQueryKey,
} from "@workspace/api-client-react";
import { IngredientNameCombobox } from "@/components/IngredientNameCombobox";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

function StyleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: styles } = useListBeerStyles();
  const [useCustom, setUseCustom] = useState(false);

  if (!styles || styles.length === 0) {
    return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g., American IPA" />;
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

const INGREDIENT_TYPE_COLORS: Record<string, string> = {
  malt: "bg-amber-100 text-amber-800 border-amber-200",
  hop: "bg-green-100 text-green-800 border-green-200",
  yeast: "bg-yellow-100 text-yellow-800 border-yellow-200",
  adjunct: "bg-orange-100 text-orange-800 border-orange-200",
  water_agent: "bg-blue-100 text-blue-800 border-blue-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

const INGREDIENT_TYPES = ["malt", "hop", "yeast", "adjunct", "water_agent", "other"];
const INGREDIENT_USES = ["mash", "boil", "dry_hop", "whirlpool", "primary", "secondary", "packaging", "other"];
const STEP_PHASES = ["mash", "boil", "fermentation", "conditioning", "packaging", "other"];

const STEP_PHASE_COLORS: Record<string, string> = {
  mash: "bg-amber-100 text-amber-800 border-amber-200",
  boil: "bg-red-100 text-red-800 border-red-200",
  fermentation: "bg-purple-100 text-purple-800 border-purple-200",
  conditioning: "bg-blue-100 text-blue-800 border-blue-200",
  packaging: "bg-green-100 text-green-800 border-green-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

function AddStepForm({ recipeId, nextPosition, onDone }: { recipeId: number; nextPosition: number; onDone: () => void }) {
  const [body, setBody] = useState("");
  const [phase, setPhase] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const addMutation = useAddRecipeStep({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(recipeId) });
        onDone();
        toast({ title: "Step added" });
      },
      onError: (err: unknown) => {
        toast({ title: "Failed to add step", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    addMutation.mutate({
      id: recipeId,
      data: {
        body: body.trim(),
        phase: (phase || undefined) as any,
        durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
        position: nextPosition,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-muted/50 rounded-lg p-3 space-y-3 border border-border">
      <Textarea
        placeholder="Describe this step (e.g., Sparge with 170°F water until pre-boil volume)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        className="text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <Select value={phase} onValueChange={setPhase}>
          <SelectTrigger className="text-sm h-9"><SelectValue placeholder="Phase (optional)" /></SelectTrigger>
          <SelectContent>
            {STEP_PHASES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          placeholder="Duration (min, optional)"
          type="number"
          min="0"
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
          className="text-sm"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}><X className="w-3.5 h-3.5" /></Button>
        <Button type="submit" size="sm" disabled={addMutation.isPending}>
          <Check className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>
    </form>
  );
}

type StepLike = { id: number; position: number; phase?: string | null; body: string; durationMinutes?: number | null };

function StepRow({
  step,
  recipeId,
  index,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  step: StepLike;
  recipeId: number;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (id: number) => void;
  onDragOver: (e: React.DragEvent, id: number) => void;
  onDragLeave: () => void;
  onDrop: (id: number) => void;
  onDragEnd: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(step.body);
  const [phase, setPhase] = useState(step.phase ?? "");
  const [durationMinutes, setDurationMinutes] = useState(step.durationMinutes != null ? String(step.durationMinutes) : "");
  const qc = useQueryClient();
  const { toast } = useToast();

  const updateMutation = useUpdateRecipeStep({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(recipeId) });
        setEditing(false);
      },
      onError: (err: unknown) => {
        toast({ title: "Failed to update step", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
      },
    },
  });

  const deleteMutation = useDeleteRecipeStep({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(recipeId) }),
      onError: (err: unknown) => {
        toast({ title: "Failed to delete step", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
      },
    },
  });

  const startEdit = () => {
    setBody(step.body);
    setPhase(step.phase ?? "");
    setDurationMinutes(step.durationMinutes != null ? String(step.durationMinutes) : "");
    setEditing(true);
  };

  if (editing) {
    return (
      <div className="flex gap-2 items-start py-2 px-2 rounded bg-muted/40">
        <div className="shrink-0 w-7 h-9 flex items-center justify-center rounded bg-background text-xs font-semibold text-muted-foreground">
          {index + 1}
        </div>
        <div className="flex-1 space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className="text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <Select value={phase} onValueChange={setPhase}>
              <SelectTrigger className="text-sm h-9"><SelectValue placeholder="Phase (optional)" /></SelectTrigger>
              <SelectContent>{STEP_PHASES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" min="0" placeholder="Duration (min)" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className="text-sm" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5" /></Button>
            <Button
              type="button"
              size="sm"
              disabled={updateMutation.isPending || !body.trim()}
              onClick={() => updateMutation.mutate({
                id: step.id,
                data: {
                  body: body.trim(),
                  phase: (phase || null) as any,
                  durationMinutes: durationMinutes ? Number(durationMinutes) : null,
                },
              })}
            >
              <Check className="w-3.5 h-3.5 mr-1" /> Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => onDragOver(e, step.id)}
      onDragLeave={onDragLeave}
      onDrop={() => onDrop(step.id)}
      className={[
        "flex gap-2 items-start py-2 px-2 rounded group transition-all",
        isDragging ? "opacity-40" : "hover:bg-muted",
        isDropTarget ? "border-t-2 border-primary -mt-px" : "border-t-2 border-transparent -mt-px",
      ].join(" ")}
    >
      <div
        draggable
        onDragStart={(e) => {
          // Required for Firefox to actually start the drag.
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(step.id));
          onDragStart(step.id);
        }}
        onDragEnd={onDragEnd}
        title="Drag to reorder"
        className="shrink-0 w-5 h-9 flex items-center justify-center text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="shrink-0 w-7 h-9 flex items-center justify-center rounded bg-muted text-xs font-semibold text-muted-foreground">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          {step.phase && (
            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${STEP_PHASE_COLORS[step.phase] ?? STEP_PHASE_COLORS.other}`}>
              {step.phase}
            </span>
          )}
          {step.durationMinutes != null && (
            <span className="text-xs text-muted-foreground">{step.durationMinutes} min</span>
          )}
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">{step.body}</p>
      </div>
      <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button onClick={startEdit} className="text-muted-foreground hover:text-foreground p-1">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => deleteMutation.mutate({ id: step.id })} className="text-destructive hover:text-destructive/80 p-1">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function StepList({ recipeId, steps }: { recipeId: number; steps: StepLike[] }) {
  // Maintain a local copy so drag/drop feels instant. Sync whenever the
  // server-side list (passed in via props) changes — covers add/edit/delete
  // and any background refetch.
  const [order, setOrder] = useState<StepLike[]>(steps);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    setOrder(steps);
  }, [steps]);

  const reorderMutation = useReorderRecipeSteps({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(recipeId) }),
      onError: (err: unknown) => {
        // Roll back local order to whatever the server most recently returned.
        setOrder(steps);
        toast({ title: "Failed to reorder steps", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
      },
    },
  });

  const handleDragStart = (id: number) => setDraggingId(id);

  const handleDragOver = (e: React.DragEvent, overId: number) => {
    if (draggingId == null || draggingId === overId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(overId);
  };

  const handleDragLeave = () => setDropTargetId(null);

  const handleDrop = (overId: number) => {
    if (draggingId == null || draggingId === overId) {
      setDropTargetId(null);
      return;
    }
    const fromIdx = order.findIndex((s) => s.id === draggingId);
    const toIdx = order.findIndex((s) => s.id === overId);
    if (fromIdx === -1 || toIdx === -1) {
      setDropTargetId(null);
      return;
    }
    const next = [...order];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved!);
    setOrder(next);
    setDropTargetId(null);
    reorderMutation.mutate({ id: recipeId, data: { stepIds: next.map((s) => s.id) } });
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDropTargetId(null);
  };

  return (
    <>
      {order.map((step, idx) => (
        <StepRow
          key={step.id}
          step={step}
          recipeId={recipeId}
          index={idx}
          isDragging={draggingId === step.id}
          isDropTarget={dropTargetId === step.id && draggingId !== step.id}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        />
      ))}
    </>
  );
}

function AddIngredientForm({ recipeId, onDone }: { recipeId: number; onDone: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("malt");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("lbs");
  const [use, setUse] = useState("");
  const [notes, setNotes] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: inventoryItems = [] } = useListInventory({});
  const addMutation = useAddRecipeIngredient({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(recipeId) });
        onDone();
        toast({ title: "Ingredient added" });
      },
      onError: (err: unknown) => {
        toast({ title: "Failed to add ingredient", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;
    addMutation.mutate({
      id: recipeId,
      data: { name, type: type as any, amount: Number(amount), unit, use: (use || undefined) as any, notes: notes || undefined },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-muted/50 rounded-lg p-3 space-y-3 border border-border">
      <div className="grid grid-cols-2 gap-2">
        <IngredientNameCombobox
          value={name}
          onChange={setName}
          onSelect={(item) => { setName(item.name); setType(item.type); setUnit(item.unit); }}
          suggestions={inventoryItems}
        />
        <div className="flex gap-2">
          <Input placeholder="Amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-sm w-24" />
          <Input placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} className="text-sm w-20" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {INGREDIENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={use} onValueChange={setUse}>
          <SelectTrigger className="text-sm h-9"><SelectValue placeholder="Use (optional)" /></SelectTrigger>
          <SelectContent>
            {INGREDIENT_USES.map((u) => <SelectItem key={u} value={u}>{u.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="text-sm" />
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}><X className="w-3.5 h-3.5" /></Button>
        <Button type="submit" size="sm" disabled={addMutation.isPending}>
          <Check className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>
    </form>
  );
}

export default function RecipeDetail() {
  const [, params] = useRoute("/recipes/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id);
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [showAddIngredient, setShowAddIngredient] = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);

  const { data: recipe, isLoading } = useGetRecipe(id, { query: { enabled: !!id, queryKey: getGetRecipeQueryKey(id) } });

  const updateMutation = useUpdateRecipe({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(id) }); setEditing(false); toast({ title: "Recipe updated" }); },
      onError: (err: unknown) => { toast({ title: "Failed to update recipe", description: String(err instanceof Error ? err.message : err), variant: "destructive" }); },
    },
  });

  const deleteMutation = useDeleteRecipe({
    mutation: {
      onSuccess: () => { navigate("/recipes"); toast({ title: "Recipe deleted" }); },
      onError: (err: unknown) => { toast({ title: "Failed to delete recipe", description: String(err instanceof Error ? err.message : err), variant: "destructive" }); },
    },
  });

  const deleteIngredientMutation = useDeleteRecipeIngredient({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(id) }); },
      onError: (err: unknown) => { toast({ title: "Failed to delete ingredient", description: String(err instanceof Error ? err.message : err), variant: "destructive" }); },
    },
  });

  const [form, setForm] = useState({ name: "", style: "", batchSizeGallons: "", originalGravity: "", finalGravity: "", abv: "", ibu: "", colorSrm: "", notes: "", daysPlanned: "", daysBrewing: "", daysFermenting: "", daysConditioning: "", daysPackaged: "" });

  const startEdit = () => {
    if (recipe) {
      setForm({
        name: recipe.name,
        style: recipe.style,
        batchSizeGallons: String(recipe.batchSizeGallons),
        originalGravity: recipe.originalGravity != null ? String(recipe.originalGravity) : "",
        finalGravity: recipe.finalGravity != null ? String(recipe.finalGravity) : "",
        abv: recipe.abv != null ? String(recipe.abv) : "",
        ibu: recipe.ibu != null ? String(recipe.ibu) : "",
        colorSrm: recipe.colorSrm != null ? String(recipe.colorSrm) : "",
        notes: recipe.notes ?? "",
        daysPlanned: recipe.daysPlanned != null ? String(recipe.daysPlanned) : "",
        daysBrewing: recipe.daysBrewing != null ? String(recipe.daysBrewing) : "",
        daysFermenting: recipe.daysFermenting != null ? String(recipe.daysFermenting) : "",
        daysConditioning: recipe.daysConditioning != null ? String(recipe.daysConditioning) : "",
        daysPackaged: recipe.daysPackaged != null ? String(recipe.daysPackaged) : "",
      });
    }
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate({
      id,
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
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-8 w-48 mb-4" /><Skeleton className="h-64 w-full" /></div>;
  if (!recipe) return <div className="p-6 text-muted-foreground">Recipe not found.</div>;

  const grouped: Record<string, typeof recipe.ingredients> = {};
  (recipe.ingredients ?? []).forEach((ing) => {
    if (!grouped[ing.type]) grouped[ing.type] = [];
    grouped[ing.type].push(ing);
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/recipes")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        {!editing ? (
          <>
            <h1 className="text-xl font-bold text-foreground flex-1">{recipe.name}</h1>
            <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="w-3.5 h-3.5 mr-1.5" />Edit</Button>
            <Button variant="destructive" size="sm" onClick={() => { if (confirm("Delete this recipe?")) deleteMutation.mutate({ id }); }}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        ) : (
          <>
            <span className="text-sm font-semibold text-muted-foreground">Editing recipe</span>
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5 mr-1" />Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}><Check className="w-3.5 h-3.5 mr-1" />Save</Button>
            </div>
          </>
        )}
      </div>

      <div className="bg-card border border-card-border rounded-lg p-4">
        {!editing ? (
          <>
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">{recipe.style}</span>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-3">
              {[
                { label: "Batch Size", value: `${recipe.batchSizeGallons} gal` },
                { label: "OG", value: recipe.originalGravity?.toFixed(3) },
                { label: "FG", value: recipe.finalGravity?.toFixed(3) },
                { label: "ABV", value: recipe.abv ? `${recipe.abv.toFixed(1)}%` : null },
                { label: "IBU", value: recipe.ibu },
                { label: "Color (SRM)", value: recipe.colorSrm },
              ].map(({ label, value }) => value != null && (
                <div key={label} className="text-center">
                  <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                  <div className="text-sm font-semibold text-foreground">{value}</div>
                </div>
              ))}
            </div>
            {recipe.notes && <p className="text-sm text-muted-foreground border-t border-border pt-3">{recipe.notes}</p>}
            {/* Stage estimates view */}
            {[recipe.daysPlanned, recipe.daysBrewing, recipe.daysFermenting, recipe.daysConditioning, recipe.daysPackaged].some((d) => d != null) && (
              <div className="border-t border-border pt-3 mt-3">
                <div className="text-xs text-muted-foreground mb-2 font-medium">Stage Estimates</div>
                <div className="flex flex-wrap gap-2">
                  {([
                    { label: "Planned", value: recipe.daysPlanned },
                    { label: "Brewing", value: recipe.daysBrewing },
                    { label: "Fermenting", value: recipe.daysFermenting },
                    { label: "Conditioning", value: recipe.daysConditioning },
                    { label: "Packaged", value: recipe.daysPackaged },
                  ] as const).filter(({ value }) => value != null).map(({ label, value }, i, arr) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">{label}</div>
                        <div className="text-sm font-semibold text-foreground">{value}d</div>
                      </div>
                      {i < arr.length - 1 && <span className="text-muted-foreground/40 text-xs">→</span>}
                    </div>
                  ))}
                  <div className="ml-auto text-center">
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="text-sm font-semibold text-primary">
                      {[recipe.daysPlanned, recipe.daysBrewing, recipe.daysFermenting, recipe.daysConditioning, recipe.daysPackaged].reduce<number>((s, d) => s + (d ?? 0), 0)}d
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground mb-1 block">Name</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Style</label><StyleSelect value={form.style} onChange={(v) => setForm({ ...form, style: v })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Batch Size (gal)</label><Input type="number" step="0.1" value={form.batchSizeGallons} onChange={(e) => setForm({ ...form, batchSizeGallons: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Original Gravity</label><Input type="number" step="0.001" value={form.originalGravity} onChange={(e) => setForm({ ...form, originalGravity: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Final Gravity</label><Input type="number" step="0.001" value={form.finalGravity} onChange={(e) => setForm({ ...form, finalGravity: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">ABV %</label><Input type="number" step="0.1" value={form.abv} onChange={(e) => setForm({ ...form, abv: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">IBU</label><Input type="number" value={form.ibu} onChange={(e) => setForm({ ...form, ibu: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Color (SRM)</label><Input type="number" step="0.1" value={form.colorSrm} onChange={(e) => setForm({ ...form, colorSrm: e.target.value })} /></div>
            </div>
            <div><label className="text-xs text-muted-foreground mb-1 block">Notes</label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            <div>
              <div className="text-xs text-muted-foreground mb-2 font-medium">Stage Estimates (days)</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {([
                  { key: "daysPlanned", label: "Planned" },
                  { key: "daysBrewing", label: "Brewing" },
                  { key: "daysFermenting", label: "Fermenting" },
                  { key: "daysConditioning", label: "Conditioning" },
                  { key: "daysPackaged", label: "Packaged" },
                ] as const).map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
                    <Input type="number" min="0" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder="—" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Brewing Steps */}
      {(() => {
        const recipeSteps = recipe.steps ?? [];
        const nextPosition = (recipeSteps[recipeSteps.length - 1]?.position ?? 0) + 1;
        return (
          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Brewing Steps</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Step-by-step instructions</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowAddStep(!showAddStep)}>
                <Plus className="w-3.5 h-3.5 mr-1" />Add
              </Button>
            </div>
            <div className="p-4 space-y-1">
              {showAddStep && (
                <div className="mb-2">
                  <AddStepForm recipeId={id} nextPosition={nextPosition} onDone={() => setShowAddStep(false)} />
                </div>
              )}
              {recipeSteps.length === 0 && !showAddStep ? (
                <p className="text-sm text-muted-foreground text-center py-4">No steps yet — click Add to write out your brew day procedure.</p>
              ) : (
                <StepList recipeId={id} steps={recipeSteps} />
              )}
            </div>
          </div>
        );
      })()}

      {/* Ingredients */}
      <div className="bg-card border border-card-border rounded-lg">
        <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Ingredients</h2>
          <Button size="sm" variant="outline" onClick={() => setShowAddIngredient(!showAddIngredient)}>
            <Plus className="w-3.5 h-3.5 mr-1" />Add
          </Button>
        </div>
        <div className="p-4 space-y-4">
          {showAddIngredient && <AddIngredientForm recipeId={id} onDone={() => setShowAddIngredient(false)} />}
          {Object.entries(grouped).length === 0 && !showAddIngredient ? (
            <p className="text-sm text-muted-foreground text-center py-4">No ingredients yet</p>
          ) : (
            Object.entries(grouped).map(([type, ings]) => (
              <div key={type}>
                <div className={`inline-block text-xs px-2 py-0.5 rounded border font-medium mb-2 ${INGREDIENT_TYPE_COLORS[type]}`}>
                  {type.replace("_", " ")}
                </div>
                <div className="space-y-1">
                  {ings.map((ing) => (
                    <div key={ing.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted group">
                      <div className="flex-1">
                        <span className="font-medium">{ing.name}</span>
                        <span className="text-muted-foreground ml-2">{ing.amount} {ing.unit}</span>
                        {ing.use && <span className="text-muted-foreground ml-1">• {ing.use.replace("_", " ")}</span>}
                        {ing.timingMinutes != null && <span className="text-muted-foreground ml-1">@ {ing.timingMinutes} min</span>}
                      </div>
                      <button
                        onClick={() => deleteIngredientMutation.mutate({ id: ing.id })}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
