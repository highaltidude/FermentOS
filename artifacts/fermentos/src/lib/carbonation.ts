import { LITRES_PER_GALLON } from "./waterChemistry";

/** Typical carbonation ranges in volumes of CO2. */
export const CARB_STYLE_PRESETS = [
  { id: "british-ale", label: "British ales", min: 1.5, max: 2.0, target: 1.8 },
  { id: "porter-stout", label: "Porter and stout", min: 1.7, max: 2.3, target: 2.0 },
  { id: "belgian-ale", label: "Belgian ales", min: 1.9, max: 2.4, target: 2.2 },
  { id: "american-ale", label: "American ales and lagers", min: 2.2, max: 2.7, target: 2.5 },
  { id: "european-lager", label: "European lagers", min: 2.4, max: 2.7, target: 2.6 },
  { id: "fruit-sour", label: "Fruit and sour beers", min: 2.5, max: 3.0, target: 2.7 },
  { id: "belgian-strong", label: "Belgian strong, tripel, saison", min: 2.5, max: 3.5, target: 3.0 },
  { id: "german-wheat", label: "German wheat", min: 3.3, max: 4.5, target: 3.8 },
  { id: "cider", label: "Cider", min: 2.0, max: 3.0, target: 2.5 },
] as const;

export type CarbStylePreset = (typeof CARB_STYLE_PRESETS)[number];

export const SUGARS = ["corn", "table", "dme", "honey"] as const;
export type Sugar = (typeof SUGARS)[number];

export const SUGAR_LABELS: Record<Sugar, string> = {
  corn: "Corn sugar (dextrose)",
  table: "Table sugar (sucrose)",
  dme: "Dry malt extract",
  honey: "Honey",
};

/** Grams of corn sugar per litre for each volume of CO2 (15.195 g per US gallon). */
const CORN_SUGAR_G_PER_L_PER_VOL = 15.195 / LITRES_PER_GALLON;

/** Weight of each sugar needed relative to corn sugar for the same CO2. */
const SUGAR_FACTORS: Record<Sugar, number> = { corn: 1, table: 0.91, dme: 1.33, honey: 1.17 };

const GRAMS_PER_OZ = 28.3495;
const BAR_PER_PSI = 0.0689476;

export const fToC = (f: number) => ((f - 32) * 5) / 9;
export const cToF = (c: number) => (c * 9) / 5 + 32;
export const gramsToOz = (g: number) => g / GRAMS_PER_OZ;
export const psiToBar = (psi: number) => psi * BAR_PER_PSI;

/**
 * CO2 already dissolved in the beer, in volumes, from the highest temperature
 * it reached after fermentation finished.
 */
export function residualCo2(tempF: number): number {
  return 3.0378 - 0.050062 * tempF + 0.00026555 * tempF * tempF;
}

/**
 * Grams of each priming sugar to reach `targetVol`, or null when the beer
 * already holds at least that much CO2.
 */
export function primingSugar({ volumeL, tempF, targetVol }: { volumeL: number; tempF: number; targetVol: number }):
  | { residual: number; grams: Record<Sugar, number> }
  | { residual: number; grams: null } {
  const residual = residualCo2(tempF);
  const needed = targetVol - residual;
  if (needed <= 0) return { residual, grams: null };
  const corn = CORN_SUGAR_G_PER_L_PER_VOL * volumeL * needed;
  const grams = Object.fromEntries(SUGARS.map((s) => [s, corn * SUGAR_FACTORS[s]])) as Record<Sugar, number>;
  return { residual, grams };
}

/** Regulator pressure (psig) that settles at `targetVol` at `tempF`. */
export function forceCarbPsi({ tempF, targetVol }: { tempF: number; targetVol: number }): number {
  const T = tempF;
  const V = targetVol;
  const psi =
    -16.6999 - 0.0101059 * T + 0.00116512 * T * T + 0.173354 * T * V + 4.24267 * V - 0.0684226 * V * V;
  return Math.max(0, psi);
}
