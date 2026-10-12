import { describe, it, expect } from "vitest";
import {
  appliesToVariant,
  ingredientsForVariant,
  isMultiVariant,
  normalizeIngredientVariants,
  normalizeRecipeVariants,
  resolveSessionVariant,
} from "./src/lib/recipeVariants.js";

const ALL = ["lme", "dme", "all_grain"] as const;

describe("which version an ingredient belongs to", () => {
  it("treats an ingredient with no list as part of every version", () => {
    expect(appliesToVariant(null, "lme")).toBe(true);
    expect(appliesToVariant([], "all_grain")).toBe(true);
    expect(appliesToVariant(undefined, "dme")).toBe(true);
  });

  it("matches only the listed versions", () => {
    expect(appliesToVariant(["lme", "dme"], "dme")).toBe(true);
    expect(appliesToVariant(["lme", "dme"], "all_grain")).toBe(false);
  });

  it("shows everything when no version is chosen", () => {
    expect(appliesToVariant(["lme"], null)).toBe(true);
  });

  it("filters a list, keeping its order", () => {
    const ingredients = [
      { name: "LME", variants: ["lme"] },
      { name: "Magnum", variants: null },
      { name: "2-Row", variants: ["all_grain"] },
      { name: "Maltodextrin", variants: ["lme", "dme"] },
    ];
    expect(ingredientsForVariant(ingredients, "dme").map((i) => i.name)).toEqual(["Magnum", "Maltodextrin"]);
    expect(ingredientsForVariant(ingredients, null)).toHaveLength(4);
  });
});

describe("which version a session is read as", () => {
  it("is null for an ordinary recipe, whatever the session says", () => {
    expect(resolveSessionVariant(null, "lme")).toBeNull();
    expect(resolveSessionVariant([], null)).toBeNull();
    expect(isMultiVariant(null)).toBe(false);
  });

  it("uses the session's version when the recipe has it", () => {
    expect(resolveSessionVariant(ALL, "all_grain")).toBe("all_grain");
  });

  it("falls back to the recipe's first version rather than showing all of them", () => {
    expect(resolveSessionVariant(ALL, null)).toBe("lme");
    expect(resolveSessionVariant(["dme", "all_grain"], "lme")).toBe("dme");
  });
});

describe("tidying an ingredient's version list", () => {
  it("stores nothing for 'every version'", () => {
    expect(normalizeIngredientVariants(ALL, null)).toEqual({ ok: true, variants: null });
    expect(normalizeIngredientVariants(ALL, [])).toEqual({ ok: true, variants: null });
    expect(normalizeIngredientVariants(ALL, ["all_grain", "lme", "dme"])).toEqual({ ok: true, variants: null });
  });

  it("orders and de-duplicates", () => {
    expect(normalizeIngredientVariants(ALL, ["dme", "lme", "dme"])).toEqual({ ok: true, variants: ["lme", "dme"] });
  });

  it("rejects a version the recipe does not have", () => {
    expect(normalizeIngredientVariants(["lme", "dme"], ["all_grain"])).toEqual({ ok: false });
    expect(normalizeIngredientVariants(null, ["lme"])).toEqual({ ok: false });
  });
});

describe("tidying a recipe's version list", () => {
  it("orders, de-duplicates and treats fewer than two as no versions at all", () => {
    expect(normalizeRecipeVariants(["all_grain", "lme", "lme"])).toEqual(["lme", "all_grain"]);
    expect(normalizeRecipeVariants(["dme", "dme"])).toBeNull();
    expect(normalizeRecipeVariants([])).toBeNull();
    expect(normalizeRecipeVariants(null)).toBeNull();
  });
});
