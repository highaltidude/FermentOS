export const INGREDIENT_TYPES = ["malt", "hop", "yeast", "adjunct", "water_agent", "other"];
export const INGREDIENT_USES = ["mash", "boil", "dry_hop", "whirlpool", "primary", "secondary", "packaging", "other"];
export const STEP_PHASES = ["mash", "boil", "fermentation", "conditioning", "packaging", "other"];

// Uses whose timing the boil timer schedules alerts from.
export const TIMED_USES = ["boil", "whirlpool"];

export const timingPlaceholder = (use: string) =>
  use === "whirlpool" ? "Whirlpool min (optional)" : "Min left in boil (60, 15, 0…)";

export const INGREDIENT_TYPE_COLORS: Record<string, string> = {
  malt: "bg-amber-100 text-amber-800 border-amber-200",
  hop: "bg-green-100 text-green-800 border-green-200",
  yeast: "bg-yellow-100 text-yellow-800 border-yellow-200",
  adjunct: "bg-orange-100 text-orange-800 border-orange-200",
  water_agent: "bg-blue-100 text-blue-800 border-blue-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};
