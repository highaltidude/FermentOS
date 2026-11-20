/**
 * Reads a BeerXML 1.0 file — what BeerSmith, Brewfather, Brewer's Friend and
 * most other brewing software export — into recipe drafts, the same shape the
 * kit-sheet readers produce, so the import page reviews them the same way.
 *
 * BeerXML is always metric (kilograms, litres, °C, minutes). Amounts are
 * converted to the unit system the brewer uses; temperatures go to °F, as the
 * draft's hints are in °F; the batch size goes to gallons, the recipe column.
 *
 * A file holds one <RECIPE> or many under <RECIPES>. Tag names are matched
 * case-insensitively; some exporters write them in lower case.
 */

import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { KitSheetDraft, KitSheetDraftIngredient, KitSheetWarning, KitIngredientUse } from "./morebeerKitSheet.js";

export type BeerXmlUnits = "imperial" | "metric";

export type BeerXmlParseResult =
  | { ok: true; recipes: KitSheetDraft[] }
  | { ok: false; code: "not_xml" | "unreadable_xml" | "no_recipes" };

type Node = Record<string, unknown>;
type Step = NonNullable<KitSheetDraft["steps"]>[number];

const KG_PER_LB = 0.45359237;
const G_PER_OZ = 28.349523125;
const L_PER_GAL = 3.785411784;
const ML_PER_TSP = 4.92892159375;

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
const cToF = (c: number) => round((c * 9) / 5 + 32, 1);

// ── Reading values ───────────────────────────────────────────────────────────

/** A single element or a repeated one, as a list. */
function list(v: unknown): Node[] {
  if (v == null || v === "") return [];
  return (Array.isArray(v) ? v : [v]).filter((x): x is Node => typeof x === "object" && x !== null);
}

