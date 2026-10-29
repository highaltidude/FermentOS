import { useState, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, GripVertical, Beer, Loader2, GitBranch } from "lucide-react";
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
  useListInventory,
  useCreateBrewSession,
  useForkRecipe,
  useGetRecipeHistory,
  getGetRecipeHistoryQueryKey,
  getListRecipesQueryKey,
  getListFlowsQueryKey,
  getGetRecipeQueryKey,
  type IngredientType,
  type IngredientUse,
  type RecipeIngredient,
  type RecipeVariant,
  type StepPhase,
} from "@workspace/api-client-react";
import { IngredientNameCombobox } from "@/components/IngredientNameCombobox";
import { IngredientTiming } from "@/components/IngredientTiming";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { INGREDIENT_TYPES, INGREDIENT_USES, STEP_PHASES, TIMED_USES, DRY_HOP, hasTimingField, timingFields, timingValue, timingPlaceholder, INGREDIENT_TYPE_COLORS } from "@/lib/ingredients";
import { useFermentTempUnit } from "@/hooks/useFermentTempUnit";
import { ScoreBadge } from "@/components/ui/score-picker";
import { StyleSelect } from "@/components/StyleSelect";
import { TempRangeFields } from "@/components/TempRangeFields";
import { StartBrewDialog } from "@/components/StartBrewDialog";
import { VariantChips, VariantSwitcher } from "@/components/VariantChips";
import { apiErrorMessage, shortageLines } from "@/lib/inventoryShortage";
import { ingredientsForVariant, isMultiVariant, VARIANT_LABELS, variantListLabel } from "@/lib/recipeVariants";
import { RecipeFlowsCard } from "@/components/flows/RecipeFlowsCard";
import { RecipeChangeList } from "@/components/RecipeChangeList";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
        toast({ title: "Failed to add step", description: getErrorMessage(err), variant: "destructive" });
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
        phase: (phase || undefined) as StepPhase | undefined,
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
        toast({ title: "Failed to update step", description: getErrorMessage(err), variant: "destructive" });
      },
    },
  });

  const deleteMutation = useDeleteRecipeStep({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(recipeId) }),
      onError: (err: unknown) => {
        toast({ title: "Failed to delete step", description: getErrorMessage(err), variant: "destructive" });
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
                  phase: (phase || null) as StepPhase | null,
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
        toast({ title: "Failed to reorder steps", description: getErrorMessage(err), variant: "destructive" });
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

/**
 * Adds an ingredient, or edits `ingredient` when one is passed. For a recipe
 * with several versions, `recipeVariants` lists them so the ingredient can be
 * limited to some. `preset` fills in a new ingredient's type, unit and use.
 */
function IngredientForm({ recipeId, ingredient, recipeVariants, preset, onDone }: {
  recipeId: number;
  ingredient?: RecipeIngredient;
  recipeVariants: readonly RecipeVariant[] | null;
  preset?: { type: string; unit: string; use: string };
  onDone: () => void;
}) {
  const [name, setName] = useState(ingredient?.name ?? "");
  const [type, setType] = useState<string>(ingredient?.type ?? preset?.type ?? "malt");
  const [amount, setAmount] = useState(ingredient ? String(ingredient.amount) : "");
  const [unit, setUnit] = useState(ingredient?.unit ?? preset?.unit ?? "lbs");
  const [use, setUse] = useState<string>(ingredient?.use ?? preset?.use ?? "");
  const [timingMinutes, setTimingMinutes] = useState(ingredient ? timingValue(ingredient) : "");
  const [notes, setNotes] = useState(ingredient?.notes ?? "");
  const [variants, setVariants] = useState<RecipeVariant[] | null>(ingredient?.variants ?? null);
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
        toast({ title: "Failed to add ingredient", description: getErrorMessage(err), variant: "destructive" });
      },
    },
  });

  const updateMutation = useUpdateRecipeIngredient({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(recipeId) });
        onDone();
      },
      onError: (err: unknown) => {
        toast({ title: "Failed to update ingredient", description: getErrorMessage(err), variant: "destructive" });
      },
    },
  });
  const isPending = addMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;
    if (ingredient) {
      // Nulls, not undefined: a cleared note or a use that is no longer timed
      // has to overwrite what was saved.
      updateMutation.mutate({
        id: ingredient.id,
        data: {
          name, type: type as IngredientType, amount: Number(amount), unit, use: (use || null) as IngredientUse | null,
          ...timingFields(use, timingMinutes),
          notes: notes || null,
          variants,
        },
      });
      return;
    }
    addMutation.mutate({
      id: recipeId,
      data: {
        name, type: type as IngredientType, amount: Number(amount), unit, use: (use || undefined) as IngredientUse | undefined,
        ...timingFields(use, timingMinutes),
        notes: notes || undefined,
        variants,
      },
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
      {hasTimingField(use) && (
        <Input
          type="number" min="0" step="1" inputMode="numeric" className="text-sm"
          placeholder={timingPlaceholder(use)}
          value={timingMinutes} onChange={(e) => setTimingMinutes(e.target.value)}
        />
      )}
      <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="text-sm" />
      {recipeVariants && <VariantChips available={recipeVariants} value={variants} onChange={setVariants} />}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}><X className="w-3.5 h-3.5" /></Button>
        <Button type="submit" size="sm" disabled={isPending}>
          <Check className="w-3.5 h-3.5 mr-1" /> {ingredient ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  );
}

