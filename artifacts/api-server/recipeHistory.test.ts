import { describe, it, expect } from "vitest";
import type { Recipe, RecipeIngredient, RecipeStep, RecipeSnapshot } from "@workspace/db";
import {
  buildRecipeSnapshot,
  diffRecipeSnapshots,
  nextVersionName,
  recipeBrewHistory,
  recipeFamily,
} from "./src/lib/recipeHistory.js";

const recipe = {
  id: 1, name: "Pale Ale", style: "APA", variants: null, parentRecipeId: null, batchSizeGallons: 5,
  originalGravity: 1.052, finalGravity: 1.012, abv: 5.2, ibu: 38, colorSrm: 6,
  estimatedBrewTimeMinutes: 240, efficiencyPercent: 72, caloriesPerServing: 170, notes: null,
  fermentTempMin: 64, fermentTempMax: 70, fermentTempIdeal: 67,
  conditionTempMin: null, conditionTempMax: null, conditionTempIdeal: null,
  daysPlanned: null, daysBrewing: null, daysFermenting: null, daysConditioning: null, daysPackaged: null,
  createdAt: new Date(), updatedAt: new Date(),
} satisfies Recipe;

let nextId = 100;
function ing(over: Partial<RecipeIngredient>): RecipeIngredient {
  return {
    id: nextId++, recipeId: 1, name: "Cascade", type: "hop", amount: 1, unit: "oz", use: "boil",
    timingMinutes: 60, dryHopDay: null, notes: null, variants: null, ...over,
  };
}
function step(over: Partial<RecipeStep>): RecipeStep {
  return { id: nextId++, recipeId: 1, position: 1, phase: "mash", body: "Mash at 152°F", durationMinutes: 60, ...over };
}

const snap = (ingredients: RecipeIngredient[] = [], steps: RecipeStep[] = [], over: Partial<Recipe> = {}) =>
  buildRecipeSnapshot({ ...recipe, ...over }, ingredients, steps, null, new Date("2026-10-01T00:00:00Z"));

describe("buildRecipeSnapshot", () => {
  it("keeps only the brewed version's ingredients and drops row ids", () => {
    const s = buildRecipeSnapshot(
      { ...recipe, variants: ["lme", "all_grain"] },
      [
        ing({ name: "Pale LME", type: "malt", variants: ["lme"] }),
        ing({ name: "2-Row", type: "malt", variants: ["all_grain"] }),
        ing({ name: "Cascade" }),
      ],
      [step({ position: 2, body: "Boil" }), step({ position: 1 })],
      "all_grain",
    );
    expect(s.variant).toBe("all_grain");
    expect(s.ingredients.map((i) => i.name)).toEqual(["2-Row", "Cascade"]);
    expect(s.ingredients[0]).not.toHaveProperty("id");
    expect(s.ingredients[0]).not.toHaveProperty("variants");
    expect(s.steps.map((x) => x.body)).toEqual(["Mash at 152°F", "Boil"]);
    expect(s.steps[0]).not.toHaveProperty("id");
  });
});

describe("diffRecipeSnapshots", () => {
  it("finds nothing between identical versions", () => {
    const a = snap([ing({})], [step({})]);
    const b = snap([ing({})], [step({})]);
    expect(diffRecipeSnapshots(a, b)).toEqual([]);
  });

  it("reports header field changes", () => {
    const changes = diffRecipeSnapshots(snap(), snap([], [], { originalGravity: 1.056, notes: "" }));
    expect(changes).toEqual([{ kind: "field", field: "originalGravity", from: 1.052, to: 1.056 }]);
  });

  it("reports ingredients added, removed and changed", () => {
    const before = snap([ing({ name: "Cascade", amount: 1 }), ing({ name: "Centennial", timingMinutes: 15 })]);
    const after = snap([ing({ name: "Cascade", amount: 1.5 }), ing({ name: "Citra", use: "dry_hop", timingMinutes: null, dryHopDay: 3 })]);
    const changes = diffRecipeSnapshots(before, after);
    expect(changes.map((c) => c.kind)).toEqual(["ingredient_changed", "ingredient_added", "ingredient_removed"]);
    expect(changes[0]).toMatchObject({ ingredient: { amount: 1.5 }, previousIngredient: { amount: 1 } });
    expect(changes[1]).toMatchObject({ ingredient: { name: "Citra", dryHopDay: 3 } });
    expect(changes[2]).toMatchObject({ ingredient: { name: "Centennial" } });
  });

  it("pairs the same hop at several timings with itself", () => {
    const before = snap([ing({ timingMinutes: 60 }), ing({ timingMinutes: 15 })]);
    const retimed = snap([ing({ timingMinutes: 60 }), ing({ timingMinutes: 10 })]);
    expect(diffRecipeSnapshots(before, retimed)).toEqual([
      expect.objectContaining({
        kind: "ingredient_changed",
        ingredient: expect.objectContaining({ timingMinutes: 10 }),
        previousIngredient: expect.objectContaining({ timingMinutes: 15 }),
      }),
    ]);
    // Dropping the 60 minute addition is a removal, not a change to both.
    const dropped = snap([ing({ timingMinutes: 15 })]);
    expect(diffRecipeSnapshots(before, dropped)).toEqual([
      expect.objectContaining({ kind: "ingredient_removed", ingredient: expect.objectContaining({ timingMinutes: 60 }) }),
    ]);
  });

  it("ignores a change in name case or unit case", () => {
    expect(diffRecipeSnapshots(snap([ing({ name: "Cascade", unit: "oz" })]), snap([ing({ name: "cascade ", unit: "OZ" })]))).toEqual([]);
  });

  it("reports steps added, removed and retimed, but not reordered", () => {
    const before = snap([], [step({ position: 1 }), step({ position: 2, phase: "boil", body: "Boil", durationMinutes: 60 })]);
    const reordered = snap([], [step({ position: 1, phase: "boil", body: "Boil", durationMinutes: 60 }), step({ position: 2 })]);
    expect(diffRecipeSnapshots(before, reordered)).toEqual([]);

    const after = snap([], [step({ position: 1, durationMinutes: 75 }), step({ position: 2, phase: "packaging", body: "Bottle" })]);
    expect(diffRecipeSnapshots(before, after).map((c) => c.kind)).toEqual(["step_changed", "step_added", "step_removed"]);
  });
});

