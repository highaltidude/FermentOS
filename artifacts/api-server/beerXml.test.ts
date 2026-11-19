import { describe, it, expect } from "vitest";
import { parseBeerXml, type BeerXmlUnits } from "./src/lib/beerXml.js";
import type { KitSheetDraft } from "./src/lib/morebeerKitSheet.js";

// Shaped like a BeerSmith export: the standard fields plus the EST_/display
// extensions most programs add.
const ALL_GRAIN = `<?xml version="1.0" encoding="ISO-8859-1"?>
<RECIPES>
 <RECIPE>
  <NAME>Backyard Pale Ale</NAME>
  <VERSION>1</VERSION>
  <TYPE>All Grain</TYPE>
  <BREWER>Sam</BREWER>
  <BATCH_SIZE>18.9270589</BATCH_SIZE>
  <BOIL_TIME>60</BOIL_TIME>
  <EFFICIENCY>72</EFFICIENCY>
  <STYLE><NAME>American Pale Ale</NAME><CATEGORY>Pale American Ale</CATEGORY></STYLE>
  <FERMENTABLES>
   <FERMENTABLE><NAME>Pale Malt (2 Row) US</NAME><TYPE>Grain</TYPE><AMOUNT>4.5359237</AMOUNT></FERMENTABLE>
   <FERMENTABLE><NAME>Caramel/Crystal Malt - 40L</NAME><TYPE>Grain</TYPE><AMOUNT>0.3401943</AMOUNT></FERMENTABLE>
  </FERMENTABLES>
  <HOPS>
   <HOP><NAME>Magnum</NAME><ALPHA>12.0</ALPHA><AMOUNT>0.0141748</AMOUNT><USE>First Wort</USE><TIME>60</TIME><FORM>Pellet</FORM></HOP>
   <HOP><NAME>Cascade</NAME><ALPHA>5.5</ALPHA><AMOUNT>0.0283495</AMOUNT><USE>Boil</USE><TIME>10</TIME></HOP>
   <HOP><NAME>Citra</NAME><ALPHA>12</ALPHA><AMOUNT>0.0283495</AMOUNT><USE>Aroma</USE><TIME>20</TIME></HOP>
   <HOP><NAME>Mosaic</NAME><ALPHA>12</ALPHA><AMOUNT>0.0566990</AMOUNT><USE>Dry Hop</USE><TIME>4320</TIME></HOP>
  </HOPS>
  <MISCS>
   <MISC><NAME>Gypsum (Calcium Sulfate)</NAME><TYPE>Water Agent</TYPE><USE>Mash</USE><AMOUNT>0.005</AMOUNT><AMOUNT_IS_WEIGHT>TRUE</AMOUNT_IS_WEIGHT></MISC>
   <MISC><NAME>Whirlfloc Tablet</NAME><TYPE>Fining</TYPE><USE>Boil</USE><TIME>15</TIME><AMOUNT>0</AMOUNT></MISC>
  </MISCS>
  <YEASTS>
   <YEAST><NAME>Safale American</NAME><TYPE>Ale</TYPE><FORM>Dry</FORM><LABORATORY>DCL/Fermentis</LABORATORY><PRODUCT_ID>US-05</PRODUCT_ID><MIN_TEMPERATURE>15.56</MIN_TEMPERATURE><MAX_TEMPERATURE>23.89</MAX_TEMPERATURE></YEAST>
  </YEASTS>
  <WATERS><WATER><NAME>Burton On Trent, UK</NAME></WATER></WATERS>
  <MASH>
   <NAME>Single Infusion</NAME>
   <MASH_STEPS>
    <MASH_STEP><NAME>Mash In</NAME><TYPE>Infusion</TYPE><STEP_TEMP>66.6667</STEP_TEMP><STEP_TIME>60</STEP_TIME></MASH_STEP>
    <MASH_STEP><NAME>Mash Out</NAME><TYPE>Temperature</TYPE><STEP_TEMP>75.5556</STEP_TEMP><STEP_TIME>10</STEP_TIME></MASH_STEP>
   </MASH_STEPS>
  </MASH>
  <NOTES>A clean, hoppy session pale.</NOTES>
  <OG>1.050</OG>
  <FG>1.011</FG>
  <EST_OG>1.052 SG</EST_OG>
  <EST_FG>13.0 Plato</EST_FG>
  <EST_COLOR>7.4 SRM</EST_COLOR>
  <IBU>38.2 IBUs</IBU>
  <EST_ABV>5.1 %</EST_ABV>
  <PRIMARY_AGE>14</PRIMARY_AGE>
  <PRIMARY_TEMP>19.4444</PRIMARY_TEMP>
  <SECONDARY_AGE>0</SECONDARY_AGE>
  <AGE>14</AGE>
 </RECIPE>
</RECIPES>`;

