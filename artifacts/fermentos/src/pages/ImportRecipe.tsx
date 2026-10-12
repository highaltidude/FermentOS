import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, FileUp, Loader2, X } from "lucide-react";
import {
  useParseMorebeerKitSheet,
  useImportRecipe,
  useListInventory,
  getListRecipesQueryKey,
  type IngredientType,
  type IngredientUse,
  type KitSheetDraft,
  type RecipeVariant,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IngredientNameCombobox } from "@/components/IngredientNameCombobox";
import { StyleSelect } from "@/components/StyleSelect";
import { TempRangeFields } from "@/components/TempRangeFields";
import { VariantChips, VariantSwitcher } from "@/components/VariantChips";
import { useToast } from "@/hooks/use-toast";
import { useFermentTempUnit } from "@/hooks/useFermentTempUnit";
import { apiErrorMessage } from "@/lib/inventoryShortage";
import { INGREDIENT_TYPES, INGREDIENT_USES, TIMED_USES, timingPlaceholder } from "@/lib/ingredients";
import { appliesToVariant, VARIANT_LABELS, variantListLabel } from "@/lib/recipeVariants";

// Matches the server's limit, so an oversized file is caught before it uploads.
const MAX_PDF_BYTES = 10 * 1024 * 1024;

interface Row {
  key: number;
  name: string;
  type: string;
  amount: string;
  unit: string;
  use: string;
  timingMinutes: string;
  notes: string;
  variants: RecipeVariant[] | null;
  /** The line this was read from, shown so a misread is easy to spot. */
  sourceText: string | null;
  /** The row the yeast picker owns and replaces. */
  yeastPick?: boolean;
}

const NO_YEAST = "none";

/** Kit temperatures are printed in °F; recipes are kept in the user's unit. */
function fromFahrenheit(f: number, unit: "C" | "F"): number {
  return unit === "C" ? Math.round(((f - 32) * 5) / 9 * 10) / 10 : f;
}

const yeastLabel = (y: { lab: string; name: string }) => `${y.lab.replace(/\s+Dry$/i, "")} ${y.name}`;

/** Everything the sheet says that has no field of its own. */
function composeNotes(draft: KitSheetDraft): string {
  const { stats, hints } = draft;
  const lines = ["Imported from a MoreBeer kit sheet."];
  if (stats.originalGravityMin != null && stats.originalGravityMax != null && stats.originalGravityMax !== stats.originalGravityMin) {
    lines.push(`Estimated OG ${stats.originalGravityMin.toFixed(3)}–${stats.originalGravityMax.toFixed(3)}.`);
  }
  if (hints.boilMinutes != null) lines.push(`Boil: ${hints.boilMinutes} minutes.`);
  if (hints.mashTempF != null) lines.push(`Suggested mash temperature (all-grain): ${hints.mashTempF}°F.`);
  if (draft.suggestedYeasts.length > 0) {
    lines.push(`Suggested yeasts: ${draft.suggestedYeasts.map((y) => `${y.lab} ${y.name}`).join("; ")}.`);
  }
  if (draft.tips) lines.push("", `Recipe tips: ${draft.tips}`);
  return lines.join("\n");
}

function buildForm(draft: KitSheetDraft, tempUnit: "C" | "F") {
  const { stats, hints } = draft;
  const og = stats.originalGravityMin != null && stats.originalGravityMax != null
    ? ((stats.originalGravityMin + stats.originalGravityMax) / 2).toFixed(3)
    : "";
  const temp = (f: number | null) => (f == null ? "" : String(fromFahrenheit(f, tempUnit)));
  const ideal = hints.fermentTempMinF != null && hints.fermentTempMaxF != null
    ? temp((hints.fermentTempMinF + hints.fermentTempMaxF) / 2)
    : "";
  return {
    name: draft.name,
    style: "",
    batchSizeGallons: String(draft.batchSizeGallons),
    originalGravity: og,
    abv: stats.abv != null ? String(stats.abv) : "",
    ibu: stats.ibu != null ? String(stats.ibu) : "",
    colorSrm: stats.colorSrm != null ? String(stats.colorSrm) : "",
    notes: composeNotes(draft),
    fermentTempMin: temp(hints.fermentTempMinF),
    fermentTempIdeal: ideal,
    fermentTempMax: temp(hints.fermentTempMaxF),
  };
}

