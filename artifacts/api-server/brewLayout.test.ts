import { describe, it, expect } from "vitest";
import { SetBrewLayoutBody } from "@workspace/api-zod";
import {
  BREW_LAYOUT_SECTIONS,
  DEFAULT_BREW_LAYOUT,
  normalizeBrewLayout,
  parseBrewLayout,
} from "./src/lib/brewLayout";

describe("parseBrewLayout", () => {
  it("is the default with nothing saved or something unreadable saved", () => {
    expect(parseBrewLayout(null)).toEqual(DEFAULT_BREW_LAYOUT);
    expect(parseBrewLayout("not json")).toEqual(DEFAULT_BREW_LAYOUT);
    expect(parseBrewLayout('"a string"')).toEqual(DEFAULT_BREW_LAYOUT);
  });

  it("gives back a full layout unchanged", () => {
    const layout = { order: [...BREW_LAYOUT_SECTIONS].reverse(), hidden: ["heatingCooling"] };
    expect(parseBrewLayout(JSON.stringify(layout))).toEqual(layout);
  });
});

describe("normalizeBrewLayout", () => {
  it("drops unknown and repeated sections", () => {
    const { order, hidden } = normalizeBrewLayout({
      order: ["readings", "bogus", "readings", ...BREW_LAYOUT_SECTIONS],
      hidden: ["bogus", "tasting", "tasting"],
    });
    expect(order[0]).toBe("readings");
    expect(order).toHaveLength(BREW_LAYOUT_SECTIONS.length);
    expect(new Set(order).size).toBe(order.length);
    expect(hidden).toEqual(["tasting"]);
  });

  it("puts a missing section back after the one before it by default", () => {
    const order = BREW_LAYOUT_SECTIONS.filter((s) => s !== "sensors").reverse();
    const out = normalizeBrewLayout({ order, hidden: [] }).order;
    // "telemetry" comes before "sensors" by default.
    expect(out[out.indexOf("telemetry") + 1]).toBe("sensors");
  });

  it("puts a missing first section at the top", () => {
    const out = normalizeBrewLayout({ order: ["readings", "tasting"], hidden: [] }).order;
    expect(out[0]).toBe("water");
    expect(out).toHaveLength(BREW_LAYOUT_SECTIONS.length);
  });

  it("keeps the saved order of the sections it was given", () => {
    const out = normalizeBrewLayout({ order: ["telemetry", "tasting"], hidden: [] }).order;
    expect(out.indexOf("telemetry")).toBeLessThan(out.indexOf("tasting"));
  });
});

describe("SetBrewLayoutBody", () => {
  it("lists the same sections as the server", () => {
    for (const s of BREW_LAYOUT_SECTIONS) {
      expect(SetBrewLayoutBody.safeParse({ order: [s], hidden: [] }).success).toBe(true);
    }
  });

  it("rejects an unknown section", () => {
    expect(SetBrewLayoutBody.safeParse({ order: ["bogus"], hidden: [] }).success).toBe(false);
    expect(SetBrewLayoutBody.safeParse({ order: [] }).success).toBe(false);
  });
});
