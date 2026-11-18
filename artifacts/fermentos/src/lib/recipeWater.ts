/**
 * A recipe's saved water: turning the calculator's inputs into one, reading
 * one back into the calculator, and scaling it to a batch.
 */
import type { RecipeWater } from "@workspace/api-client-react";
import { IONS, LITRES_PER_GALLON, SALTS, SALT_LABELS, TARGET_PROFILES, type Profile, type Salt, type SaltAmounts } from "./waterChemistry";

export const CUSTOM_TARGET = "custom";

/** Grams to a tenth, as the calculator suggests them. */
const tenth = (n: number) => Math.round(n * 10) / 10;

export function fromLitres(litres: number, unit: "gal" | "L"): number {
  return unit === "gal" ? Math.round((litres / LITRES_PER_GALLON) * 100) / 100 : Math.round(litres * 10) / 10;
}

const sameProfile = (a: Profile, b: Profile) => IONS.every((ion) => a[ion] === b[ion]);

/**
 * The calculator preset a saved water selects: its own, while the preset still
 * has the ions it was saved with. Otherwise the saved ions go in as Custom, so
 * reopening a recipe never quietly swaps in a preset's newer numbers.
 */
export function presetFor(water: RecipeWater): string {
  const preset = TARGET_PROFILES.find((t) => t.id === water.target.presetId);
  return preset && sameProfile(preset.profile, ionsOf(water)) ? preset.id : CUSTOM_TARGET;
}

export function ionsOf(water: RecipeWater): Profile {
  return Object.fromEntries(IONS.map((ion) => [ion, water.target.profile[ion]])) as Profile;
}

export function saltsOf(water: RecipeWater): SaltAmounts {
  return Object.fromEntries(SALTS.map((s) => [s, water.salts[s] ?? 0])) as SaltAmounts;
}

/** What the calculator holds, as a recipe's water. Null until there is a volume to work to. */
export function waterFromCalculator(input: {
  targetId: string;
  target: Profile;
  salts: SaltAmounts;
  litres: number;
}): RecipeWater | null {
  if (!(input.litres > 0)) return null;
  const preset = TARGET_PROFILES.find((t) => t.id === input.targetId);
  return {
    target: {
      presetId: preset?.id ?? null,
      name: preset?.name ?? "Custom",
      profile: Object.fromEntries(IONS.map((ion) => [ion, input.target[ion]])) as Profile,
    },
    salts: Object.fromEntries(SALTS.map((s) => [s, tenth(input.salts[s])])) as SaltAmounts,
    volumeLitres: Math.round(input.litres * 100) / 100,
  };
}

/**
 * The water for a batch of a different size: salts and volume grow or shrink
 * with it, so the profile stays the same.
 */
export function scaleWater(water: RecipeWater, factor: number): RecipeWater {
  if (!(factor > 0) || factor === 1) return water;
  return {
    ...water,
    salts: Object.fromEntries(SALTS.map((s) => [s, tenth((water.salts[s] ?? 0) * factor)])) as SaltAmounts,
    volumeLitres: Math.round(water.volumeLitres * factor * 100) / 100,
  };
}

/** The salts to add, largest first, leaving out the ones at zero. */
export function additions(water: RecipeWater): { salt: (typeof SALTS)[number]; grams: number }[] {
  return SALTS.map((salt) => ({ salt, grams: water.salts[salt] ?? 0 }))
    .filter((a) => a.grams > 0)
    .sort((a, b) => b.grams - a.grams);
}

/** "Gypsum (CaSO₄·2H₂O)" → "Gypsum": the formula is for the calculator. */
export const saltName = (salt: Salt) => SALT_LABELS[salt].replace(/\s*\(.*\)$/, "");
