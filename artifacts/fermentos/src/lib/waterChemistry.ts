/**
 * Brewing water math: what salt additions do to a water profile, and which
 * additions get closest to a target. Pure, so it is tested in isolation.
 */

export const IONS = ["calcium", "magnesium", "sodium", "sulfate", "chloride", "bicarbonate"] as const;
export type Ion = (typeof IONS)[number];

/** Ion concentrations in ppm (mg/L). */
export type Profile = Record<Ion, number>;

export const ION_LABELS: Record<Ion, string> = {
  calcium: "Calcium (Ca)",
  magnesium: "Magnesium (Mg)",
  sodium: "Sodium (Na)",
  sulfate: "Sulfate (SO₄)",
  chloride: "Chloride (Cl)",
  bicarbonate: "Bicarbonate (HCO₃)",
};

export const RO_WATER: Profile = { calcium: 0, magnesium: 0, sodium: 0, sulfate: 0, chloride: 0, bicarbonate: 0 };

// Standard atomic weights, g/mol.
const M = { Ca: 40.078, Mg: 24.305, Na: 22.99, S: 32.06, O: 15.999, Cl: 35.45, H: 1.008, C: 12.011 };
const SO4 = M.S + 4 * M.O;
const HCO3 = M.H + M.C + 3 * M.O;
const H2O = 2 * M.H + M.O;

export const SALTS = ["gypsum", "calciumChloride", "epsom", "tableSalt", "bakingSoda"] as const;
export type Salt = (typeof SALTS)[number];
export type SaltAmounts = Record<Salt, number>;

export const SALT_LABELS: Record<Salt, string> = {
  gypsum: "Gypsum (CaSO₄·2H₂O)",
  calciumChloride: "Calcium chloride (CaCl₂·2H₂O)",
  epsom: "Epsom salt (MgSO₄·7H₂O)",
  tableSalt: "Table salt (NaCl)",
  bakingSoda: "Baking soda (NaHCO₃)",
};

export const NO_SALTS: SaltAmounts = { gypsum: 0, calciumChloride: 0, epsom: 0, tableSalt: 0, bakingSoda: 0 };

/**
 * ppm of each ion from 1 g of the salt dissolved in 1 L, from molar masses
 * rather than hand-typed tables. Chalk is deliberately absent: it barely
 * dissolves in plain water, so a calculator that counts it overstates calcium
 * and bicarbonate.
 */
const PPM_PER_G_PER_L: Record<Salt, Partial<Profile>> = (() => {
  const fraction = (ion: number, salt: number) => (1000 * ion) / salt;
  const gypsum = M.Ca + SO4 + 2 * H2O;
  const calciumChloride = M.Ca + 2 * M.Cl + 2 * H2O;
  const epsom = M.Mg + SO4 + 7 * H2O;
  const tableSalt = M.Na + M.Cl;
  const bakingSoda = M.Na + HCO3;
  return {
    gypsum: { calcium: fraction(M.Ca, gypsum), sulfate: fraction(SO4, gypsum) },
    calciumChloride: { calcium: fraction(M.Ca, calciumChloride), chloride: fraction(2 * M.Cl, calciumChloride) },
    epsom: { magnesium: fraction(M.Mg, epsom), sulfate: fraction(SO4, epsom) },
    tableSalt: { sodium: fraction(M.Na, tableSalt), chloride: fraction(M.Cl, tableSalt) },
    bakingSoda: { sodium: fraction(M.Na, bakingSoda), bicarbonate: fraction(HCO3, bakingSoda) },
  };
})();

export function saltContribution(salt: Salt): Partial<Profile> {
  return { ...PPM_PER_G_PER_L[salt] };
}

export const LITRES_PER_GALLON = 3.785411784;
export const toLitres = (volume: number, unit: "gal" | "L") => (unit === "gal" ? volume * LITRES_PER_GALLON : volume);

/** The profile after dissolving `grams` of each salt into `litres` of `source`. */
export function applySalts(source: Profile, grams: SaltAmounts, litres: number): Profile {
  const result = { ...source };
  if (!(litres > 0)) return result;
  for (const salt of SALTS) {
    const gPerL = (grams[salt] || 0) / litres;
    for (const [ion, ppm] of Object.entries(PPM_PER_G_PER_L[salt]) as [Ion, number][]) {
      result[ion] += ppm * gPerL;
    }
  }
  return result;
}

// Sulfate and chloride drive how the beer tastes, so they are fitted hardest.
// Bicarbonate is fitted loosely and sodium tightly: the only bicarbonate salt
// here is baking soda, and chasing a high-alkalinity target (Dublin, Munich)
// with it alone drives sodium into harsh territory. Those targets are really
// reached with chalk or left to the dark malts; see needsChalk.
const WEIGHTS: Profile = { calcium: 1.5, magnesium: 1, sodium: 2, sulfate: 2, chloride: 2, bicarbonate: 0.1 };

/** Off by more than 10 ppm and 10%: worth flagging. */
export function isFar(actual: number, target: number): boolean {
  const diff = Math.abs(actual - target);
  return diff > 10 && diff > 0.1 * target;
}

export type Suggestion = {
  grams: SaltAmounts;
  /** Ions the source water already has too much of; salts can only add. */
  dilute: Ion[];
};

/**
 * Salt amounts that bring `source` closest to `target`: least squares on the
 * weighted ion gaps, with no negative amounts, solved by coordinate descent.
 * Five unknowns and a convex objective, so it converges quickly. Rounded to
 * 0.1 g, which is what a kitchen scale can weigh.
 */
