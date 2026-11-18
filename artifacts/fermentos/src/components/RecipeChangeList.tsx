import type { RecipeChange, RecipeSnapshotIngredient, RecipeSnapshotStep } from "@workspace/api-client-react";
import { DRY_HOP } from "@/lib/ingredients";
import { useFermentTempUnit } from "@/hooks/useFermentTempUnit";
import { useWaterVolumeUnit } from "@/hooks/useWaterVolumeUnit";
import { saltName } from "@/lib/recipeWater";
import { fromLitres } from "@/lib/recipeWater";
import { SALTS, type Salt } from "@/lib/waterChemistry";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  style: "Style",
  batchSizeGallons: "Batch size",
  originalGravity: "OG",
  finalGravity: "FG",
  abv: "ABV",
  ibu: "IBU",
  colorSrm: "Color (SRM)",
  efficiencyPercent: "Efficiency",
  fermentTempMin: "Ferment min",
  fermentTempIdeal: "Ferment ideal",
  fermentTempMax: "Ferment max",
  conditionTempMin: "Condition min",
  conditionTempIdeal: "Condition ideal",
  conditionTempMax: "Condition max",
  notes: "Notes",
};

function fieldValue(field: string, value: number | string | null | undefined, tempUnit: string): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string") return field === "notes" ? "edited" : value;
  if (field === "originalGravity" || field === "finalGravity") return value.toFixed(3);
  if (field === "abv" || field === "efficiencyPercent") return `${value}%`;
  if (field === "batchSizeGallons") return `${value} gal`;
  if (field.includes("Temp")) return `${value}°${tempUnit}`;
  return String(value);
}

/**
 * The recipe's water is reported piece by piece: "water" when it was added or
 * removed (values are the target's name), else its target, volume and salts.
 */
function describeWater(field: string, from: RecipeChange["from"], to: RecipeChange["to"], volumeUnit: "gal" | "L") {
  if (field === "water") {
    return to != null
      ? { sign: "+" as const, text: `Water: ${to}` }
      : { sign: "−" as const, text: `Water: ${from ?? "—"}` };
  }
  if (field === "water.target") return { sign: "~" as const, text: `Water target: ${from ?? "—"} → ${to ?? "—"}` };
  if (field === "water.volumeLitres") {
    const v = (x: typeof from) => (typeof x === "number" ? `${fromLitres(x, volumeUnit)} ${volumeUnit}` : "—");
    return { sign: "~" as const, text: `Water volume: ${v(from)} → ${v(to)}` };
  }
  const salt = field.slice("water.".length);
  const name = (SALTS as readonly string[]).includes(salt) ? saltName(salt as Salt) : salt;
  return { sign: "~" as const, text: `${name}: ${from ?? 0} g → ${to ?? 0} g` };
}

const useLabel = (use: string | null) => (use ? use.replace("_", " ") : null);

/** "1.5 oz · boil 15 min" — the parts of an ingredient a change can touch. */
export function ingredientDetail(i: RecipeSnapshotIngredient): string {
  const timing = i.use === DRY_HOP
    ? (i.dryHopDay != null ? `day ${i.dryHopDay}` : null)
    : (i.timingMinutes != null ? `${i.timingMinutes} min` : null);
  return [`${i.amount} ${i.unit}`, [useLabel(i.use), timing].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
}

function stepLabel(s: RecipeSnapshotStep): string {
  const body = s.body.length > 60 ? `${s.body.slice(0, 57)}…` : s.body;
  return s.phase ? `${s.phase}: ${body}` : body;
}

function describe(c: RecipeChange, tempUnit: string, volumeUnit: "gal" | "L"): { sign: "+" | "−" | "~"; text: string } {
  switch (c.kind) {
    case "field": {
      const field = c.field ?? "";
      if (field === "water" || field.startsWith("water.")) return describeWater(field, c.from, c.to, volumeUnit);
      const label = FIELD_LABELS[field] ?? field;
      if (field === "notes") return { sign: "~", text: "Notes edited" };
      return { sign: "~", text: `${label}: ${fieldValue(field, c.from, tempUnit)} → ${fieldValue(field, c.to, tempUnit)}` };
    }
    case "ingredient_added":
      return { sign: "+", text: `${c.ingredient!.name} (${ingredientDetail(c.ingredient!)})` };
    case "ingredient_removed":
      return { sign: "−", text: `${c.ingredient!.name} (${ingredientDetail(c.ingredient!)})` };
    case "ingredient_changed":
      return { sign: "~", text: `${c.ingredient!.name}: ${ingredientDetail(c.previousIngredient!)} → ${ingredientDetail(c.ingredient!)}` };
    case "step_added":
      return { sign: "+", text: `Step ${stepLabel(c.step!)}` };
    case "step_removed":
      return { sign: "−", text: `Step ${stepLabel(c.step!)}` };
    case "step_changed":
      return { sign: "~", text: `Step ${stepLabel(c.step!)}: ${c.previousStep!.durationMinutes ?? "—"} → ${c.step!.durationMinutes ?? "—"} min` };
  }
}

const SIGN_CLASS = { "+": "text-green-600", "−": "text-red-600", "~": "text-amber-600" } as const;

/** What changed between two versions of a recipe, one line per change. */
export function RecipeChangeList({ changes }: { changes: RecipeChange[] }) {
  const tempUnit = useFermentTempUnit();
  const volumeUnit = useWaterVolumeUnit();
  return (
    <ul className="space-y-0.5">
      {changes.map((c, i) => {
        const { sign, text } = describe(c, tempUnit, volumeUnit);
        return (
          <li key={i} className="text-xs text-foreground flex gap-1.5">
            <span className={`font-mono w-3 shrink-0 ${SIGN_CLASS[sign]}`}>{sign}</span>
            <span className="min-w-0 break-words">{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