function IngredientRow({ recipeId, ing, recipeVariants, onDelete }: {
  recipeId: number;
  ing: RecipeIngredient;
  recipeVariants: readonly RecipeVariant[] | null;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <IngredientForm recipeId={recipeId} ingredient={ing} recipeVariants={recipeVariants} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-muted group">
      <div className="flex-1 min-w-0">
        <span className="font-medium">{ing.name}</span>
        <span className="text-muted-foreground ml-2">{ing.amount} {ing.unit}</span>
        {ing.use && <span className="text-muted-foreground ml-1">• {ing.use.replace("_", " ")}</span>}
        {ing.use && TIMED_USES.includes(ing.use) ? (
          <IngredientTiming recipeId={recipeId} ingredientId={ing.id} use={ing.use} timingMinutes={ing.timingMinutes} />
        ) : ing.use === DRY_HOP ? (
          ing.dryHopDay != null
            ? <span className="text-muted-foreground ml-1">@ day {ing.dryHopDay} of conditioning</span>
            : <span className="text-amber-600 dark:text-amber-400 ml-1">• no day set, no reminder</span>
        ) : (
          ing.timingMinutes != null && <span className="text-muted-foreground ml-1">@ {ing.timingMinutes} min</span>
        )}
        {recipeVariants && ing.variants && ing.variants.length > 0 && (
          <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded border border-border text-muted-foreground whitespace-nowrap">
            {variantListLabel(ing.variants)} only
          </span>
        )}
        {ing.notes && <p className="text-xs text-muted-foreground break-words">{ing.notes}</p>}
      </div>
      <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground p-1" aria-label="Edit ingredient">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="text-destructive hover:text-destructive/80 p-1" aria-label="Delete ingredient">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
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
  const [showAddDryHop, setShowAddDryHop] = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);
  const [startingBrew, setStartingBrew] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  // undefined until the brewer picks: the page then opens on the first version.
  const [pickedVariant, setPickedVariant] = useState<RecipeVariant | null | undefined>(undefined);
  const tempUnit = useFermentTempUnit();

  const { data: recipe, isLoading, dataUpdatedAt: recipeUpdatedAt } = useGetRecipe(id, { query: { enabled: !!id, queryKey: getGetRecipeQueryKey(id) } });

  const updateMutation = useUpdateRecipe({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(id) }); setEditing(false); toast({ title: "Recipe updated" }); },
      onError: (err: unknown) => { toast({ title: "Failed to update recipe", description: getErrorMessage(err), variant: "destructive" }); },
    },
  });

  const createSessionMutation = useCreateBrewSession({
    mutation: {
      onSuccess: (session) => { navigate(`/brew-sessions/${session.id}`); toast({ title: "Brew session started!" }); },
      onError: (err: unknown) => {
        const shortages = shortageLines(err);
        toast(shortages
          ? { title: "Insufficient inventory", description: shortages.join("\n"), variant: "destructive" }
          : { title: "Failed to start session", description: apiErrorMessage(err) ?? getErrorMessage(err), variant: "destructive" });
        setStartingBrew(false);
      },
    },
  });

  const handleStartBrewSession = () => {
    if (!recipe) return;
    // A recipe with versions has to ask which one before anything is deducted.
    if (isMultiVariant(recipe.variants)) {
      setStartDialogOpen(true);
      return;
    }
    setStartingBrew(true);
    const today = new Date().toLocaleDateString("en-CA");
    createSessionMutation.mutate({
      data: {
        recipeId: recipe.id,
        recipeName: recipe.name,
        status: "brew_day",
        brewDate: today,
        batchSizeGallons: recipe.batchSizeGallons,
        originalGravityActual: recipe.originalGravity ?? undefined,
      },
    });
  };

  const deleteMutation = useDeleteRecipe({
    mutation: {
      onSuccess: () => { navigate("/recipes"); toast({ title: "Recipe deleted" }); },
      onError: (err: unknown) => { toast({ title: "Failed to delete recipe", description: getErrorMessage(err), variant: "destructive" }); },
    },
  });

  const [forkName, setForkName] = useState<string | null>(null);
  const forkMutation = useForkRecipe({
    mutation: {
      onSuccess: (fork) => {
        qc.invalidateQueries({ queryKey: getListRecipesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(id) });
        // The fork inherits the parent's flow links.
        qc.invalidateQueries({ queryKey: getListFlowsQueryKey() });
        setForkName(null);
        navigate(`/recipes/${fork.id}`);
        toast({ title: `Forked from ${recipe?.name ?? "recipe"}` });
      },
      onError: (err: unknown) => { toast({ title: "Failed to fork recipe", description: getErrorMessage(err), variant: "destructive" }); },
    },
  });

  const { data: history } = useGetRecipeHistory(id, { query: { enabled: !!id, queryKey: getGetRecipeHistoryQueryKey(id) } });
  // Every edit on this page refetches the recipe; "changed since last brew" follows it.
  useEffect(() => {
    if (recipeUpdatedAt) qc.invalidateQueries({ queryKey: getGetRecipeHistoryQueryKey(id) });
  }, [recipeUpdatedAt, id, qc]);

  const deleteIngredientMutation = useDeleteRecipeIngredient({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(id) }); },
      onError: (err: unknown) => { toast({ title: "Failed to delete ingredient", description: getErrorMessage(err), variant: "destructive" }); },
    },
  });

  const [form, setForm] = useState({
    name: "", style: "", batchSizeGallons: "", originalGravity: "", finalGravity: "",
    abv: "", ibu: "", colorSrm: "", estimatedBrewTimeMinutes: "", efficiencyPercent: "",
    caloriesPerServing: "", notes: "", daysPlanned: "", daysBrewing: "", daysFermenting: "",
    daysConditioning: "", daysPackaged: "",
    fermentTempMin: "", fermentTempMax: "", fermentTempIdeal: "",
    conditionTempMin: "", conditionTempMax: "", conditionTempIdeal: "",
  });

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
        estimatedBrewTimeMinutes: recipe.estimatedBrewTimeMinutes != null ? String(recipe.estimatedBrewTimeMinutes) : "",
        efficiencyPercent: recipe.efficiencyPercent != null ? String(recipe.efficiencyPercent) : "",
        caloriesPerServing: recipe.caloriesPerServing != null ? String(recipe.caloriesPerServing) : "",
        notes: recipe.notes ?? "",
        daysPlanned: recipe.daysPlanned != null ? String(recipe.daysPlanned) : "",
        daysBrewing: recipe.daysBrewing != null ? String(recipe.daysBrewing) : "",
        daysFermenting: recipe.daysFermenting != null ? String(recipe.daysFermenting) : "",
        daysConditioning: recipe.daysConditioning != null ? String(recipe.daysConditioning) : "",
        daysPackaged: recipe.daysPackaged != null ? String(recipe.daysPackaged) : "",
        fermentTempMin: recipe.fermentTempMin != null ? String(recipe.fermentTempMin) : "",
        fermentTempMax: recipe.fermentTempMax != null ? String(recipe.fermentTempMax) : "",
        fermentTempIdeal: recipe.fermentTempIdeal != null ? String(recipe.fermentTempIdeal) : "",
        conditionTempMin: recipe.conditionTempMin != null ? String(recipe.conditionTempMin) : "",
        conditionTempMax: recipe.conditionTempMax != null ? String(recipe.conditionTempMax) : "",
        conditionTempIdeal: recipe.conditionTempIdeal != null ? String(recipe.conditionTempIdeal) : "",
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
        estimatedBrewTimeMinutes: form.estimatedBrewTimeMinutes ? Number(form.estimatedBrewTimeMinutes) : undefined,
        efficiencyPercent: form.efficiencyPercent ? Number(form.efficiencyPercent) : undefined,
        caloriesPerServing: form.caloriesPerServing ? Number(form.caloriesPerServing) : undefined,
        notes: form.notes || undefined,
        daysPlanned: form.daysPlanned ? Number(form.daysPlanned) : undefined,
        daysBrewing: form.daysBrewing ? Number(form.daysBrewing) : undefined,
        daysFermenting: form.daysFermenting ? Number(form.daysFermenting) : undefined,
        daysConditioning: form.daysConditioning ? Number(form.daysConditioning) : undefined,
        daysPackaged: form.daysPackaged ? Number(form.daysPackaged) : undefined,
        fermentTempMin: form.fermentTempMin ? Number(form.fermentTempMin) : null,
        fermentTempMax: form.fermentTempMax ? Number(form.fermentTempMax) : null,
        fermentTempIdeal: form.fermentTempIdeal ? Number(form.fermentTempIdeal) : null,
        conditionTempMin: form.conditionTempMin ? Number(form.conditionTempMin) : null,
        conditionTempMax: form.conditionTempMax ? Number(form.conditionTempMax) : null,
        conditionTempIdeal: form.conditionTempIdeal ? Number(form.conditionTempIdeal) : null,
      },
    });
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-8 w-48 mb-4" /><Skeleton className="h-64 w-full" /></div>;
  if (!recipe) return <div className="p-6 text-muted-foreground">Recipe not found.</div>;

  const formatBrewTime = (min: number) => {
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const buGu = (recipe.ibu != null && recipe.originalGravity != null && recipe.originalGravity > 1)
    ? (recipe.ibu / ((recipe.originalGravity - 1) * 1000)).toFixed(2)
    : null;

  const recipeVariants = isMultiVariant(recipe.variants) ? recipe.variants : null;
  const viewVariant = recipeVariants ? (pickedVariant === undefined ? recipeVariants[0]! : pickedVariant) : null;

  const grouped: Record<string, typeof recipe.ingredients> = {};
  ingredientsForVariant(recipe.ingredients ?? [], viewVariant).forEach((ing) => {
    if (!grouped[ing.type]) grouped[ing.type] = [];
    grouped[ing.type].push(ing);
  });

  const dryHops = ingredientsForVariant(recipe.ingredients ?? [], viewVariant)
    .filter((ing) => ing.use === DRY_HOP)
    .sort((a, b) => (a.dryHopDay ?? Infinity) - (b.dryHopDay ?? Infinity));

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/recipes")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        {!editing ? (
          <>
            <h1 className="text-xl font-bold text-foreground flex-1">{recipe.name}</h1>
            <Button size="sm" onClick={handleStartBrewSession} disabled={startingBrew} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {startingBrew ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Beer className="w-3.5 h-3.5 mr-1.5" />}
              Start Brew Session
            </Button>
            <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="w-3.5 h-3.5 mr-1.5" />Edit</Button>
            <Button variant="outline" size="sm" onClick={() => setForkName(nextVersionName(recipe.name))} title="Fork: copy this recipe as a new version">
              <GitBranch className="w-3.5 h-3.5 mr-1.5" />Fork
            </Button>
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
              {recipeVariants && (
                <span className="text-xs text-muted-foreground">Versions: {variantListLabel(recipeVariants)}</span>
              )}
            </div>
            {(recipe.parent || recipe.forks.length > 0) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-3">
                <GitBranch className="w-3.5 h-3.5" />
                {recipe.parent && (
                  <span>Forked from <Link href={`/recipes/${recipe.parent.id}`} className="text-primary hover:underline">{recipe.parent.name}</Link></span>
                )}
                {recipe.forks.length > 0 && (
                  <span>
                    Forks:{" "}
                    {recipe.forks.map((f, i) => (
                      <span key={f.id}>
                        {i > 0 && ", "}
                        <Link href={`/recipes/${f.id}`} className="text-primary hover:underline">{f.name}</Link>
                      </span>
                    ))}
                  </span>
                )}
              </div>
            )}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-3">
              {([
                { label: "Batch Size", value: `${recipe.batchSizeGallons} gal` },
                { label: "OG", value: recipe.originalGravity?.toFixed(3) ?? null },
                { label: "FG", value: recipe.finalGravity?.toFixed(3) ?? null },
                { label: "ABV", value: recipe.abv != null ? `${recipe.abv.toFixed(1)}%` : null },
                { label: "IBU", value: recipe.ibu != null ? String(recipe.ibu) : null },
                { label: "Color (SRM)", value: recipe.colorSrm != null ? String(recipe.colorSrm) : null },
                { label: "Efficiency", value: recipe.efficiencyPercent != null ? `${recipe.efficiencyPercent.toFixed(0)}%` : null },
                { label: "Brew Time", value: recipe.estimatedBrewTimeMinutes != null ? formatBrewTime(recipe.estimatedBrewTimeMinutes) : null },
                { label: "BU:GU", value: buGu },
                { label: "Cal/Serving", value: recipe.caloriesPerServing != null ? String(recipe.caloriesPerServing) : null },
              ] as { label: string; value: string | null }[]).map(({ label, value }) => value != null && (
                <div key={label} className="text-center">
                  <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                  <div className="text-sm font-semibold text-foreground">{value}</div>
                </div>
              ))}
            </div>
            {recipe.notes && <p className="text-sm text-muted-foreground border-t border-border pt-3 whitespace-pre-line">{recipe.notes}</p>}
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
            {([
              { label: "Fermentation Temperature", min: recipe.fermentTempMin, ideal: recipe.fermentTempIdeal, max: recipe.fermentTempMax },
              { label: "Conditioning Temperature", min: recipe.conditionTempMin, ideal: recipe.conditionTempIdeal, max: recipe.conditionTempMax },
            ]).filter((r) => r.min != null || r.ideal != null || r.max != null).map((r) => (
              <div key={r.label} className="border-t border-border pt-3 mt-3">
                <div className="text-xs text-muted-foreground mb-2 font-medium">{r.label}</div>
                <div className="flex items-center gap-3 text-sm">
                  {r.min != null && <span className="text-muted-foreground">Min: <span className="text-foreground font-medium">{r.min}°{tempUnit}</span></span>}
                  {r.ideal != null && <span className="text-primary font-semibold">Ideal: {r.ideal}°{tempUnit}</span>}
                  {r.max != null && <span className="text-muted-foreground">Max: <span className="text-foreground font-medium">{r.max}°{tempUnit}</span></span>}
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-muted-foreground mb-1 block">Name</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Style</label><StyleSelect value={form.style} onChange={(v) => setForm({ ...form, style: v })} fallbackPlaceholder="e.g., American IPA" /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Batch Size (gal)</label><Input type="number" step="0.1" value={form.batchSizeGallons} onChange={(e) => setForm({ ...form, batchSizeGallons: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Original Gravity</label><Input type="number" step="0.001" value={form.originalGravity} onChange={(e) => setForm({ ...form, originalGravity: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Final Gravity</label><Input type="number" step="0.001" value={form.finalGravity} onChange={(e) => setForm({ ...form, finalGravity: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">ABV %</label><Input type="number" step="0.1" value={form.abv} onChange={(e) => setForm({ ...form, abv: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">IBU</label><Input type="number" value={form.ibu} onChange={(e) => setForm({ ...form, ibu: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Color (SRM)</label><Input type="number" step="0.1" value={form.colorSrm} onChange={(e) => setForm({ ...form, colorSrm: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Brew Time (min)</label><Input type="number" min="0" value={form.estimatedBrewTimeMinutes} onChange={(e) => setForm({ ...form, estimatedBrewTimeMinutes: e.target.value })} placeholder="e.g., 270" /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Efficiency %</label><Input type="number" step="0.1" min="0" max="100" value={form.efficiencyPercent} onChange={(e) => setForm({ ...form, efficiencyPercent: e.target.value })} placeholder="e.g., 75" /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Cal/Serving</label><Input type="number" min="0" value={form.caloriesPerServing} onChange={(e) => setForm({ ...form, caloriesPerServing: e.target.value })} placeholder="e.g., 180" /></div>
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
            <div>
              <div className="text-xs text-muted-foreground mb-2 font-medium">Fermentation Temperature</div>
              <TempRangeFields prefix="fermentTemp" values={form} unit={tempUnit} onChange={(p) => setForm({ ...form, ...p })} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-2 font-medium">Conditioning Temperature (optional)</div>
              <TempRangeFields prefix="conditionTemp" values={form} unit={tempUnit} onChange={(p) => setForm({ ...form, ...p })} />
              <p className="text-xs text-muted-foreground mt-1">Leave blank for no temperature alerts while conditioning.</p>
            </div>
          </div>
        )}
      </div>

      <RecipeFlowsCard recipeId={id} recipeName={recipe.name} hasFermentTemp={recipe.fermentTempIdeal != null} />

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
          {recipeVariants && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Showing</span>
              <VariantSwitcher available={recipeVariants} value={viewVariant} onChange={setPickedVariant} allowAll />
            </div>
          )}
          {showAddIngredient && <IngredientForm recipeId={id} recipeVariants={recipeVariants} onDone={() => setShowAddIngredient(false)} />}
          {Object.entries(grouped).length === 0 && !showAddIngredient ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {viewVariant && (recipe.ingredients ?? []).length > 0 ? `Nothing in the ${VARIANT_LABELS[viewVariant]} version` : "No ingredients yet"}
            </p>
          ) : (
            Object.entries(grouped).map(([type, ings]) => (
              <div key={type}>
                <div className={`inline-block text-xs px-2 py-0.5 rounded border font-medium mb-2 ${INGREDIENT_TYPE_COLORS[type]}`}>
                  {type.replace("_", " ")}
                </div>
                <div className="space-y-1">
                  {ings.map((ing) => (
                    <IngredientRow key={ing.id} recipeId={id} ing={ing} recipeVariants={recipeVariants} onDelete={() => deleteIngredientMutation.mutate({ id: ing.id })} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Dry Hop Schedule — the day of conditioning each dry hop goes in */}
      <div className="bg-card border border-card-border rounded-lg">
        <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Dry Hop Schedule</h2>
          <Button size="sm" variant="outline" onClick={() => setShowAddDryHop(!showAddDryHop)}>
            <Plus className="w-3.5 h-3.5 mr-1" />Add dry hop
          </Button>
        </div>
        <div className="p-4 space-y-2">
          {showAddDryHop && (
            <IngredientForm
              recipeId={id}
              recipeVariants={recipeVariants}
              preset={{ type: "hop", unit: "oz", use: DRY_HOP }}
              onDone={() => setShowAddDryHop(false)}
            />
          )}
          {dryHops.length === 0 && !showAddDryHop ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No dry hops. Each one you add gets a day of conditioning, and a brew of this recipe
              reminds you on that day until you mark it added.
            </p>
          ) : (
            <div className="space-y-1">
              {dryHops.map((ing) => (
                <IngredientRow key={ing.id} recipeId={id} ing={ing} recipeVariants={recipeVariants} onDelete={() => deleteIngredientMutation.mutate({ id: ing.id })} />
              ))}
            </div>
          )}
        </div>
      </div>

      {recipeVariants && (
        <StartBrewDialog
          recipe={recipe}
          variants={recipeVariants}
          initialVariant={viewVariant}
          open={startDialogOpen}
          onOpenChange={setStartDialogOpen}
        />
      )}

      {/* Batch History — the recipe's track record across every scored brew */}
      <div className="bg-card border border-card-border rounded-lg">
        <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Batch History</h2>
          <ScoreBadge
            value={recipe.avgScore}
            suffix={`avg of ${recipe.ratedBatchCount}`}
          />
        </div>
        <div className="divide-y divide-border">
          {recipe.ratedBatches.length === 0 ? (
            <div className="p-4">
              <p className="text-sm text-muted-foreground">
                No rated batches yet.
                {(recipe.batchCount ?? 0) > 0
                  ? " Rate a packaged batch to start building this recipe's track record."
                  : " Brew this recipe and rate the result to start building a track record."}
              </p>
            </div>
          ) : (
            recipe.ratedBatches.map((batch) => (
              <Link key={batch.id} href={`/brew-sessions/${batch.id}`}>
                <div className="px-4 py-3 flex items-center gap-3 hover:bg-muted cursor-pointer">
                  <Beer className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{batch.recipeName}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(batch.brewDate)}</div>
                  </div>
                  <ScoreBadge value={batch.overallScore} />
                </div>
              </Link>
            ))
          )}
        </div>
        {recipe.familyStats && (
          <div className="px-4 py-2.5 border-t border-card-border flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              All {recipe.familyStats.recipeCount} versions: {recipe.familyStats.batchCount} batch{recipe.familyStats.batchCount === 1 ? "" : "es"}
            </span>
            <ScoreBadge value={recipe.familyStats.avgScore} suffix={`avg of ${recipe.familyStats.ratedBatchCount}`} />
          </div>
        )}
      </div>

      {/* Version History — what changed in the recipe from one brew to the next */}
      {history && history.brews.length > 0 && (
        <div className="bg-card border border-card-border rounded-lg">
          <div className="px-4 py-3 border-b border-card-border">
            <h2 className="text-sm font-semibold text-foreground">Version History</h2>
          </div>
          <div className="divide-y divide-border">
            {history.sinceLastBrew && (
              <div className="px-4 py-3">
                <div className="text-xs font-medium text-foreground mb-1.5">Changed since last brew</div>
                {history.sinceLastBrew.length > 0
                  ? <RecipeChangeList changes={history.sinceLastBrew} />
                  : <p className="text-xs text-muted-foreground">No changes since the last brew.</p>}
              </div>
            )}
            {history.brews.map((brew) => (
              <div key={brew.id} className="px-4 py-3">
                <div className="flex items-center gap-3 mb-1.5">
                  <Link href={`/brew-sessions/${brew.id}`} className="text-sm font-medium text-foreground hover:text-primary">
                    {formatDate(brew.brewDate)}
                  </Link>
                  {brew.recipeVariant && <span className="text-xs text-muted-foreground">{VARIANT_LABELS[brew.recipeVariant]}</span>}
                  <span className="ml-auto"><ScoreBadge value={brew.overallScore} /></span>
                </div>
                {!brew.recorded ? (
                  <p className="text-xs text-muted-foreground">Not recorded (brewed before version history).</p>
                ) : brew.changes == null ? (
                  <p className="text-xs text-muted-foreground">
                    {brew.recipeVariant ? `First recorded ${VARIANT_LABELS[brew.recipeVariant]} brew.` : "First recorded brew."}
                  </p>
                ) : brew.changes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {brew.recipeVariant ? `Same recipe as the ${VARIANT_LABELS[brew.recipeVariant]} brew before.` : "Same recipe as the brew before."}
                  </p>
                ) : (
                  <RecipeChangeList changes={brew.changes} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={forkName != null} onOpenChange={(open) => { if (!open) setForkName(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fork this recipe</DialogTitle>
            <DialogDescription>
              Makes a copy with the same ingredients, steps and Brew Flow links to change freely. This recipe and its brews stay as they are.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Name</label>
            <Input value={forkName ?? ""} onChange={(e) => setForkName(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForkName(null)}>Cancel</Button>
            <Button
              onClick={() => forkMutation.mutate({ id, data: { name: forkName?.trim() || undefined } })}
              disabled={forkMutation.isPending}
            >
              {forkMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5 mr-1.5" />}
              Fork
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** "Pale Ale" → "Pale Ale v2", "Pale Ale v2" → "Pale Ale v3". Mirrors the server's default fork name. */
function nextVersionName(name: string): string {
  const trimmed = name.trim();
  const match = /^(.*\S)\s+v(\d+)$/i.exec(trimmed);
  return match ? `${match[1]} v${Number(match[2]) + 1}` : `${trimmed} v2`;
}
