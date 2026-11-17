import { describe, it, expect } from "vitest";
import { BrewLayoutSection } from "@workspace/api-client-react";
import { BREW_SECTION_INFO, DEFAULT_BREW_LAYOUT, moveSection } from "./brewLayout";

describe("moveSection", () => {
  const order = DEFAULT_BREW_LAYOUT.order;

  it("swaps a section with the one above or below", () => {
    expect(moveSection(order, "tasting", -1).slice(0, 3)).toEqual(["water", "tasting", "dryHops"]);
    expect(moveSection(order, "tasting", 1).slice(2, 4)).toEqual(["recipeAsBrewed", "tasting"]);
  });

  it("leaves the order alone at either end", () => {
    expect(moveSection(order, order[0], -1)).toBe(order);
    expect(moveSection(order, order[order.length - 1], 1)).toBe(order);
  });
});

describe("DEFAULT_BREW_LAYOUT", () => {
  it("lists every section, each with a label", () => {
    expect(DEFAULT_BREW_LAYOUT.order).toEqual(Object.values(BrewLayoutSection));
    for (const s of DEFAULT_BREW_LAYOUT.order) expect(BREW_SECTION_INFO[s].label).toBeTruthy();
  });
});
