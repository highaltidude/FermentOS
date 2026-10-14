export const INGREDIENT_TYPES = ["malt", "hop", "yeast", "adjunct", "water_agent", "other"];
export const INGREDIENT_USES = ["mash", "steep", "boil", "dry_hop", "whirlpool", "primary", "secondary", "packaging", "other"];
export const STEP_PHASES = ["mash", "boil", "fermentation", "conditioning", "packaging", "other"];

// Uses whose timing the boil timer schedules alerts from.
export const TIMED_USES = ["boil", "whirlpool"];

// Dry hops carry a day of conditioning instead of minutes; the server reminds
// from it until the addition is marked added on the brew page.
export const DRY_HOP = "dry_hop";

// Uses that get the number field in the ingredient forms.
export const hasTimingField = (use: string) => TIMED_USES.includes(use) || use === DRY_HOP;

export const timingPlaceholder = (use: string) =>
  use === DRY_HOP ? "Day of conditioning to add (0, 3, 5…)"
    : use === "whirlpool" ? "Whirlpool min (optional)" : "Min left in boil (60, 15, 0…)";

/**
 * The forms' one number field, split into the column it means for this use.
 * The other is null, so changing an ingredient's use clears the stale value.
 */
export function timingFields(use: string, value: string): { timingMinutes: number | null; dryHopDay: number | null } {
  const n = value === "" ? null : Number(value);
  return {
    timingMinutes: TIMED_USES.includes(use) ? n : null,
    dryHopDay: use === DRY_HOP ? n : null,
  };
}

/** The number field's starting value for a saved ingredient. */
export function timingValue(ing: { use?: string | null; timingMinutes?: number | null; dryHopDay?: number | null }): string {
  const n = ing.use === DRY_HOP ? ing.dryHopDay : ing.timingMinutes;
  return n != null ? String(n) : "";
}

export const INGREDIENT_TYPE_COLORS: Record<string, string> = {
  malt: "bg-amber-100 text-amber-800 border-amber-200",
  hop: "bg-green-100 text-green-800 border-green-200",
  yeast: "bg-yellow-100 text-yellow-800 border-yellow-200",
  adjunct: "bg-orange-100 text-orange-800 border-orange-200",
  water_agent: "bg-blue-100 text-blue-800 border-blue-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};
