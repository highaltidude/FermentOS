import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseMorebeerKitSheet,
  parseKitLine,
  parseGravityRange,
  readUse,
  type PdfPage,
  type PdfTextItem,
  type KitSheetDraft,
} from "./src/lib/morebeerKitSheet.js";
import { ingredientsForVariant } from "./src/lib/recipeVariants.js";

// The text of MoreBeer's Pliny the Elder sheet (KIT774–776) as unpdf reports
// it: every run of text with its position. Captured once from the real PDF so
// the test needs neither the PDF nor a PDF library.
const pliny = (): PdfPage[] =>
  JSON.parse(readFileSync(new URL("./fixtures/morebeer/pliny-the-elder.items.json", import.meta.url), "utf8"));

function parsed(pages: PdfPage[]): KitSheetDraft {
  const result = parseMorebeerKitSheet(pages);
  if (!result.ok) throw new Error(`expected a draft, got ${result.code}`);
  return result.draft;
}

const row = (i: KitSheetDraft["ingredients"][number]) =>
  [i.name, i.type, i.amount, i.unit, i.use, i.timingMinutes, i.variants] as const;

describe("the Pliny the Elder kit sheet", () => {
  const draft = parsed(pliny());

  it("reads the title, the three versions and the stats", () => {
    expect(draft.name).toBe("Russian River's Pliny the Elder Double IPA");
    expect(draft.variants).toEqual(["lme", "dme", "all_grain"]);
    expect(draft.stats).toEqual({
      originalGravityMin: 1.07,
      originalGravityMax: 1.074,
      ibu: 100,
      colorSrm: 10,
      abv: 8,
    });
  });

  it("assumes five gallons, and says so", () => {
    expect(draft.batchSizeGallons).toBe(5);
    expect(draft.batchSizeAssumed).toBe(true);
    expect(draft.warnings.map((w) => w.code)).toContain("assumed_batch_size");
  });

  it("lists every suggested yeast", () => {
    expect(draft.suggestedYeasts).toEqual([
      { lab: "White Labs", name: "WLP001 California" },
      { lab: "Wyeast", name: "1056 American" },
      { lab: "Imperial", name: "A07 Flagship" },
      { lab: "Omega", name: "West Coast Ale I" },
      { lab: "CellarScience Dry", name: "CALI" },
      { lab: "Fermentis Dry", name: "US-05 American" },
    ]);
  });

  it("tags each fermentable with the versions it belongs to", () => {
    expect(draft.ingredients.filter((i) => i.type === "malt").map(row)).toEqual([
      ["Ultralight Liquid Extract", "malt", 9, "lbs", "boil", null, ["lme"]],
      ["Light Dry Extract", "malt", 8, "oz", "boil", null, ["lme"]],
      // Under SPECIALTY MALTS in both extract columns: one row, steeped.
      ["Crystal 40°L", "malt", 6, "oz", "steep", null, ["lme", "dme"]],
      ["Light Dry Extract", "malt", 7.5, "lbs", "boil", null, ["dme"]],
      ["2-Row", "malt", 13, "lbs", "mash", null, ["all_grain"]],
      ["Carapils", "malt", 1, "lbs", "mash", null, ["all_grain"]],
      ["Crystal 40°L", "malt", 6, "oz", "mash", null, ["all_grain"]],
    ]);
  });

  it("reads the hop schedule, wrapped dry-hop lines included", () => {
    expect(draft.ingredients.filter((i) => i.type === "hop").map(row)).toEqual([
      ["Whole Cascade", "hop", 2, "oz", "steep", null, ["lme", "dme"]],
      ["Whole Cascade", "hop", 2, "oz", "mash", null, ["all_grain"]],
      ["Magnum", "hop", 2, "oz", "boil", 90, null],
      ["Simcoe", "hop", 1, "oz", "boil", 45, null],
      ["Columbus", "hop", 1, "oz", "boil", 30, null],
      ["Centennial", "hop", 2, "oz", "boil", 0, null],
      ["Simcoe", "hop", 1, "oz", "boil", 0, null],
      ["Columbus", "hop", 3, "oz", "dry_hop", null, null],
      ["Centennial", "hop", 1, "oz", "dry_hop", null, null],
      ["Simcoe", "hop", 1, "oz", "dry_hop", null, null],
    ]);
    const dryHop = draft.ingredients.find((i) => i.use === "dry_hop")!;
    expect(dryHop.notes).toBe("Dry hops, added post fermentation 3–7 days before packaging");
  });

  it("reads the other additions, including the extract-only one", () => {
    const others = draft.ingredients.filter((i) => i.type !== "malt" && i.type !== "hop");
    expect(others.map(row)).toEqual([
      ["Maltodextrin", "adjunct", 8, "oz", "boil", 60, ["lme", "dme"]],
      ["Corn Sugar", "adjunct", 1, "lbs", "boil", 10, null],
      ["Clarifier", "other", null, null, "boil", 5, null],
    ]);
  });

  it("gives each version only its own ingredients", () => {
    expect(draft.ingredients).toHaveLength(20);
    const count = (v: string) => ingredientsForVariant(draft.ingredients, v).length;
    expect([count("lme"), count("dme"), count("all_grain")]).toEqual([15, 14, 14]);
    expect(ingredientsForVariant(draft.ingredients, "all_grain").map((i) => i.name)).not.toContain("Maltodextrin");
  });

  it("flags what it could not read outright", () => {
    const byCode = (code: string) => draft.warnings.filter((w) => w.code === code);
    const clarifier = byCode("missing_amount");
    expect(clarifier).toHaveLength(1);
    expect(draft.ingredients[clarifier[0]!.ingredientIndex!]!.name).toBe("Clarifier");
    expect(clarifier[0]!.sourceText).toBe("Clarifier – Boil last 5 min");

    const cascade = byCode("use_from_tips");
    expect(cascade.map((w) => draft.ingredients[w.ingredientIndex!]!.use)).toEqual(["steep", "mash"]);
    expect(byCode("unparsed_line")).toEqual([]);
  });

  it("keeps the tips whole and lifts the figures out of them", () => {
    expect(draft.tips).toMatch(/^For the extract version, add the whole hops/);
    expect(draft.tips).toMatch(/allow 3–7 days of contact time before packaging\.$/);
    // The scorecard beside the tips shares baselines with it; none of it leaks in.
    expect(draft.tips).not.toMatch(/APPEARANCE|AROMA|TASTE/);
    expect(draft.hints).toEqual({ boilMinutes: 90, mashTempF: 151, fermentTempMinF: 66, fermentTempMaxF: 68 });
  });

  it("does not depend on the order text comes out of the PDF", () => {
    const shuffled = pliny().map((page) => ({
      ...page,
      // Deterministic scramble: reverse, then interleave the two halves.
      items: [...page.items].reverse().sort((a, b) => ((a.x * 7 + a.y * 13) % 17) - ((b.x * 7 + b.y * 13) % 17)),
    }));
    expect(parsed(shuffled)).toEqual(draft);
  });
});