const EXTRACT = `<RECIPES><RECIPE>
  <NAME>Easy Stout</NAME><TYPE>Extract</TYPE><BATCH_SIZE>19</BATCH_SIZE><BOIL_TIME>60</BOIL_TIME>
  <FERMENTABLES>
   <FERMENTABLE><NAME>Dark Liquid Extract</NAME><TYPE>Extract</TYPE><AMOUNT>3</AMOUNT></FERMENTABLE>
   <FERMENTABLE><NAME>Roasted Barley</NAME><TYPE>Grain</TYPE><AMOUNT>0.227</AMOUNT></FERMENTABLE>
   <FERMENTABLE><NAME>Corn Sugar</NAME><TYPE>Sugar</TYPE><AMOUNT>0.1</AMOUNT><ADD_AFTER_BOIL>TRUE</ADD_AFTER_BOIL></FERMENTABLE>
  </FERMENTABLES>
</RECIPE></RECIPES>`;

function drafts(xml: string, units: BeerXmlUnits = "imperial"): KitSheetDraft[] {
  const result = parseBeerXml(xml, units);
  if (!result.ok) throw new Error(`expected drafts, got ${result.code}`);
  return result.recipes;
}

const ing = (d: KitSheetDraft, name: string) => {
  const found = d.ingredients.find((i) => i.name.includes(name));
  if (!found) throw new Error(`no ingredient named ${name}`);
  return found;
};

describe("parseBeerXml: an all-grain recipe", () => {
  const [d] = drafts(ALL_GRAIN);

  it("reads the recipe's figures", () => {
    expect(d!.source).toBe("beerxml");
    expect(d!.name).toBe("Backyard Pale Ale");
    expect(d!.style).toBe("American Pale Ale");
    expect(d!.batchSizeGallons).toBe(5);
    expect(d!.batchSizeAssumed).toBe(false);
    expect(d!.efficiencyPercent).toBe(72);
    expect(d!.stats).toEqual({ originalGravityMin: 1.052, originalGravityMax: 1.052, ibu: 38.2, colorSrm: 7.4, abv: 5.1 });
  });

  it("skips a gravity given in Plato for the next field", () => {
    expect(d!.finalGravity).toBe(1.011);
  });

  it("converts temperatures and the schedule", () => {
    expect(d!.hints).toMatchObject({
      boilMinutes: 60, mashTempF: 152, fermentTempMinF: 60, fermentTempMaxF: 75, fermentTempIdealF: 67,
      primaryDays: 14, secondaryDays: null, conditioningDays: 14,
    });
  });

  it("mashes grain in pounds, ounces under a pound", () => {
    expect(ing(d!, "Pale Malt")).toMatchObject({ type: "malt", amount: 10, unit: "lbs", use: "mash" });
    expect(ing(d!, "Crystal")).toMatchObject({ amount: 12, unit: "oz", use: "mash" });
  });

  it("maps each hop use", () => {
    expect(ing(d!, "Magnum")).toMatchObject({ amount: 0.5, unit: "oz", use: "boil", timingMinutes: 60, notes: "12% AA, pellet, first wort" });
    expect(ing(d!, "Cascade")).toMatchObject({ use: "boil", timingMinutes: 10 });
    expect(ing(d!, "Citra")).toMatchObject({ use: "whirlpool", timingMinutes: 20 });
    // The day to add is the brewer's call; BeerXML only says how long.
    expect(ing(d!, "Mosaic")).toMatchObject({ amount: 2, use: "dry_hop", timingMinutes: null, notes: "12% AA, 3 days in contact" });
  });

  it("reads misc additions and flags one with no amount", () => {
    expect(ing(d!, "Gypsum")).toMatchObject({ type: "water_agent", use: "mash", amount: 0.18, unit: "oz" });
    expect(ing(d!, "Whirlfloc")).toMatchObject({ type: "other", use: "boil", timingMinutes: 15, amount: null });
    const index = d!.ingredients.findIndex((i) => i.name.includes("Whirlfloc"));
    expect(d!.warnings).toEqual([expect.objectContaining({ code: "missing_amount", ingredientIndex: index })]);
  });

  it("adds yeast as a packet named with its lab", () => {
    expect(ing(d!, "Safale")).toMatchObject({
      name: "DCL/Fermentis Safale American", type: "yeast", amount: 1, unit: "pkg", use: "primary", notes: "DCL/Fermentis US-05, dry",
    });
  });

  it("turns the mash schedule and boil into steps", () => {
    expect(d!.steps).toEqual([
      { body: "Mash In: 152°F (66.7°C)", phase: "mash", durationMinutes: 60 },
      { body: "Mash Out: 168°F (75.6°C)", phase: "mash", durationMinutes: 10 },
      { body: "Boil for 60 minutes", phase: "boil", durationMinutes: 60 },
    ]);
  });

  it("keeps notes, and names the water profile it doesn't import", () => {
    expect(d!.description).toBe("A clean, hoppy session pale.\n\nBrewer: Sam");
    expect(d!.tips).toBe("Water profile in the file (not imported): Burton On Trent, UK.");
  });

  it("uses grams and kilograms when the brewer works in metric", () => {
    const [m] = drafts(ALL_GRAIN, "metric");
    expect(ing(m!, "Pale Malt")).toMatchObject({ amount: 4.54, unit: "kg" });
    expect(ing(m!, "Crystal")).toMatchObject({ amount: 340.2, unit: "g" });
    expect(ing(m!, "Magnum")).toMatchObject({ amount: 14.2, unit: "g" });
    expect(ing(m!, "Gypsum")).toMatchObject({ amount: 5, unit: "g" });
  });
});

