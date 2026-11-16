import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isNorthernBrewerSheet, parseNorthernBrewerKitSheet } from "./src/lib/northernBrewerKitSheet.js";
import { parseKitSheet } from "./src/lib/kitSheet.js";
import type { KitSheetDraft, PdfPage } from "./src/lib/morebeerKitSheet.js";

// The text of Northern Brewer's Bluegrass Benchmark extract kit instructions as
// unpdf reports it, captured once from the real PDF.
const fixture = (path: string): PdfPage[] => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const bluegrass = () => fixture("./fixtures/northernbrewer/bluegrass-benchmark.items.json");
const pliny = () => fixture("./fixtures/morebeer/pliny-the-elder.items.json");

function parsed(pages: PdfPage[]): KitSheetDraft {
  const result = parseNorthernBrewerKitSheet(pages);
  if (!result.ok) throw new Error(`expected a draft, got ${result.code}`);
  return result.draft;
}

const row = (i: KitSheetDraft["ingredients"][number]) =>
  [i.name, i.type, i.amount, i.unit, i.use, i.timingMinutes] as const;

describe("the Bluegrass Benchmark kit sheet", () => {
  const draft = parsed(bluegrass());

  it("reads the title, the blurb and the stats box", () => {
    expect(draft.source).toBe("northern_brewer");
    expect(draft.name).toBe("Bluegrass Benchmark");
    expect(draft.description).toMatch(/^Once a massively popular regional style.*Kentucky Common.*vintage forerunner\.$/);
    expect(draft.stats).toEqual({ originalGravityMin: 1.051, originalGravityMax: 1.051, ibu: 18, colorSrm: null, abv: 5.3 });
    expect(draft.variants).toBeNull();
  });

  it("reads every ingredient with its use and time", () => {
    expect(draft.ingredients.map(row)).toEqual([
      ["Briess Caramel 60L", "malt", 3, "oz", "steep", null],
      ["Briess Black Malt", "malt", 3, "oz", "steep", null],
      ["Gold Malt Syrup", "malt", 3.15, "lbs", "boil", null],
      ["Golden Light DME", "malt", 1, "lbs", "boil", null],
      // When it goes in is only said in the brew-day steps.
      ["Corn Syrup", "adjunct", 32, "fl oz", "boil", 0],
      ["Cluster", "hop", 0.5, "oz", "boil", 60],
      ["Cluster", "hop", 0.5, "oz", "boil", 15],
      ["Tettnang", "hop", 0.5, "oz", "boil", 0],
    ]);
    expect(draft.ingredients.every((i) => i.variants === null && i.notes === null)).toBe(true);
    expect(draft.ingredients[5]!.sourceText).toBe("0.5 oz Cluster 60 min");
  });

  it("reads the schedule, the boil and the fermentation temperature", () => {
    expect(draft.hints).toEqual({
      boilMinutes: 60,
      mashTempF: null,
      fermentTempMinF: 65,
      fermentTempMaxF: 70,
      primaryDays: 14,
      secondaryDays: 14,
      conditioningDays: 14,
    });
    expect(draft.batchSizeGallons).toBe(5);
    expect(draft.batchSizeAssumed).toBe(false);
  });

  it("lists the suggested yeasts, dry first", () => {
    expect(draft.suggestedYeasts).toEqual([
      { lab: "Fermentis", name: "Safale US-05" },
      { lab: "Omega Yeast", name: "OYL-004 West Coast Ale I" },
      { lab: "Imperial Yeast", name: "A07 Flagship" },
      { lab: "Wyeast", name: "1056 American Ale" },
    ]);
  });

  it("keeps the brew-day specifics as tips, and has nothing to warn about", () => {
    expect(draft.tips).toBe(
      "Steep for 30 min at 150° - 160°F. Priming: Corn sugar (dextrose) 2/3 cup in 16oz water; Table sugar (sucrose) 5/8 cup in 16oz water.",
    );
    expect(draft.warnings).toEqual([]);
  });
});

describe("a sheet missing what the brew-day steps say", () => {
  it("assumes the boil for an addition the steps never mention, and says so", () => {
    const pages = bluegrass();
    pages[1]!.items = pages[1]!.items.filter((i) => !/Corn Syrup/.test(i.str));
    const draft = parsed(pages);
    const corn = draft.ingredients.findIndex((i) => i.name === "Corn Syrup");
    expect(row(draft.ingredients[corn]!)).toEqual(["Corn Syrup", "adjunct", 32, "fl oz", "boil", null]);
    expect(draft.warnings).toEqual([expect.objectContaining({ code: "assumed_use", ingredientIndex: corn })]);
  });

  it("falls back to the first yeast's range for the fermentation temperature", () => {
    const pages = bluegrass();
    pages[1]!.items = pages[1]!.items.filter((i) => !/optimum|for this beer/i.test(i.str));
    expect(parsed(pages).hints).toMatchObject({ fermentTempMinF: 64, fermentTempMaxF: 74 });
  });
});

describe("telling the suppliers apart", () => {
  it("recognises Northern Brewer and leaves MoreBeer alone", () => {
    expect(isNorthernBrewerSheet(bluegrass())).toBe(true);
    expect(isNorthernBrewerSheet(pliny())).toBe(false);
  });

  it("parses each through the right reader", () => {
    const nb = parseKitSheet(bluegrass());
    const mb = parseKitSheet(pliny());
    expect(nb.ok && nb.draft.source).toBe("northern_brewer");
    expect(mb.ok && mb.draft.source).toBe("morebeer");
  });

  it("turns away what isn't a kit sheet", () => {
    const letter: PdfPage[] = [{
      width: 612, height: 792, items: [
        { str: "Northern Brewer order confirmation", x: 40, y: 60, width: 300, height: 14 },
        { str: "Thanks for your order.", x: 40, y: 80, width: 200, height: 9 },
      ],
    }];
    expect(parseKitSheet(letter)).toEqual({ ok: false, code: "unrecognized_sheet" });
    expect(parseKitSheet([{ width: 612, height: 792, items: [] }])).toEqual({ ok: false, code: "no_text" });
  });
});