describe("recipeBrewHistory", () => {
  const s1 = snap([ing({ amount: 1 })]);
  const s2 = snap([ing({ amount: 2 })]);
  it("compares each brew with the recorded one before it, newest first", () => {
    const { entries, latestSnapshot } = recipeBrewHistory([
      { id: 3, brewDate: "2026-09-01", recipeVariant: null, overallScore: 8, recipeSnapshot: s2 },
      { id: 1, brewDate: "2026-01-01", recipeVariant: null, overallScore: null, recipeSnapshot: null },
      { id: 2, brewDate: "2026-05-01", recipeVariant: null, overallScore: 7, recipeSnapshot: s1 },
    ]);
    expect(entries.map((e) => e.id)).toEqual([3, 2, 1]);
    expect(entries[0]!.changes).toHaveLength(1);
    expect(entries[1]).toMatchObject({ recorded: true, changes: null });
    expect(entries[2]).toMatchObject({ recorded: false, changes: null });
    expect(latestSnapshot).toBe(s2);
  });

  it("has no latest snapshot when nothing was recorded", () => {
    const old: RecipeSnapshot | null = null;
    expect(recipeBrewHistory([{ id: 1, brewDate: "2026-01-01", recipeVariant: null, overallScore: null, recipeSnapshot: old }]).latestSnapshot).toBeNull();
  });

  it("compares a brew only with an earlier brew of the same version", () => {
    const lme = { ...snap([ing({ name: "Light LME", type: "malt", amount: 6, unit: "lb", use: "boil" })]), variant: "lme" as const };
    const grain = { ...snap([ing({ name: "2-Row", type: "malt", amount: 9, unit: "lb", use: "mash" })]), variant: "all_grain" as const };
    const grain2 = { ...grain, ingredients: [{ ...grain.ingredients[0]!, amount: 10 }] };
    const { entries, latestSnapshot } = recipeBrewHistory([
      { id: 1, brewDate: "2026-01-01", recipeVariant: "lme", overallScore: null, recipeSnapshot: lme },
      { id: 2, brewDate: "2026-02-01", recipeVariant: "all_grain", overallScore: null, recipeSnapshot: grain },
      { id: 3, brewDate: "2026-03-01", recipeVariant: "all_grain", overallScore: null, recipeSnapshot: grain2 },
    ]);
    expect(entries[2]).toMatchObject({ id: 1, changes: null });
    expect(entries[1]).toMatchObject({ id: 2, changes: null });
    expect(entries[0]!.changes).toEqual([expect.objectContaining({ kind: "ingredient_changed" })]);
    expect(latestSnapshot).toBe(grain2);
  });
});

describe("recipeFamily", () => {
  const rows = [
    { id: 1, parentRecipeId: null },
    { id: 2, parentRecipeId: 1 },
    { id: 3, parentRecipeId: 2 },
    { id: 4, parentRecipeId: 1 },
    { id: 5, parentRecipeId: null },
  ];
  it("finds the original and every fork from any member", () => {
    expect(recipeFamily(rows, 1)).toEqual([1, 2, 4, 3]);
    expect(recipeFamily(rows, 3)).toEqual([1, 2, 4, 3]);
  });
  it("is just the recipe when it has no relatives or isn't known", () => {
    expect(recipeFamily(rows, 5)).toEqual([5]);
    expect(recipeFamily(rows, 99)).toEqual([99]);
  });
  it("treats a fork whose parent is gone as an original", () => {
    expect(recipeFamily([{ id: 7, parentRecipeId: 6 }, { id: 8, parentRecipeId: 7 }], 8)).toEqual([7, 8]);
  });
  it("survives a parent loop", () => {
    expect(recipeFamily([{ id: 1, parentRecipeId: 2 }, { id: 2, parentRecipeId: 1 }], 1).sort()).toEqual([1, 2]);
  });
});

describe("nextVersionName", () => {
  it("numbers versions", () => {
    expect(nextVersionName("Pale Ale")).toBe("Pale Ale v2");
    expect(nextVersionName("Pale Ale v2")).toBe("Pale Ale v3");
    expect(nextVersionName(" Pale Ale V9 ")).toBe("Pale Ale v10");
  });
});