describe("parseBeerXml: an extract recipe", () => {
  const [d] = drafts(EXTRACT);

  it("boils extract, steeps grain, and adds post-boil sugar to the fermenter", () => {
    expect(ing(d!, "Extract")).toMatchObject({ type: "malt", use: "boil", amount: 6.61, unit: "lbs" });
    expect(ing(d!, "Roasted Barley")).toMatchObject({ type: "malt", use: "steep", amount: 8.01, unit: "oz" });
    expect(ing(d!, "Corn Sugar")).toMatchObject({ type: "adjunct", use: "primary" });
  });

  it("leaves out what the file doesn't give", () => {
    expect(d!.style).toBeNull();
    expect(d!.stats.originalGravityMin).toBeNull();
    expect(d!.hints.mashTempF).toBeNull();
    expect(d!.steps).toEqual([{ body: "Boil for 60 minutes", phase: "boil", durationMinutes: 60 }]);
  });
});

describe("parseBeerXml: files", () => {
  it("reads every recipe in a file, in order", () => {
    const xml = `<RECIPES><RECIPE><NAME>One</NAME><BATCH_SIZE>19</BATCH_SIZE></RECIPE><RECIPE><NAME>Two</NAME><BATCH_SIZE>19</BATCH_SIZE></RECIPE></RECIPES>`;
    expect(drafts(xml).map((d) => d.name)).toEqual(["One", "Two"]);
  });

  it("reads a lone <RECIPE> with lower-case tags", () => {
    const [d] = drafts(`<recipe><name>Lowercase</name><batch_size>19</batch_size></recipe>`);
    expect(d!.name).toBe("Lowercase");
  });

  it("assumes five gallons when the file has no batch size", () => {
    const [d] = drafts(`<RECIPE><NAME>No size</NAME></RECIPE>`);
    expect(d!.batchSizeGallons).toBe(5);
    expect(d!.warnings.map((w) => w.code)).toContain("assumed_batch_size");
  });

  it("refuses what isn't a BeerXML recipe file", () => {
    expect(parseBeerXml("%PDF-1.7 ...", "imperial")).toEqual({ ok: false, code: "not_xml" });
    expect(parseBeerXml("<RECIPES><RECIPE><NAME>Cut short", "imperial")).toEqual({ ok: false, code: "unreadable_xml" });
    expect(parseBeerXml("<EQUIPMENTS><EQUIPMENT><NAME>Pot</NAME></EQUIPMENT></EQUIPMENTS>", "imperial")).toEqual({ ok: false, code: "no_recipes" });
  });
});