// ── Synthetic sheets ─────────────────────────────────────────────────────────

/** Lay text out the way the real sheet does: a heading, then bulleted lines under it. */
function sheet(sections: { heading: string; x: number; y: number; lines: string[]; inlineBullets?: boolean }[]): PdfPage[] {
  const items: PdfTextItem[] = [{ str: "SOME BREWERY'S HOUSE PALE ALE", x: 40, y: 100, width: 300, height: 30 }];
  for (const s of sections) {
    items.push({ str: s.heading, x: s.x, y: s.y, width: 60, height: 18 });
    s.lines.forEach((line, i) => {
      const y = s.y + 15 + i * 14;
      if (s.inlineBullets) items.push({ str: `• ${line}`, x: s.x - 20, y, width: 120, height: 10 });
      else if (line.endsWith(":")) items.push({ str: line, x: s.x - 20, y, width: 60, height: 10 });
      else {
        items.push({ str: "•", x: s.x - 20, y, width: 5, height: 10 });
        items.push({ str: line, x: s.x - 11, y, width: 100, height: 10 });
      }
    });
  }
  return [{ width: 612, height: 792, items }];
}

describe("other sheet shapes", () => {
  it("reads a single-version sheet as an ordinary recipe", () => {
    const draft = parsed(
      sheet([
        { heading: "ALL-GRAIN KIT", x: 60, y: 200, lines: ["10 lbs 2-Row", "SPECIALTY MALTS:", "1 lb Crystal 15°L"] },
        { heading: "HOPS", x: 60, y: 300, lines: ["1 oz Cascade – Boil 60 min", "1 oz Cascade – Whirlpool 20 min"] },
      ]),
    );
    expect(draft.variants).toBeNull();
    expect(draft.ingredients.map(row)).toEqual([
      ["2-Row", "malt", 10, "lbs", "mash", null, null],
      ["Crystal 15°L", "malt", 1, "lbs", "mash", null, null],
      ["Cascade", "hop", 1, "oz", "boil", 60, null],
      ["Cascade", "hop", 1, "oz", "whirlpool", 20, null],
    ]);
  });

  it("reads an extract-only sheet with two versions", () => {
    const draft = parsed(
      sheet([
        { heading: "LME KIT", x: 60, y: 200, lines: ["6 lbs Light Liquid Extract", "SPECIALTY MALTS:", "8 oz Crystal 60°L"] },
        { heading: "DME KIT", x: 220, y: 200, lines: ["5 lbs Light Dry Extract", "SPECIALTY MALTS:", "8 oz Crystal 60°L"] },
        { heading: "HOPS", x: 60, y: 300, lines: ["1 oz Cascade – Boil 60 min"] },
      ]),
    );
    expect(draft.variants).toEqual(["lme", "dme"]);
    expect(draft.ingredients.map(row)).toEqual([
      ["Light Liquid Extract", "malt", 6, "lbs", "boil", null, ["lme"]],
      // In every version of this sheet, so it carries no version list.
      ["Crystal 60°L", "malt", 8, "oz", "steep", null, null],
      ["Light Dry Extract", "malt", 5, "lbs", "boil", null, ["dme"]],
      ["Cascade", "hop", 1, "oz", "boil", 60, null],
    ]);
  });

  it("leaves out a line for a version the sheet doesn't have", () => {
    const draft = parsed(
      sheet([
        { heading: "LME KIT", x: 60, y: 200, lines: ["6 lbs Light Liquid Extract", "1 lb Rice Hulls (All-Grain Only)"] },
        { heading: "DME KIT", x: 220, y: 200, lines: ["5 lbs Light Dry Extract"] },
        { heading: "HOPS", x: 60, y: 300, lines: ["1 oz Cascade – Boil 60 min"] },
      ]),
    );
    expect(draft.ingredients.map((i) => i.name)).not.toContain("Rice Hulls");
    expect(draft.warnings.filter((w) => w.code === "unparsed_line").map((w) => w.sourceText)).toEqual(["1 lb Rice Hulls (All-Grain Only)"]);
  });

  it("copes with a bullet fused to its line", () => {
    const draft = parsed(
      sheet([
        { heading: "ALL-GRAIN KIT", x: 60, y: 200, lines: ["10 lbs 2-Row"], inlineBullets: true },
        { heading: "HOPS", x: 60, y: 300, lines: ["1 oz Cascade – Boil 60 min"], inlineBullets: true },
      ]),
    );
    expect(draft.ingredients.map((i) => i.name)).toEqual(["2-Row", "Cascade"]);
  });

  it("reports lines under a section it has no rule for instead of dropping them", () => {
    const draft = parsed(
      sheet([
        { heading: "ALL-GRAIN KIT", x: 60, y: 200, lines: ["10 lbs 2-Row"] },
        { heading: "HOPS", x: 60, y: 300, lines: ["1 oz Cascade – Boil 60 min"] },
        { heading: "WATER TREATMENT", x: 60, y: 400, lines: ["1 tsp Gypsum"] },
      ]),
    );
    expect(draft.ingredients).toHaveLength(2);
    expect(draft.warnings.filter((w) => w.code === "unparsed_line").map((w) => w.sourceText)).toEqual(["1 tsp Gypsum"]);
  });
});