function text(node: Node, key: string): string | null {
  const v = node[key];
  if (v == null || typeof v === "object") return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** The leading number in a value; "8.5 SRM" and "1.052 SG" are common in the DISPLAY/EST fields. */
function num(node: Node, key: string): number | null {
  const s = text(node, key);
  if (s == null) return null;
  const m = /-?\d+(?:\.\d+)?/.exec(s);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** The first of several fields that has a number, e.g. EST_COLOR before COLOR. */
function firstNum(node: Node, ...keys: string[]): number | null {
  for (const k of keys) {
    const n = num(node, k);
    if (n != null) return n;
  }
  return null;
}

const bool = (node: Node, key: string) => text(node, key)?.toLowerCase() === "true";
const lower = (node: Node, key: string) => text(node, key)?.toLowerCase() ?? "";

/**
 * The first field holding a specific gravity. The display fields are
 * sometimes in Plato ("13.0 Plato"), which is skipped for the next field.
 */
function gravity(node: Node, ...keys: string[]): number | null {
  for (const k of keys) {
    const n = num(node, k);
    if (n != null && n > 0.98 && n < 1.2) return round(n, 3);
  }
  return null;
}

/** The repeated children of a wrapper element: <HOPS><HOP/>…</HOPS>. */
const children = (parent: Node, wrapper: string, child: string) => list(list(parent[wrapper])[0]?.[child]);

// ── Amounts ──────────────────────────────────────────────────────────────────

type Amount = { amount: number; unit: string };

/** A weight given in kilograms, as the brewer would write it. */
function weight(kg: number, units: BeerXmlUnits, small: boolean): Amount {
  if (units === "metric") {
    return small || kg < 1 ? { amount: round(kg * 1000, 1), unit: "g" } : { amount: round(kg, 2), unit: "kg" };
  }
  const lb = kg / KG_PER_LB;
  return small || lb < 1 ? { amount: round((kg * 1000) / G_PER_OZ, 2), unit: "oz" } : { amount: round(lb, 2), unit: "lbs" };
}

/** A volume given in litres. Misc additions are small: teaspoons or millilitres. */
function volume(l: number, units: BeerXmlUnits): Amount {
  const ml = l * 1000;
  return units === "metric" ? { amount: round(ml, 1), unit: "ml" } : { amount: round(ml / ML_PER_TSP, 2), unit: "tsp" };
}

// ── Ingredients ──────────────────────────────────────────────────────────────

type Built = Omit<KitSheetDraftIngredient, "variants" | "sourceText"> & {
  /** Only for building steps; not part of the draft ingredient. */
  firstWort?: boolean;
  contactDays?: number | null;
};

function fermentable(f: Node, recipeType: string, units: BeerXmlUnits): Built {
  const type = lower(f, "TYPE");
  const isExtract = type === "extract" || type === "dry extract";
  const isGrain = type === "grain";
  const allGrain = recipeType === "all grain";
  let use: KitIngredientUse;
  if (bool(f, "ADD_AFTER_BOIL")) use = "primary";
  else if (isGrain) use = allGrain || recipeType === "partial mash" ? "mash" : "steep";
  else use = "boil";
  const kg = num(f, "AMOUNT");
  const amt = kg != null && kg > 0 ? weight(kg, units, false) : null;
  return {
    name: text(f, "NAME") ?? "Fermentable",
    type: isGrain || isExtract ? "malt" : "adjunct",
    amount: amt?.amount ?? null,
    unit: amt?.unit ?? null,
    use,
    timingMinutes: null,
    notes: null,
  };
}

function hop(h: Node, boilMinutes: number | null, units: BeerXmlUnits): Built {
  const use = lower(h, "USE");
  let contactDays: number | null = null;
  const time = num(h, "TIME");
  const notes: string[] = [];
  const alpha = num(h, "ALPHA");
  if (alpha != null) notes.push(`${alpha}% AA`);
  const form = text(h, "FORM");
  if (form) notes.push(form.toLowerCase());

  let mapped: KitIngredientUse;
  let timing: number | null = null;
  if (use === "dry hop") {
    mapped = "dry_hop";
    // BeerXML gives how long the hops sit, not which day they go in.
    if (time != null && time > 0) {
      contactDays = round(time / 1440, 1);
      notes.push(`${contactDays} days in contact`);
    }
  } else if (use === "first wort") {
    mapped = "boil";
    timing = boilMinutes;
    notes.push("first wort");
  } else if (use === "aroma") {
    mapped = "whirlpool";
    timing = time != null ? Math.round(time) : null;
  } else if (use === "mash") {
    mapped = "mash";
  } else {
    mapped = "boil";
    timing = time != null ? Math.round(time) : null;
  }

  const kg = num(h, "AMOUNT");
  const amt = kg != null && kg > 0 ? weight(kg, units, true) : null;
  return {
    name: text(h, "NAME") ?? "Hop",
    type: "hop",
    amount: amt?.amount ?? null,
    unit: amt?.unit ?? null,
    use: mapped,
    timingMinutes: timing,
    notes: notes.length > 0 ? notes.join(", ") : null,
    firstWort: use === "first wort",
    contactDays,
  };
}

const MISC_USES: Record<string, KitIngredientUse> = {
  boil: "boil", mash: "mash", primary: "primary", secondary: "secondary", bottling: "packaging",
};

function misc(m: Node, units: BeerXmlUnits): Built {
  const use = MISC_USES[lower(m, "USE")] ?? "other";
  const time = num(m, "TIME");
  const raw = num(m, "AMOUNT");
  const amt = raw != null && raw > 0
    ? (bool(m, "AMOUNT_IS_WEIGHT") ? weight(raw, units, true) : volume(raw, units))
    : null;
  return {
    name: text(m, "NAME") ?? "Addition",
    type: lower(m, "TYPE") === "water agent" ? "water_agent" : "other",
    amount: amt?.amount ?? null,
    unit: amt?.unit ?? null,
    use,
    timingMinutes: use === "boil" && time != null ? Math.round(time) : null,
    notes: text(m, "USE_FOR"),
  };
}

function yeast(y: Node): Built {
  const lab = text(y, "LABORATORY");
  const id = text(y, "PRODUCT_ID");
  const name = text(y, "NAME") ?? "Yeast";
  const notes = [lab && id ? `${lab} ${id}` : lab ?? id, text(y, "FORM")?.toLowerCase()].filter(Boolean);
  return {
    name: lab && !name.toLowerCase().includes(lab.toLowerCase()) ? `${lab} ${name}` : name,
    type: "yeast",
    // BeerXML's yeast amount is a slurry volume or a weight, rarely what the
    // brewer buys; a packet is what every kit and recipe here uses.
    amount: 1,
    unit: "pkg",
    use: "primary",
    timingMinutes: null,
    notes: notes.length > 0 ? notes.join(", ") : null,
  };
}

// ── Addition steps ───────────────────────────────────────────────────────────

/** "0.75 oz Columbus", or the name alone when the file gives no amount. */
function describe(ing: Built): string {
  return ing.amount != null ? [ing.amount, ing.unit, ing.name].filter((p) => p != null && p !== "").join(" ") : ing.name;
}

const joinAll = (items: Built[]) => items.map(describe).join(", ");

/** Groups items by a key, keeping first-seen order within each group. */
function groupBy<K>(items: Built[], key: (i: Built) => K): Map<K, Built[]> {
  const out = new Map<K, Built[]>();
  for (const i of items) {
    const k = key(i);
    out.set(k, [...(out.get(k) ?? []), i]);
  }
  return out;
}

/**
 * Brew-day steps for the timed additions, so the step list reads as a
 * checklist: first-wort hops before the boil, boil additions by minutes
 * remaining, whirlpool additions after it, dry hops in fermentation. The
 * ingredients keep their use and timing too, which the boil timer runs from.
 */
function additionSteps(ingredients: Built[], boilStep: Step | null): Step[] {
  const firstWort = ingredients.filter((i) => i.firstWort);
  const boil = ingredients.filter((i) => i.use === "boil" && !i.firstWort && i.timingMinutes != null);
  const whirlpool = ingredients.filter((i) => i.use === "whirlpool");
  const dryHop = ingredients.filter((i) => i.use === "dry_hop");

  const steps: Step[] = [];
  if (firstWort.length > 0) {
    steps.push({ body: `First wort: add ${joinAll(firstWort)} to the kettle while lautering`, phase: "boil", durationMinutes: null });
  }
  if (boilStep) steps.push(boilStep);
  const byMinute = [...groupBy(boil, (i) => i.timingMinutes!)].sort((a, b) => b[0] - a[0]);
  for (const [minutes, items] of byMinute) {
    const when = minutes <= 0 ? "Flameout" : `${minutes} min`;
    steps.push({ body: `${when}: add ${joinAll(items)}`, phase: "boil", durationMinutes: null });
  }
  for (const [minutes, items] of groupBy(whirlpool, (i) => i.timingMinutes)) {
    const length = minutes != null && minutes > 0 ? ` for ${minutes} minutes` : "";
    steps.push({ body: `Whirlpool: add ${joinAll(items)}${length}`, phase: "boil", durationMinutes: minutes != null && minutes > 0 ? minutes : null });
  }
  for (const [days, items] of groupBy(dryHop, (i) => i.contactDays ?? null)) {
    const length = days != null ? ` for ${days} ${days === 1 ? "day" : "days"}` : "";
    steps.push({ body: `Dry hop: add ${joinAll(items)}${length}`, phase: "fermentation", durationMinutes: null });
  }
  return steps;
}

// ── Recipe ───────────────────────────────────────────────────────────────────

function mashStepNodes(recipe: Node): Node[] {
  const mash = list(recipe["MASH"])[0];
  return mash ? children(mash, "MASH_STEPS", "MASH_STEP") : [];
}

function mashSteps(nodes: Node[]): Step[] {
  return nodes.map((s) => {
    const temp = num(s, "STEP_TEMP");
    const minutes = num(s, "STEP_TIME");
    const parts = [text(s, "NAME") ?? "Mash step"];
    if (temp != null) parts.push(`${cToF(temp)}°F (${round(temp, 1)}°C)`);
    return {
      body: parts.length > 1 ? `${parts[0]}: ${parts.slice(1).join(" ")}` : parts[0]!,
      phase: "mash" as const,
      durationMinutes: minutes != null && minutes > 0 ? Math.round(minutes) : null,
    };
  });
}

function draftFor(recipe: Node, units: BeerXmlUnits): KitSheetDraft {
  const recipeType = lower(recipe, "TYPE");
  const boilMinutes = num(recipe, "BOIL_TIME");
  const batchLitres = num(recipe, "BATCH_SIZE");
  const style = list(recipe["STYLE"])[0];

  const yeasts = children(recipe, "YEASTS", "YEAST");
  const ingredients: Built[] = [
    ...children(recipe, "FERMENTABLES", "FERMENTABLE").map((f) => fermentable(f, recipeType, units)),
    ...children(recipe, "HOPS", "HOP").map((h) => hop(h, boilMinutes != null ? Math.round(boilMinutes) : null, units)),
    ...children(recipe, "MISCS", "MISC").map((m) => misc(m, units)),
    ...yeasts.map(yeast),
  ];

  const warnings: KitSheetWarning[] = [];
  ingredients.forEach((ing, i) => {
    if (ing.amount == null) {
      warnings.push({ code: "missing_amount", message: `${ing.name} has no amount in the file.`, ingredientIndex: i, sourceText: null });
    }
  });
  if (batchLitres == null || batchLitres <= 0) {
    warnings.push({ code: "assumed_batch_size", message: "The file gives no batch size; 5 gallons was assumed.", ingredientIndex: null, sourceText: null });
  }

  // The yeast's range is the fermentation range; the recipe's primary
  // temperature, when given, is the target inside it.
  const firstYeast = yeasts[0];
  const yeastMin = firstYeast ? num(firstYeast, "MIN_TEMPERATURE") : null;
  const yeastMax = firstYeast ? num(firstYeast, "MAX_TEMPERATURE") : null;
  const primaryTemp = num(recipe, "PRIMARY_TEMP");
  const stepNodes = mashStepNodes(recipe);
  const firstMashTemp = stepNodes[0] ? num(stepNodes[0], "STEP_TEMP") : null;

  const days = (key: string) => {
    const n = num(recipe, key);
    return n != null && n > 0 ? Math.round(n) : null;
  };

  const boilStep: Step | null = boilMinutes != null && boilMinutes > 0
    ? { body: `Boil for ${Math.round(boilMinutes)} minutes`, phase: "boil", durationMinutes: Math.round(boilMinutes) }
    : null;
  const steps = [...mashSteps(stepNodes), ...additionSteps(ingredients, boilStep)];

  const og = gravity(recipe, "EST_OG", "OG");
  const description = [text(recipe, "NOTES"), text(recipe, "BREWER") && `Brewer: ${text(recipe, "BREWER")}`]
    .filter(Boolean).join("\n\n") || null;
  const waterNames = children(recipe, "WATERS", "WATER").map((w) => text(w, "NAME")).filter(Boolean);
  const tips = [
    text(recipe, "TASTE_NOTES") && `Tasting notes: ${text(recipe, "TASTE_NOTES")}`,
    waterNames.length > 0 && `Water profile in the file (not imported): ${waterNames.join(", ")}.`,
  ].filter(Boolean).join("\n\n") || null;

  return {
    source: "beerxml",
    name: text(recipe, "NAME") ?? "Imported recipe",
    description,
    style: style ? text(style, "NAME") : null,
    finalGravity: gravity(recipe, "EST_FG", "FG"),
    efficiencyPercent: num(recipe, "EFFICIENCY"),
    steps,
    variants: null,
    batchSizeGallons: batchLitres != null && batchLitres > 0 ? round(batchLitres / L_PER_GAL, 2) : 5,
    batchSizeAssumed: batchLitres == null || batchLitres <= 0,
    stats: {
      originalGravityMin: og,
      originalGravityMax: og,
      ibu: firstNum(recipe, "IBU", "EST_IBU"),
      colorSrm: firstNum(recipe, "EST_COLOR", "COLOR"),
      abv: firstNum(recipe, "EST_ABV", "ABV"),
    },
    hints: {
      boilMinutes: boilMinutes != null ? Math.round(boilMinutes) : null,
      mashTempF: firstMashTemp != null ? cToF(firstMashTemp) : null,
      fermentTempMinF: yeastMin != null ? cToF(yeastMin) : null,
      fermentTempMaxF: yeastMax != null ? cToF(yeastMax) : null,
      fermentTempIdealF: primaryTemp != null ? cToF(primaryTemp) : null,
      primaryDays: days("PRIMARY_AGE"),
      secondaryDays: days("SECONDARY_AGE"),
      conditioningDays: days("AGE"),
    },
    suggestedYeasts: [],
    ingredients: ingredients.map(({ firstWort: _fw, contactDays: _cd, ...ing }) => ({ ...ing, variants: null, sourceText: "" })),
    tips,
    warnings,
  };
}

/** Every <RECIPE> in the file, wherever it sits. */
function findRecipes(doc: Node): Node[] {
  const recipes = list(doc["RECIPES"]).flatMap((r) => list(r["RECIPE"]));
  return recipes.length > 0 ? recipes : list(doc["RECIPE"]);
}

export function parseBeerXml(xml: string, units: BeerXmlUnits): BeerXmlParseResult {
  const body = xml.replace(/^﻿/, "").trim();
  if (!body.startsWith("<")) return { ok: false, code: "not_xml" };
  if (XMLValidator.validate(body) !== true) return { ok: false, code: "unreadable_xml" };

  const parser = new XMLParser({
    ignoreAttributes: true,
    // Keep every value a string; num() reads numbers itself, and a name like
    // "1056" must stay a name.
    parseTagValue: false,
    trimValues: true,
    transformTagName: (name) => name.toUpperCase(),
  });
  let doc: Node;
  try {
    doc = parser.parse(body) as Node;
  } catch {
    return { ok: false, code: "unreadable_xml" };
  }

  const recipes = findRecipes(doc);
  if (recipes.length === 0) return { ok: false, code: "no_recipes" };
  return { ok: true, recipes: recipes.map((r) => draftFor(r, units)) };
}
