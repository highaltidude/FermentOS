import type { RecipeChange, RecipeSnapshotIngredient, RecipeSnapshotStep } from "@workspace/api-client-react";
import { DRY_HOP } from "@/lib/ingredients";
import { useFermentTempUnit } from "@/hooks/useFermentTempUnit";

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

function describe(c: RecipeChange, tempUnit: string): { sign: "+" | "−" | "~"; text: string } {
  switch (c.kind) {
    case "field": {
      const field = c.field ?? "";
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
  return (
    <ul className="space-y-0.5">
      {changes.map((c, i) => {
        const { sign, text } = describe(c, tempUnit);
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