describe("what is not a kit sheet", () => {
  it("is no_text when the PDF has no text layer", () => {
    expect(parseMorebeerKitSheet([{ width: 612, height: 792, items: [] }])).toEqual({ ok: false, code: "no_text" });
    expect(parseMorebeerKitSheet([])).toEqual({ ok: false, code: "no_text" });
  });

  it("is unrecognized for an unrelated document", () => {
    const invoice: PdfPage[] = [{
      width: 612, height: 792,
      items: [
        { str: "INVOICE", x: 40, y: 80, width: 80, height: 24 },
        { str: "Amount due: $42.00", x: 40, y: 120, width: 120, height: 10 },
      ],
    }];
    expect(parseMorebeerKitSheet(invoice)).toEqual({ ok: false, code: "unrecognized_sheet" });
  });

  it("is unrecognized, not half a recipe, when the fermentables are missing", () => {
    const hopsOnly = sheet([{ heading: "HOPS", x: 60, y: 300, lines: ["1 oz Cascade – Boil 60 min"] }]);
    expect(parseMorebeerKitSheet(hopsOnly)).toEqual({ ok: false, code: "unrecognized_sheet" });
  });
});

describe("parseKitLine", () => {
  it("splits amount, unit, name and descriptor", () => {
    expect(parseKitLine("1 oz Simcoe® – Boil last 45 min")).toEqual({
      name: "Simcoe", amount: 1, unit: "oz", descriptor: "Boil last 45 min", only: null, seeTips: false,
    });
  });

  it("normalises units and reads fractions", () => {
    expect(parseKitLine("1 lb Carapils")).toMatchObject({ amount: 1, unit: "lbs", name: "Carapils" });
    expect(parseKitLine("7.5 lbs Light Dry Extract")).toMatchObject({ amount: 7.5, unit: "lbs" });
    expect(parseKitLine("1/2 oz Irish Moss")).toMatchObject({ amount: 0.5, unit: "oz", name: "Irish Moss" });
    expect(parseKitLine("1 1/2 lbs Honey")).toMatchObject({ amount: 1.5, unit: "lbs", name: "Honey" });
    expect(parseKitLine("1 Whirlfloc Tablet")).toMatchObject({ amount: 1, unit: "each", name: "Whirlfloc Tablet" });
  });

  it("does not mistake the hyphen in a malt name for the separator", () => {
    expect(parseKitLine("13 lbs 2-Row")).toMatchObject({ amount: 13, unit: "lbs", name: "2-Row", descriptor: null });
  });

  it("leaves the amount empty when the sheet gives none", () => {
    expect(parseKitLine("Clarifier – Boil last 5 min")).toMatchObject({ name: "Clarifier", amount: null, unit: null });
  });

  it("reads the version qualifier and the pointer to the tips", () => {
    expect(parseKitLine("8 oz Maltodextrin (Extract Only) – Boil for 60 min")).toMatchObject({
      name: "Maltodextrin", only: "extract", descriptor: "Boil for 60 min",
    });
    expect(parseKitLine("1 lb Rice Hulls (All-Grain Only)")).toMatchObject({ name: "Rice Hulls", only: "all_grain" });
    expect(parseKitLine("2 oz Whole Cascade – (see recipe tips pg. 2)")).toMatchObject({
      name: "Whole Cascade", seeTips: true, descriptor: null,
    });
  });
});

