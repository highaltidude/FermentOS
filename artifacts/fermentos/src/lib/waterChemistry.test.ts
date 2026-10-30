import { describe, it, expect } from "vitest";
import {
  IONS,
  NO_SALTS,
  RO_WATER,
  SALTS,
  TARGET_PROFILES,
  applySalts,
  needsChalk,
  ratioBand,
  residualAlkalinity,
  saltContribution,
  suggestSalts,
  sulfateChlorideRatio,
  toLitres,
  type Profile,
} from "./waterChemistry";

describe("saltContribution", () => {
  it("derives gypsum's ions from molar masses", () => {
    const gypsum = saltContribution("gypsum");
    expect(gypsum.calcium).toBeCloseTo(232.8, 1);
    expect(gypsum.sulfate).toBeCloseTo(557.9, 1);
  });

  it("splits table salt into sodium and chloride", () => {
    const salt = saltContribution("tableSalt");
    expect(salt.sodium).toBeCloseTo(393.4, 1);
    expect(salt.chloride).toBeCloseTo(606.6, 1);
  });
});

describe("applySalts", () => {
  it("adds each salt's ions in proportion to grams per litre", () => {
    const result = applySalts(RO_WATER, { ...NO_SALTS, gypsum: 2 }, 10);
    expect(result.calcium).toBeCloseTo(46.56, 1);
    expect(result.sulfate).toBeCloseTo(111.58, 1);
    expect(result.chloride).toBe(0);
  });

  it("leaves the water alone for a zero or missing volume", () => {
    expect(applySalts(RO_WATER, { ...NO_SALTS, gypsum: 2 }, 0)).toEqual(RO_WATER);
  });
});

describe("suggestSalts", () => {
  it("finds the additions behind a target reachable from RO", () => {
    const litres = 20;
    const used = { gypsum: 4, calciumChloride: 3, epsom: 1.5, tableSalt: 0.5, bakingSoda: 1 };
    const target = applySalts(RO_WATER, used, litres);

    const { grams, dilute } = suggestSalts(RO_WATER, target, litres);
    const result = applySalts(RO_WATER, grams, litres);
    for (const ion of IONS) expect(Math.abs(result[ion] - target[ion])).toBeLessThan(5);
    expect(dilute).toEqual([]);
  });

  it("never suggests a negative amount", () => {
    for (const { profile } of TARGET_PROFILES) {
      const { grams } = suggestSalts(RO_WATER, profile, 23);
      for (const salt of SALTS) expect(grams[salt]).toBeGreaterThanOrEqual(0);
    }
  });

  it("flags ions the source already has too much of", () => {
    const hard: Profile = { calcium: 150, magnesium: 10, sodium: 20, sulfate: 300, chloride: 20, bicarbonate: 200 };
    const pilsen = TARGET_PROFILES.find((p) => p.id === "pilsen")!.profile;
    const { grams, dilute } = suggestSalts(hard, pilsen, 20);
    expect(dilute).toEqual(expect.arrayContaining(["calcium", "sulfate", "bicarbonate"]));
    expect(Object.values(grams).every((g) => g === 0)).toBe(true);
  });

  it("adds nothing when the target equals the source", () => {
    const { grams } = suggestSalts(RO_WATER, RO_WATER, 20);
    expect(grams).toEqual(NO_SALTS);
  });

  it("does not chase high alkalinity with baking soda at sodium's expense", () => {
    const dublin = TARGET_PROFILES.find((p) => p.id === "dublin")!.profile;
    const litres = 19;
    const result = applySalts(RO_WATER, suggestSalts(RO_WATER, dublin, litres).grams, litres);
    expect(result.sodium).toBeLessThan(50);
    expect(needsChalk(result, dublin)).toBe(true);
  });
});

describe("needsChalk", () => {
  it("is false once a target is met", () => {
    const hoppy = TARGET_PROFILES.find((p) => p.id === "light-hoppy")!.profile;
    expect(needsChalk(hoppy, hoppy)).toBe(false);
  });

  it("is true when calcium or bicarbonate falls well short", () => {
    const target: Profile = { ...RO_WATER, calcium: 100, bicarbonate: 200 };
    expect(needsChalk({ ...target, calcium: 40 }, target)).toBe(true);
    expect(needsChalk({ ...target, bicarbonate: 60 }, target)).toBe(true);
  });
});

describe("derived values", () => {
  it("bands the sulfate to chloride ratio", () => {
    const water = (sulfate: number, chloride: number): Profile => ({ ...RO_WATER, sulfate, chloride });
    expect(sulfateChlorideRatio(water(150, 50))).toBe(3);
    expect(ratioBand(sulfateChlorideRatio(water(150, 50)))).toBe("hoppy");
    expect(ratioBand(sulfateChlorideRatio(water(80, 75)))).toBe("balanced");
    expect(ratioBand(sulfateChlorideRatio(water(55, 95)))).toBe("malty");
    expect(sulfateChlorideRatio(water(50, 0))).toBeNull();
    expect(ratioBand(null)).toBeNull();
  });

  it("computes residual alkalinity as CaCO3", () => {
    expect(residualAlkalinity({ ...RO_WATER, bicarbonate: 61 })).toBeCloseTo(50, 5);
    expect(residualAlkalinity({ ...RO_WATER, calcium: 70, magnesium: 17 })).toBeCloseTo(-60, 5);
  });

  it("converts gallons to litres", () => {
    expect(toLitres(5, "gal")).toBeCloseTo(18.93, 2);
    expect(toLitres(20, "L")).toBe(20);
  });
});
