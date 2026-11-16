import { describe, it, expect } from "vitest";
import type { RecipeWater } from "@workspace/api-client-react";
import { additions, fromLitres, presetFor, scaleWater, waterFromCalculator } from "./recipeWater";
import { NO_SALTS, TARGET_PROFILES } from "./waterChemistry";

const burton = TARGET_PROFILES.find((t) => t.id === "burton")!;

const saved = (over: Partial<RecipeWater> = {}): RecipeWater => ({
  target: { presetId: "burton", name: "Burton", profile: { ...burton.profile } },
  salts: { gypsum: 4, calciumChloride: 1, epsom: 0, tableSalt: 0, bakingSoda: 0.5 },
  volumeLitres: 30,
  ...over,
});

describe("waterFromCalculator", () => {
  it("names a preset target and keeps its ions", () => {
    const w = waterFromCalculator({ targetId: "burton", target: burton.profile, salts: { ...NO_SALTS, gypsum: 4.04 }, litres: 28.3906 });
    expect(w).toEqual({
      target: { presetId: "burton", name: burton.name, profile: burton.profile },
      salts: { ...NO_SALTS, gypsum: 4 },
      volumeLitres: 28.39,
    });
  });

  it("calls anything else custom", () => {
    const profile = { ...burton.profile, sulfate: 300 };
    expect(waterFromCalculator({ targetId: "custom", target: profile, salts: NO_SALTS, litres: 20 })?.target)
      .toEqual({ presetId: null, name: "Custom", profile });
  });

  it("is nothing without a volume", () => {
    expect(waterFromCalculator({ targetId: "burton", target: burton.profile, salts: NO_SALTS, litres: 0 })).toBeNull();
  });
});

describe("presetFor", () => {
  it("reselects the preset the water was saved with", () => {
    expect(presetFor(saved())).toBe("burton");
  });

  it("falls back to custom when the saved ions no longer match the preset", () => {
    expect(presetFor(saved({ target: { presetId: "burton", name: "Burton", profile: { ...burton.profile, sulfate: 1 } } }))).toBe("custom");
    expect(presetFor(saved({ target: { presetId: null, name: "Custom", profile: { ...burton.profile } } }))).toBe("custom");
  });
});

describe("scaleWater", () => {
  it("scales the salts and volume with the batch", () => {
    const w = scaleWater(saved(), 1.5);
    expect(w.salts).toEqual({ gypsum: 6, calciumChloride: 1.5, epsom: 0, tableSalt: 0, bakingSoda: 0.8 });
    expect(w.volumeLitres).toBe(45);
    expect(w.target).toEqual(saved().target);
  });

  it("leaves the water alone at the recipe's own size or a nonsense factor", () => {
    expect(scaleWater(saved(), 1)).toEqual(saved());
    expect(scaleWater(saved(), Number.NaN)).toEqual(saved());
  });
});

describe("additions", () => {
  it("lists what to add, largest first", () => {
    expect(additions(saved())).toEqual([
      { salt: "gypsum", grams: 4 },
      { salt: "calciumChloride", grams: 1 },
      { salt: "bakingSoda", grams: 0.5 },
    ]);
  });
});

describe("fromLitres", () => {
  it("shows litres in the brewer's unit", () => {
    expect(fromLitres(28.39, "gal")).toBe(7.5);
    expect(fromLitres(28.39, "L")).toBe(28.4);
  });
});