describe("readUse", () => {
  it.each([
    ["Boil 90 min", "boil", 90],
    ["Boil last 45 min", "boil", 45],
    ["added in last 10 min of boil", "boil", 10],
    ["Add at flameout/0 minutes", "boil", 0],
    ["Whirlpool 20 min", "whirlpool", 20],
    ["Dry hops, added post fermentation 3–7 days before packaging", "dry_hop", null],
    ["Add to the mash", "mash", null],
  ])("%s", (descriptor, use, timingMinutes) => {
    expect(readUse(descriptor)).toMatchObject({ use, timingMinutes });
  });

  it("keeps a descriptor it cannot classify as a note", () => {
    expect(readUse("Something unusual")).toEqual({ use: null, timingMinutes: null, notes: "Something unusual" });
    expect(readUse(null)).toEqual({ use: null, timingMinutes: null, notes: null });
  });
});

describe("parseGravityRange", () => {
  it("expands the shorthand upper bound", () => {
    expect(parseGravityRange("1.070–74")).toEqual({ min: 1.07, max: 1.074 });
    expect(parseGravityRange("1.048-1.052")).toEqual({ min: 1.048, max: 1.052 });
    expect(parseGravityRange("1.055")).toEqual({ min: 1.055, max: 1.055 });
    expect(parseGravityRange("n/a")).toBeNull();
  });
});