type Form = ReturnType<typeof buildForm>;

export default function ImportRecipe() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const tempUnit = useFermentTempUnit();
  const fileRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<KitSheetDraft | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [yeast, setYeast] = useState(NO_YEAST);
  const [viewVariant, setViewVariant] = useState<RecipeVariant | null>(null);

  const { data: inventoryItems = [] } = useListInventory({});

  const parseMutation = useParseMorebeerKitSheet({
    mutation: {
      onSuccess: (parsed) => {
        setDraft(parsed);
        setForm(buildForm(parsed, tempUnit));
        setRows(parsed.ingredients.map((ing) => ({
          key: nextKey.current++,
          name: ing.name,
          type: ing.type,
          amount: ing.amount != null ? String(ing.amount) : "",
          unit: ing.unit ?? "",
          use: ing.use ?? "",
          timingMinutes: ing.timingMinutes != null ? String(ing.timingMinutes) : "",
          notes: ing.notes ?? "",
          variants: ing.variants,
          sourceText: ing.sourceText,
        })));
        setYeast(NO_YEAST);
        setViewVariant(null);
      },
      onError: (err: unknown) => {
        setUploadError(apiErrorMessage(err) ?? "The file could not be read. Please try again.");
      },
    },
  });

  const importMutation = useImportRecipe({
    mutation: {
      onSuccess: (recipe) => {
        qc.invalidateQueries({ queryKey: getListRecipesQueryKey() });
        toast({ title: "Recipe imported!" });
        navigate(`/recipes/${recipe.id}`);
      },
      onError: (err: unknown) => {
        toast({ title: "Could not save the recipe", description: apiErrorMessage(err) ?? "Please try again", variant: "destructive" });
      },
    },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Clear the input so choosing the same file again still fires a change.
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    if (file.size > MAX_PDF_BYTES) {
      setUploadError("That file is too large. Kit sheets are a few megabytes; the limit is 10 MB.");
      return;
    }
    parseMutation.mutate({ data: file });
  };

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: number) => {
    if (rows.find((r) => r.key === key)?.yeastPick) setYeast(NO_YEAST);
    setRows((current) => current.filter((r) => r.key !== key));
  };

  const pickYeast = (value: string) => {
    setYeast(value);
    const chosen = draft?.suggestedYeasts[Number(value)];
    setRows((current) => {
      const rest = current.filter((r) => !r.yeastPick);
      if (value === NO_YEAST || !chosen) return rest;
      return [...rest, {
        key: nextKey.current++, name: yeastLabel(chosen), type: "yeast", amount: "1", unit: "pkg",
        use: "primary", timingMinutes: "", notes: "", variants: null, sourceText: null, yeastPick: true,
      }];
    });
  };

  const incomplete = (r: Row) => !r.name.trim() || r.amount === "" || !(Number(r.amount) > 0) || !r.unit.trim();
  const incompleteCount = rows.filter(incomplete).length;
  const visibleRows = useMemo(() => rows.filter((r) => appliesToVariant(r.variants, viewVariant)), [rows, viewVariant]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !form) return;
    if (!form.name.trim() || !form.style || !(Number(form.batchSizeGallons) > 0)) {
      toast({ title: "Name, style, and batch size are required", variant: "destructive" });
      return;
    }
    if (incompleteCount > 0) {
      setViewVariant(null);
      toast({
        title: `${incompleteCount} ingredient${incompleteCount === 1 ? " needs" : "s need"} an amount and unit`,
        description: "Fill them in, or remove the ones you don't want.",
        variant: "destructive",
      });
      return;
    }
    const num = (s: string) => (s !== "" ? Number(s) : undefined);
    importMutation.mutate({
      data: {
        recipe: {
          name: form.name.trim(),
          style: form.style,
          batchSizeGallons: Number(form.batchSizeGallons),
          originalGravity: num(form.originalGravity),
          abv: num(form.abv),
          ibu: num(form.ibu),
          colorSrm: num(form.colorSrm),
          notes: form.notes || undefined,
          fermentTempMin: num(form.fermentTempMin),
          fermentTempIdeal: num(form.fermentTempIdeal),
          fermentTempMax: num(form.fermentTempMax),
        },
        variants: draft.variants,
        ingredients: rows.map((r) => ({
          name: r.name.trim(),
          type: r.type as IngredientType,
          amount: Number(r.amount),
          unit: r.unit.trim(),
          use: (r.use || undefined) as IngredientUse | undefined,
          timingMinutes: TIMED_USES.includes(r.use) && r.timingMinutes !== "" ? Number(r.timingMinutes) : undefined,
          notes: r.notes || undefined,
          variants: r.variants,
        })),
      },
    });
  };

  const header = (
    <div className="flex items-center gap-3">
      <button onClick={() => navigate("/recipes")} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Back to recipes">
        <ArrowLeft className="w-4 h-4" />
      </button>
      <h1 className="text-xl font-bold text-foreground">Import a Recipe</h1>
    </div>
  );

  const fileInput = (
    <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleFile} />
  );

  if (!draft || !form) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        {header}
        <div className="bg-card border border-card-border rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">MoreBeer kit sheet</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Upload the recipe PDF from a MoreBeer kit's product page. If the sheet covers the LME, DME and
              All-Grain kits, all three are imported as one recipe and you pick the version each time you brew.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Nothing is saved until you have reviewed what was read.
            </p>
          </div>
          {fileInput}
          <Button onClick={() => fileRef.current?.click()} disabled={parseMutation.isPending}>
            {parseMutation.isPending
              ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Reading…</>
              : <><FileUp className="w-4 h-4 mr-1.5" />Choose PDF</>}
          </Button>
          {uploadError && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {uploadError}
            </div>
          )}
        </div>
      </div>
    );
  }

  const setField = (patch: Partial<Form>) => setForm({ ...form, ...patch });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {header}

      <form onSubmit={handleSave} className="space-y-4">
        {draft.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />Check before saving
            </div>
            <ul className="mt-2 space-y-1.5 list-disc pl-5">
              {draft.warnings.map((w, i) => (
                <li key={i}>
                  {w.message}
                  {w.sourceText && <span className="block text-xs opacity-80">On the sheet: “{w.sourceText}”</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-card border border-card-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Recipe Details</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">Recipe Name *</label>
              <Input value={form.name} onChange={(e) => setField({ name: e.target.value })} /></div>
            <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">Style * <span className="opacity-70">(not printed on the sheet)</span></label>
              <StyleSelect value={form.style} onChange={(v) => setField({ style: v })} fallbackPlaceholder="e.g., Double IPA" /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">Batch Size (gal) *</label>
              <Input type="number" step="0.1" value={form.batchSizeGallons} onChange={(e) => setField({ batchSizeGallons: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">Original Gravity</label>
              <Input type="number" step="0.001" value={form.originalGravity} onChange={(e) => setField({ originalGravity: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">ABV %</label>
              <Input type="number" step="0.1" value={form.abv} onChange={(e) => setField({ abv: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">IBU</label>
              <Input type="number" value={form.ibu} onChange={(e) => setField({ ibu: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground mb-1 block">Color (SRM)</label>
              <Input type="number" step="0.1" value={form.colorSrm} onChange={(e) => setField({ colorSrm: e.target.value })} /></div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-medium">Fermentation Temperature</div>
            <TempRangeFields prefix="fermentTemp" values={form} unit={tempUnit} onChange={(p) => setField(p)} />
          </div>
          <div><label className="text-xs text-muted-foreground mb-1 block">Notes</label>
            <Textarea value={form.notes} onChange={(e) => setField({ notes: e.target.value })} rows={8} /></div>
        </div>

        {draft.suggestedYeasts.length > 0 && (
          <div className="bg-card border border-card-border rounded-lg p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Yeast</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                The sheet suggests {draft.suggestedYeasts.length}. Pick the one you'll use and it's added as an ingredient; the full list stays in the notes.
              </p>
            </div>
            <Select value={yeast} onValueChange={pickYeast}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_YEAST}>Decide later</SelectItem>
                {draft.suggestedYeasts.map((y, i) => <SelectItem key={i} value={String(i)}>{y.lab}: {y.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="bg-card border border-card-border rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Ingredients</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {draft.variants
                  ? `${rows.length} in all, across ${draft.variants.length} versions. Match names to your inventory so stock is deducted when you brew.`
                  : `${rows.length} read from the sheet. Match names to your inventory so stock is deducted when you brew.`}
              </p>
            </div>
            {draft.variants && (
              <VariantSwitcher available={draft.variants} value={viewVariant} onChange={setViewVariant} allowAll />
            )}
          </div>

          {visibleRows.map((row) => (
            <div key={row.key} className={`space-y-2 pb-3 border-b border-border last:border-0 last:pb-0 ${incomplete(row) ? "border-l-2 border-l-destructive pl-3" : ""}`}>
              <div className="flex gap-2 items-center">
                <IngredientNameCombobox
                  className="flex-1 min-w-0"
                  value={row.name}
                  onChange={(v) => updateRow(row.key, { name: v })}
                  onSelect={(item) => updateRow(row.key, { name: item.name, type: item.type, ...(row.unit ? {} : { unit: item.unit }) })}
                  suggestions={inventoryItems}
                />
                <button type="button" onClick={() => removeRow(row.key)} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1" aria-label={`Remove ${row.name}`}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input className="text-sm" placeholder="Amount" type="number" step="0.01" value={row.amount} onChange={(e) => updateRow(row.key, { amount: e.target.value })} />
                <Input className="text-sm" placeholder="Unit (lbs, oz…)" value={row.unit} onChange={(e) => updateRow(row.key, { unit: e.target.value })} />
                <Select value={row.type} onValueChange={(v) => updateRow(row.key, { type: v })}>
                  <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{INGREDIENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={row.use} onValueChange={(v) => updateRow(row.key, { use: v })}>
                  <SelectTrigger className="text-sm h-9"><SelectValue placeholder="Use" /></SelectTrigger>
                  <SelectContent>{INGREDIENT_USES.map((u) => <SelectItem key={u} value={u}>{u.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {TIMED_USES.includes(row.use) && (
                <Input
                  className="text-sm" type="number" min="0" step="1" inputMode="numeric"
                  placeholder={timingPlaceholder(row.use)}
                  value={row.timingMinutes} onChange={(e) => updateRow(row.key, { timingMinutes: e.target.value })}
                />
              )}
              <Input className="text-sm" placeholder="Notes (optional)" value={row.notes} onChange={(e) => updateRow(row.key, { notes: e.target.value })} />
              {draft.variants && (
                <VariantChips available={draft.variants} value={row.variants} onChange={(v) => updateRow(row.key, { variants: v })} />
              )}
              {row.sourceText && <p className="text-xs text-muted-foreground">On the sheet: “{row.sourceText}”</p>}
            </div>
          ))}
          {visibleRows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {viewVariant ? `Nothing left in the ${VARIANT_LABELS[viewVariant]} version.` : "No ingredients left."}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 flex-wrap">
          {draft.variants && (
            <span className="text-xs text-muted-foreground mr-auto">Saves one recipe with versions: {variantListLabel(draft.variants)}</span>
          )}
          {fileInput}
          <Button type="button" variant="ghost" onClick={() => fileRef.current?.click()} disabled={parseMutation.isPending}>Choose another file</Button>
          <Button type="button" variant="outline" onClick={() => navigate("/recipes")}>Cancel</Button>
          <Button type="submit" disabled={importMutation.isPending}>Save Recipe</Button>
        </div>
        {uploadError && (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{uploadError}</div>
        )}
      </form>
    </div>
  );
}