export function suggestSalts(source: Profile, target: Profile, litres: number): Suggestion {
  const dilute = IONS.filter((ion) => source[ion] > target[ion] && isFar(source[ion], target[ion]));
  if (!(litres > 0)) return { grams: { ...NO_SALTS }, dilute };

  // Work in g/L; the gap each salt is trying to close is target − source, and
  // is never negative for the fit (an ion already too high wants nothing added).
  const gap = Object.fromEntries(IONS.map((ion) => [ion, Math.max(0, target[ion] - source[ion])])) as Profile;
  const x: Record<Salt, number> = { ...NO_SALTS };
  const added = (ion: Ion) => SALTS.reduce((sum, s) => sum + (PPM_PER_G_PER_L[s][ion] ?? 0) * x[s], 0);

  for (let round = 0; round < 500; round++) {
    let moved = 0;
    for (const salt of SALTS) {
      let gradient = 0;
      let curvature = 0;
      for (const [ion, ppm] of Object.entries(PPM_PER_G_PER_L[salt]) as [Ion, number][]) {
        gradient += WEIGHTS[ion] * ppm * (added(ion) - gap[ion]);
        curvature += WEIGHTS[ion] * ppm * ppm;
      }
      const next = Math.max(0, x[salt] - gradient / curvature);
      moved = Math.max(moved, Math.abs(next - x[salt]));
      x[salt] = next;
    }
    if (moved < 1e-9) break;
  }

  const grams = Object.fromEntries(
    SALTS.map((s) => [s, Math.round(x[s] * litres * 10) / 10]),
  ) as SaltAmounts;
  return { grams, dilute };
}

/**
 * True when the result is well short of the target's calcium or bicarbonate.
 * Chalk supplies both without the sulfate, chloride or sodium the other salts
 * bring, but it is left out of the suggestions because it barely dissolves
 * unless acid or CO₂ is added, so the UI says so instead.
 */
export function needsChalk(result: Profile, target: Profile): boolean {
  return (["calcium", "bicarbonate"] as const).some(
    (ion) => result[ion] < target[ion] && isFar(result[ion], target[ion]),
  );
}

/** Sulfate to chloride; null when there is no chloride to divide by. */
export function sulfateChlorideRatio(p: Profile): number | null {
  return p.chloride > 0 ? p.sulfate / p.chloride : null;
}

export function ratioBand(ratio: number | null): "malty" | "balanced" | "hoppy" | null {
  if (ratio == null) return null;
  if (ratio < 0.8) return "malty";
  if (ratio <= 1.5) return "balanced";
  return "hoppy";
}

/**
 * Residual alkalinity in ppm as CaCO₃ (Kolbach): alkalinity left over after
 * calcium and magnesium have offset it. Higher pushes mash pH up, which suits
 * dark malts; near zero or negative suits pale beers.
 */
export function residualAlkalinity(p: Profile): number {
  const alkalinity = (p.bicarbonate * 50) / 61;
  return alkalinity - (p.calcium / 1.4 + p.magnesium / 1.7);
}

export type TargetProfile = { id: string; name: string; group: "Style" | "Historic city"; profile: Profile };

const profile = (calcium: number, magnesium: number, sodium: number, sulfate: number, chloride: number, bicarbonate: number): Profile =>
  ({ calcium, magnesium, sodium, sulfate, chloride, bicarbonate });

/**
 * Values from Brewer's Friend, "Summary of Target Water Profiles"
 * (brewersfriend.com/brewing-water-target-profiles), as published there. That
 * page, like every other source, presents them as guidance: historic city
 * figures ignore whatever treatment the brewers of the day applied, and
 * published versions of the same city disagree. RO is pure water.
 */
export const TARGET_PROFILES: TargetProfile[] = [
  { id: "ro", name: "RO / distilled", group: "Style", profile: { ...RO_WATER } },
  { id: "balanced", name: "Balanced", group: "Style", profile: profile(80, 5, 25, 80, 75, 100) },
  { id: "light-hoppy", name: "Light colored and hoppy", group: "Style", profile: profile(75, 5, 10, 150, 50, 0) },
  { id: "light-malty", name: "Light colored and malty", group: "Style", profile: profile(60, 5, 10, 55, 95, 0) },
  { id: "pilsen", name: "Pilsen (light lager)", group: "Historic city", profile: profile(7, 3, 2, 5, 5, 25) },
  { id: "dublin", name: "Dublin (dry stout)", group: "Historic city", profile: profile(110, 4, 12, 53, 19, 280) },
  { id: "burton", name: "Burton on Trent", group: "Historic city", profile: profile(270, 41, 113, 720, 85, 270) },
  { id: "london", name: "London (porter, dark ales)", group: "Historic city", profile: profile(100, 5, 35, 50, 60, 265) },
  { id: "munich", name: "Munich (dark lager)", group: "Historic city", profile: profile(82, 20, 4, 16, 2, 320) },
  { id: "dortmund", name: "Dortmund", group: "Historic city", profile: profile(250, 20, 10, 300, 100, 340) },
  { id: "dusseldorf", name: "Düsseldorf (altbier)", group: "Historic city", profile: profile(90, 12, 45, 65, 82, 223) },
  { id: "edinburgh", name: "Edinburgh (Scottish ale)", group: "Historic city", profile: profile(100, 18, 20, 105, 45, 235) },
];
