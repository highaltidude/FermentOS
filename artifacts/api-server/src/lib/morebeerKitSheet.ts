/**
 * Reads a MoreBeer kit sheet — the two-page PDF that ships with a recipe kit —
 * into a recipe draft.
 *
 * One sheet usually describes three versions of the same beer side by side
 * (LME, DME and all-grain fermentables) over a shared hop schedule, so the
 * draft is a single recipe whose ingredients are tagged with the versions they
 * belong to.
 *
 * The sheet is a designed layout, not a document: the order text comes out of
 * the PDF has little to do with where it sits on the page. Everything here
 * works from positions instead — headings are found by their text, and a line
 * belongs to the heading it sits under.
 *
 * Import-free on purpose, like boilTimer.ts, so it can be unit tested without
 * a database or a PDF library. services/pdfText.ts turns a PDF into the
 * PdfPage[] this takes.
 */

import type { RecipeVariant } from "./recipeVariants.js";

/** One run of text. x is its left edge, y its baseline measured from the top. */
export type PdfTextItem = { str: string; x: number; y: number; width: number; height: number };
export type PdfPage = { width: number; height: number; items: PdfTextItem[] };

export type KitIngredientType = "malt" | "hop" | "yeast" | "adjunct" | "water_agent" | "other";
export type KitIngredientUse =
  | "mash" | "steep" | "boil" | "dry_hop" | "whirlpool" | "primary" | "secondary" | "packaging" | "other";

export type KitSheetDraftIngredient = {
  name: string;
  type: KitIngredientType;
  amount: number | null;
  unit: string | null;
  use: KitIngredientUse | null;
  timingMinutes: number | null;
  notes: string | null;
  variants: RecipeVariant[] | null;
  sourceText: string;
};

export type KitSheetWarning = {
  code: "missing_amount" | "unparsed_line" | "use_from_tips" | "assumed_batch_size";
  message: string;
  ingredientIndex: number | null;
  sourceText: string | null;
};

export type KitSheetDraft = {
  source: "morebeer";
  name: string;
  variants: RecipeVariant[] | null;
  batchSizeGallons: number;
  batchSizeAssumed: boolean;
  stats: {
    originalGravityMin: number | null;
    originalGravityMax: number | null;
    ibu: number | null;
    colorSrm: number | null;
    abv: number | null;
  };
  hints: {
    boilMinutes: number | null;
    mashTempF: number | null;
    fermentTempMinF: number | null;
    fermentTempMaxF: number | null;
  };
  suggestedYeasts: { lab: string; name: string }[];
  ingredients: KitSheetDraftIngredient[];
  tips: string | null;
  warnings: KitSheetWarning[];
};

export type KitSheetParseResult =
  | { ok: true; draft: KitSheetDraft }
  | { ok: false; code: "no_text" | "unrecognized_sheet" };

/** MoreBeer's kits are five gallons; the sheet never says so. */
const DEFAULT_BATCH_GALLONS = 5;

// ── Text helpers ─────────────────────────────────────────────────────────────

function clean(s: string): string {
  return s
    .replace(/[®™]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BULLET = /^[•●▪■◦·]$/;
const INLINE_BULLET = /^[•●▪■◦·]\s+(.*)$/;

const SMALL_WORDS = new Set(["a", "an", "and", "de", "for", "in", "la", "of", "on", "the", "to", "with"]);
const ACRONYMS = new Set(["ipa", "dipa", "neipa", "apa", "esb", "ipl", "xpa", "ii", "iii", "iv"]);

/** Sheet titles are set in capitals; a recipe name shouldn't shout. */
function titleCase(s: string): string {
  if (/[a-z]/.test(s)) return s;
  return s
    .toLowerCase()
    .split(" ")
    .map((word, i) => {
      if (ACRONYMS.has(word)) return word.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function firstNumber(s: string): number | null {
  const m = /\d+(?:\.\d+)?/.exec(s);
  return m ? Number(m[0]) : null;
}

/** "1.070–74" is shorthand for 1.070 to 1.074. */
export function parseGravityRange(s: string): { min: number; max: number } | null {
  const m = /(\d\.\d{3})(?:\s*[–—-]\s*(\d?\.?\d{1,3}))?/.exec(s);
  if (!m) return null;
  const min = Number(m[1]);
  if (!m[2]) return { min, max: min };
  const max = m[2].includes(".") ? Number(m[2]) : Number(m[1]!.slice(0, m[1]!.length - m[2].length) + m[2]);
  return Number.isFinite(max) && max >= min ? { min, max } : { min, max: min };
}

// ── One line of an ingredient list ───────────────────────────────────────────

const UNIT_ALIASES: [RegExp, string][] = [
  [/^(lbs?|pounds?)$/i, "lbs"],
  [/^(oz|ounces?)$/i, "oz"],
  [/^kg$/i, "kg"],
  [/^(g|grams?)$/i, "g"],
  [/^tsp$/i, "tsp"],
  [/^tbsp$/i, "tbsp"],
  [/^(pkgs?|packs?|packets?)$/i, "pkg"],
  [/^(tablets?|tabs?|capsules?|each)$/i, "each"],
];

const AMOUNT_UNIT =
  /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\.\d+)\s*(lbs?|pounds?|oz|ounces?|kg|grams?|g|tsp|tbsp|pkgs?|packs?|packets?|tablets?|tabs?|capsules?|each)\b\.?\s+(.+)$/i;

function parseAmount(s: string): number {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = /^(\d+)\/(\d+)$/.exec(s);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return Number(s);
}

export type KitLine = {
  name: string;
  amount: number | null;
  unit: string | null;
  /** What follows the dash: "Boil last 45 min". */
  descriptor: string | null;
  /** "(Extract Only)" / "(All-Grain Only)". */
  only: "extract" | "all_grain" | null;
  /** The line defers to the recipe tips for how the ingredient is used. */
  seeTips: boolean;
};

/** `[amount unit] name [(qualifier)] [– descriptor]` */
export function parseKitLine(raw: string): KitLine {
  let text = clean(raw);
  let descriptor: string | null = null;

  // "2-Row" has a hyphen too, so the separator must have space around it.
  const dash = /\s+[–—-]\s+/.exec(text);
  if (dash) {
    descriptor = text.slice(dash.index + dash[0].length).trim() || null;
    text = text.slice(0, dash.index).trim();
  }

  let only: KitLine["only"] = null;
  const takeOnly = (s: string) =>
    s.replace(/\(\s*(extract|all[\s-]*grain)(?:\s+kits?)?\s+only\s*\)/i, (_m, which: string) => {
      only = /extract/i.test(which) ? "extract" : "all_grain";
      return "";
    });
  text = clean(takeOnly(text));
  if (descriptor) descriptor = clean(takeOnly(descriptor)) || null;

  const seeTips = /see\s+recipe\s+tips/i.test(`${text} ${descriptor ?? ""}`);
  if (seeTips) {
    text = clean(text.replace(/\(?\s*see\s+recipe\s+tips[^)]*\)?/i, ""));
    descriptor = descriptor ? clean(descriptor.replace(/\(?\s*see\s+recipe\s+tips[^)]*\)?/i, "")) || null : null;
  }

  let amount: number | null = null;
  let unit: string | null = null;
  let name = text;

  const withUnit = AMOUNT_UNIT.exec(text);
  const bareCount = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(text);
  if (withUnit) {
    amount = parseAmount(withUnit[1]!);
    unit = UNIT_ALIASES.find(([re]) => re.test(withUnit[2]!))?.[1] ?? withUnit[2]!.toLowerCase();
    name = withUnit[3]!;
  } else if (bareCount) {
    amount = Number(bareCount[1]);
    unit = "each";
    name = bareCount[2]!;
  }

  return { name: clean(name), amount, unit, descriptor, only, seeTips };
}

type UseReading = { use: KitIngredientUse | null; timingMinutes: number | null; notes: string | null };

/** Turn "Boil last 45 min" and friends into a use and a time. */
export function readUse(descriptor: string | null): UseReading {
  const d = descriptor?.trim();
  if (!d) return { use: null, timingMinutes: null, notes: null };

  const minutes = /(\d+)\s*min/i.exec(d);
  const n = minutes ? Number(minutes[1]) : null;

  if (/dry[\s-]*hop/i.test(d)) return { use: "dry_hop", timingMinutes: null, notes: d };
  // Flameout is a boil addition at zero minutes left, which is how the boil
  // timer already treats it. Whirlpool is kept for sheets that say so.
  if (/flame\s*out|knock\s*out/i.test(d)) return { use: "boil", timingMinutes: 0, notes: null };
  if (/whirlpool|hop\s*stand/i.test(d)) return { use: "whirlpool", timingMinutes: n, notes: n == null ? d : null };
  if (/first\s+wort/i.test(d)) return { use: "boil", timingMinutes: null, notes: d };
  if (n != null && /boil/i.test(d)) return { use: "boil", timingMinutes: n, notes: null };
  if (/mash/i.test(d)) return { use: "mash", timingMinutes: null, notes: d };
  if (/steep/i.test(d)) return { use: "steep", timingMinutes: null, notes: d };
  if (/boil/i.test(d)) return { use: "boil", timingMinutes: null, notes: d };
  if (n != null) return { use: "boil", timingMinutes: n, notes: d };
  if (/secondary/i.test(d)) return { use: "secondary", timingMinutes: null, notes: d };
  if (/bottl|packag|keg/i.test(d)) return { use: "packaging", timingMinutes: null, notes: d };
  if (/primary|ferment/i.test(d)) return { use: "primary", timingMinutes: null, notes: d };
  return { use: null, timingMinutes: null, notes: d };
}

const EXTRACT_LIKE = /extract|syrup|\blme\b|\bdme\b|sugar|honey|maltodextrin/i;

function additionType(name: string): KitIngredientType {
  if (/sugar|maltodextrin|lactose|honey|candi|molasses|syrup|dextrose|extract/i.test(name)) return "adjunct";
  if (/gypsum|calcium|chloride|sulfate|lactic|phosphoric|campden/i.test(name)) return "water_agent";
  return "other";
}

// ── Page geometry ────────────────────────────────────────────────────────────

/** Clean the text, drop exact repeats, and split a bullet fused to its line. */
function prepare(page: PdfPage): PdfTextItem[] {
  const seen = new Set<string>();
  const out: PdfTextItem[] = [];
  for (const raw of page.items) {
    const str = clean(raw.str);
    if (!str) continue;
    const key = `${str}|${Math.round(raw.x)}|${Math.round(raw.y)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const fused = INLINE_BULLET.exec(str);
    if (fused && fused[1]) {
      const bulletWidth = raw.height * 0.5;
      out.push({ ...raw, str: str.charAt(0), width: bulletWidth });
      out.push({ ...raw, str: fused[1], x: raw.x + bulletWidth * 1.8, width: Math.max(0, raw.width - bulletWidth * 1.8) });
    } else {
      out.push({ ...raw, str });
    }
  }
  return out;
}

/** Group items sharing a baseline, each row left to right, rows top to bottom. */
function rowsOf(items: PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: PdfTextItem[][] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0]!.y - item.y) < 2.5) row.push(item);
    else rows.push([item]);
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

type Entry = { text: string; x: number; y: number; lastY: number };
type Label = { text: string; x: number; y: number };

/**
 * Read a bulleted list out of a region. A bullet opens an entry; text running
 * on from it on the same line is the entry; a line with no bullet that sits
 * directly under an entry's text is that entry wrapping. Anything else is a
 * label ("SPECIALTY MALTS:").
 *
 * Entries come back column by column, each column top to bottom.
 */
function readList(items: PdfTextItem[]): { entries: Entry[]; labels: Label[] } {
  const entries: Entry[] = [];
  const loose: (Label & { height: number })[] = [];

  for (const row of rowsOf(items)) {
    let entry: Entry | null = null;
    let run: (Label & { height: number }) | null = null;
    let prevRight = Number.NEGATIVE_INFINITY;

    for (const item of row) {
      const adjacent = item.x - prevRight < 14;
      if (BULLET.test(item.str)) {
        entry = { text: "", x: Number.NaN, y: item.y, lastY: item.y };
        entries.push(entry);
        run = null;
      } else if (entry && adjacent) {
        if (!entry.text) entry.x = item.x;
        entry.text = clean(`${entry.text} ${item.str}`);
      } else if (run && adjacent) {
        run.text = clean(`${run.text} ${item.str}`);
        entry = null;
      } else {
        entry = null;
        run = { text: item.str, x: item.x, y: item.y, height: item.height };
        loose.push(run);
      }
      prevRight = item.x + item.width;
    }
  }

  const filled = entries.filter((e) => e.text);
  const labels: Label[] = [];
  for (const piece of loose.sort((a, b) => a.y - b.y)) {
    const parent = filled
      .filter((e) => Math.abs(e.x - piece.x) < 5 && piece.y > e.lastY && piece.y - e.lastY <= piece.height * 2.2)
      .sort((a, b) => b.lastY - a.lastY)[0];
    if (parent) {
      parent.text = clean(`${parent.text} ${piece.text}`);
      parent.lastY = piece.y;
    } else {
      labels.push({ text: piece.text, x: piece.x, y: piece.y });
    }
  }

  // Left edges more than a few points apart are different columns.
  const columnOf = new Map<number, number>();
  let column = 0;
  [...new Set(filled.map((e) => e.x))]
    .sort((a, b) => a - b)
    .forEach((x, i, xs) => {
      if (i > 0 && x - xs[i - 1]! > 12) column++;
      columnOf.set(x, column);
    });
  filled.sort((a, b) => columnOf.get(a.x)! - columnOf.get(b.x)! || a.y - b.y);

  return { entries: filled, labels };
}

// ── Headings ─────────────────────────────────────────────────────────────────

const KIT_HEADINGS: [RegExp, RecipeVariant][] = [
  [/^(lme|liquid(\s+malt)?\s+extract)(\s+kit)?$/i, "lme"],
  [/^(dme|dry(\s+malt)?\s+extract)(\s+kit)?$/i, "dme"],
  [/^all[\s–—-]*grain(\s+kit)?$/i, "all_grain"],
];
/** A sheet for a single version of a kit heads its one list with something like this. */
const GENERIC_FERMENTABLES = /^(extract kit|malt extracts?|fermentables|malts?|grains?|grain bill)$/i;
const HOPS_HEADING = /^hops?(\s+(schedule|additions))?$/i;
const ADDITIONS_HEADING = /^((other\s+)?additions|adjuncts|other ingredients)$/i;
const YEAST_HEADING = /^(suggested\s+yeasts?|yeasts?(\s+options)?)$/i;
const TIPS_HEADING = /^recipe tips$/i;

type KitColumn = { heading: PdfTextItem; variant: RecipeVariant | null };

function kitColumnFor(item: PdfTextItem): KitColumn | null {
  const kit = KIT_HEADINGS.find(([re]) => re.test(item.str));
  if (kit) return { heading: item, variant: kit[1] };
  if (GENERIC_FERMENTABLES.test(item.str)) return { heading: item, variant: null };
  return null;
}

// ── The parser ───────────────────────────────────────────────────────────────

type Pending = Omit<KitSheetDraftIngredient, "variants"> & {
  variants: RecipeVariant[] | null;
  warnings: Omit<KitSheetWarning, "ingredientIndex">[];
};

export function parseMorebeerKitSheet(rawPages: PdfPage[]): KitSheetParseResult {
  const pages = rawPages.map(prepare);
  if (pages.every((p) => p.length === 0)) return { ok: false, code: "no_text" };

  // The ingredient lists all sit on the page with the HOPS heading.
  const pageIndex = pages.findIndex((items) => items.some((i) => HOPS_HEADING.test(i.str)));
  if (pageIndex < 0) return { ok: false, code: "unrecognized_sheet" };
  const items = pages[pageIndex]!;
  const pageHeight = rawPages[pageIndex]!.height;
  const hopsHeading = items.find((i) => HOPS_HEADING.test(i.str))!;

  // Anything set about as large as HOPS is a section heading, recognised or
  // not, and ends the section above it.
  const headings = items.filter((i) => !BULLET.test(i.str) && i.height >= hopsHeading.height * 0.85);
  const bandBelow = (heading: PdfTextItem): PdfTextItem[] => {
    const next = headings.filter((h) => h.y > heading.y + 6).sort((a, b) => a.y - b.y)[0];
    const bottom = next ? next.y - next.height * 0.6 : pageHeight;
    return items.filter((i) => i.y > heading.y + 1 && i.y < bottom && !headings.includes(i));
  };

  const kitColumns = headings
    .map(kitColumnFor)
    .filter((c): c is KitColumn => c !== null)
    .sort((a, b) => a.heading.x - b.heading.x);
  const additionsHeading = headings.find((h) => ADDITIONS_HEADING.test(h.str));

  const named = kitColumns.map((c) => c.variant).filter((v): v is RecipeVariant => v !== null);
  const order: RecipeVariant[] = ["lme", "dme", "all_grain"];
  const sheetVariants = named.length > 1 ? order.filter((v) => named.includes(v)) : null;
  const extractVariants = sheetVariants?.filter((v) => v !== "all_grain") ?? [];

  /** Collapse a list naming every version of the sheet to "all of them". */
  const tidy = (variants: RecipeVariant[] | null): RecipeVariant[] | null => {
    if (!sheetVariants || !variants || variants.length === 0) return null;
    const kept = sheetVariants.filter((v) => variants.includes(v));
    return kept.length === 0 || kept.length === sheetVariants.length ? null : kept;
  };
  const onlyVariants = (only: KitLine["only"]): RecipeVariant[] | null => {
    if (!sheetVariants || !only) return null;
    return only === "extract" ? extractVariants : sheetVariants.filter((v) => v === "all_grain");
  };

  const warnings: KitSheetWarning[] = [];
  const pending: Pending[] = [];

  const missingAmount = (line: KitLine, sourceText: string): Pending["warnings"] =>
    line.amount == null
      ? [{ code: "missing_amount", message: `The sheet gives no amount for ${line.name}.`, sourceText }]
      : [];

  // ── Fermentables: one list per kit heading ──
  if (kitColumns.length > 0) {
    const top = kitColumns.reduce((a, c) => (c.heading.y < a.y ? c.heading : a), kitColumns[0]!.heading);
    const { entries, labels } = readList(bandBelow(top));
    const columnAt = (x: number) =>
      kitColumns.reduce((best, c) => (Math.abs(c.heading.x - x) < Math.abs(best.heading.x - x) ? c : best));

    for (const column of kitColumns) {
      const mine = entries.filter((e) => columnAt(e.x) === column);
      const myLabels = labels.filter((l) => columnAt(l.x) === column);
      const isExtractList =
        column.variant === "lme" || column.variant === "dme" ||
        (column.variant === null && mine.some((e) => EXTRACT_LIKE.test(e.text)));

      for (const entry of mine) {
        const line = parseKitLine(entry.text);
        if (!line.name) continue;
        const label = myLabels.filter((l) => l.y < entry.y).sort((a, b) => b.y - a.y)[0];
        const specialty = label ? /special|steep/i.test(label.text) : false;

        const stated = readUse(line.descriptor);
        const use: KitIngredientUse =
          stated.use ??
          (!isExtractList ? "mash" : !specialty && EXTRACT_LIKE.test(line.name) ? "boil" : "steep");

        pending.push({
          name: line.name,
          type: "malt",
          amount: line.amount,
          unit: line.unit,
          use,
          timingMinutes: stated.timingMinutes,
          notes: stated.notes,
          variants: tidy(onlyVariants(line.only) ?? (column.variant ? [column.variant] : null)),
          sourceText: entry.text,
          warnings: missingAmount(line, entry.text),
        });
      }
    }
  }
  const fermentableCount = pending.length;

  // The same line in two columns (the specialty malt under both extract kits)
  // is one ingredient that belongs to both.
  const merged: Pending[] = [];
  for (const row of pending) {
    const twin = merged.find(
      (m) =>
        m.variants !== null && row.variants !== null &&
        m.name.toLowerCase() === row.name.toLowerCase() &&
        m.amount === row.amount && m.unit === row.unit && m.use === row.use &&
        m.timingMinutes === row.timingMinutes && m.notes === row.notes,
    );
    if (twin) twin.variants = tidy([...twin.variants!, ...row.variants!]);
    else merged.push(row);
  }

  // ── Hops and other additions ──
  const readSection = (heading: PdfTextItem, type: (name: string) => KitIngredientType): number => {
    let count = 0;
    for (const entry of readList(bandBelow(heading)).entries) {
      const line = parseKitLine(entry.text);
      if (!line.name) continue;
      count++;
      const base = {
        name: line.name,
        type: type(line.name),
        amount: line.amount,
        unit: line.unit,
        sourceText: entry.text,
      };

      if (line.seeTips) {
        // "See recipe tips": on these sheets that is the whole-hop addition,
        // steeped with the specialty grains for extract and mashed for
        // all-grain. Surfaced as a warning so it gets checked against the tips.
        const note = { timingMinutes: null, notes: "See recipe tips" } as const;
        const warn = (how: string): Pending["warnings"] => [
          ...missingAmount(line, entry.text),
          {
            code: "use_from_tips",
            message: `The sheet points to the recipe tips for ${line.name}; assumed ${how}. Check it against the tips.`,
            sourceText: entry.text,
          },
        ];
        if (sheetVariants && extractVariants.length > 0) {
          merged.push({ ...base, ...note, use: "steep", variants: tidy(extractVariants), warnings: warn("steeped with the specialty grains") });
        }
        if (sheetVariants?.includes("all_grain")) {
          merged.push({ ...base, ...note, use: "mash", variants: tidy(["all_grain"]), warnings: warn("added to the mash") });
        }
        if (!sheetVariants) {
          merged.push({ ...base, ...note, use: null, variants: null, warnings: warn("nothing about how it is used") });
        }
        continue;
      }

      const stated = readUse(line.descriptor);
      merged.push({
        ...base,
        use: stated.use,
        timingMinutes: stated.timingMinutes,
        notes: stated.notes,
        variants: tidy(onlyVariants(line.only)),
        warnings: missingAmount(line, entry.text),
      });
    }
    return count;
  };

  const hopCount = readSection(hopsHeading, () => "hop");
  if (additionsHeading) readSection(additionsHeading, additionType);

  // ── Sections this parser has no rule for ──
  const firstKnownY = Math.min(hopsHeading.y, ...kitColumns.map((c) => c.heading.y));
  for (const heading of headings) {
    const known =
      heading === hopsHeading || heading === additionsHeading ||
      kitColumns.some((c) => c.heading === heading) ||
      YEAST_HEADING.test(heading.str) || TIPS_HEADING.test(heading.str);
    if (known || heading.y <= firstKnownY) continue;
    for (const entry of readList(bandBelow(heading)).entries) {
      warnings.push({
        code: "unparsed_line",
        message: `Not imported — listed under "${heading.str}", a section this importer does not read.`,
        ingredientIndex: null,
        sourceText: entry.text,
      });
    }
  }

  // ── Title: the large text above the ingredient lists ──
  const name = titleCase(
    clean(
      headings
        .filter((h) => h.y < firstKnownY - 6 && !YEAST_HEADING.test(h.str))
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((h) => h.str)
        .join(" "),
    ),
  );

  // Without a title, a fermentable and a hop this is not a kit sheet we can
  // read, and half a recipe is worse than none.
  if (!name || fermentableCount === 0 || hopCount === 0) return { ok: false, code: "unrecognized_sheet" };

  // ── Suggested yeasts: "Lab: Strain" lines under their heading ──
  const suggestedYeasts: { lab: string; name: string }[] = [];
  const yeastHeading = items.find((i) => YEAST_HEADING.test(i.str));
  if (yeastHeading) {
    const near = items.filter(
      (i) =>
        i !== yeastHeading && !BULLET.test(i.str) &&
        i.y > yeastHeading.y + 1 && i.y < yeastHeading.y + yeastHeading.height * 12 &&
        i.x > yeastHeading.x - 80 && i.x < yeastHeading.x + yeastHeading.width + 80,
    );
    // The list ends at the first gap wider than its own line spacing.
    let prevY = yeastHeading.y;
    let lineHeight = yeastHeading.height;
    for (const row of rowsOf(near)) {
      if (row[0]!.y - prevY > lineHeight * 2.5) break;
      prevY = row[0]!.y;
      lineHeight = Math.max(...row.map((i) => i.height));
      const m = /^([^:]{2,40}):\s*(.+)$/.exec(clean(row.map((i) => i.str).join(" ")));
      if (m) suggestedYeasts.push({ lab: m[1]!.trim(), name: m[2]!.trim() });
    }
  }

  // ── Stats and tips can be on any page ──
  const valueNear = (label: RegExp): string | null => {
    for (const page of pages) {
      for (const item of page) {
        const m = label.exec(item.str);
        if (!m) continue;
        const inline = item.str.slice(m[0].length);
        if (/\d/.test(inline)) return inline;
        const beside = page
          .filter((i) => i !== item && Math.abs(i.y - item.y) < 3 && i.x > item.x && /\d/.test(i.str))
          .sort((a, b) => a.x - b.x)[0];
        if (beside) return beside.str;
        const below = page
          .filter((i) => Math.abs(i.x - item.x) < 20 && i.y > item.y + 1 && i.y - item.y <= item.height * 2.2 && /\d/.test(i.str))
          .sort((a, b) => a.y - b.y)[0];
        if (below) return below.str;
      }
    }
    return null;
  };
  const numberNear = (label: RegExp): number | null => {
    const v = valueNear(label);
    return v == null ? null : firstNumber(v);
  };

  // Anchored on EST. so the blank "ACTUAL O.G." / "ACTUAL ABV %" boxes don't match.
  const og = parseGravityRange(valueNear(/^EST\.?\s*(?:Original Gravity|O\.?G\.?)\s*:?/i) ?? "");
  const stats = {
    originalGravityMin: og?.min ?? null,
    originalGravityMax: og?.max ?? null,
    ibu: numberNear(/^IBU(?:'?s)?\s*:?/i),
    colorSrm: numberNear(/^SRM\s*:?/i),
    abv: numberNear(/^EST\.?\s*ABV\s*%?\s*:?/i),
  };

  let tips: string | null = null;
  for (const page of pages) {
    const heading = page.find((i) => TIPS_HEADING.test(i.str));
    if (!heading) continue;
    const lines: string[] = [];
    let prevY = heading.y;
    for (const row of rowsOf(page.filter((i) => i.y > heading.y + 1))) {
      const first = row[0]!;
      // A row that starts elsewhere belongs to another column of the page.
      if (Math.abs(first.x - heading.x) > 8) continue;
      // The paragraph ends at the next heading or the first real gap.
      if (first.height >= heading.height * 0.8) break;
      if (first.y - prevY > Math.max(first.height * 2, heading.height * 1.2)) break;
      prevY = first.y;
      // Take only the text running on from the line's start, so a neighbouring
      // column on the same baseline is left out.
      const line: string[] = [];
      let prevRight = first.x;
      for (const item of row) {
        if (item.x - prevRight > 14) break;
        line.push(item.str);
        prevRight = item.x + item.width;
      }
      lines.push(line.join(" "));
    }
    tips = clean(lines.join(" ")) || null;
    break;
  }

  // ── Figures worth lifting out of the tips; the paragraph itself is kept whole ──
  const boilInTips = /(\d+)[\s-]*minute\s+boil/i.exec(tips ?? "");
  const mashInTips = /mash\s+temp(?:erature)?\s*(?:is|of|:)?\s*(\d{2,3})\s*°?\s*F/i.exec(tips ?? "");
  const fermentInTips = /ferment\w*\s+temperature[^.]*?(\d{2})\s*[–—-]\s*(\d{2})\s*°?\s*F/i.exec(tips ?? "");
  const boilTimes = merged.filter((i) => i.use === "boil" && i.timingMinutes != null).map((i) => i.timingMinutes!);
  const hints = {
    boilMinutes: boilInTips ? Number(boilInTips[1]) : boilTimes.length > 0 ? Math.max(...boilTimes) : null,
    mashTempF: mashInTips ? Number(mashInTips[1]) : null,
    fermentTempMinF: fermentInTips ? Number(fermentInTips[1]) : null,
    fermentTempMaxF: fermentInTips ? Number(fermentInTips[2]) : null,
  };

  // ── Batch size ──
  const allText = pages.flat().map((i) => i.str).join(" ");
  const gallons = /(\d+(?:\.\d+)?)[\s-]*gal(?:lon)?s?\b/i.exec(allText);
  const batchSizeGallons = gallons ? Number(gallons[1]) : DEFAULT_BATCH_GALLONS;
  if (!gallons) {
    warnings.push({
      code: "assumed_batch_size",
      message: `The sheet does not state a batch size; assumed ${DEFAULT_BATCH_GALLONS} gallons.`,
      ingredientIndex: null,
      sourceText: null,
    });
  }

  const ingredients = merged.map(({ warnings: own, ...ingredient }, index) => {
    for (const w of own) warnings.push({ ...w, ingredientIndex: index });
    return ingredient;
  });

  return {
    ok: true,
    draft: {
      source: "morebeer",
      name,
      variants: sheetVariants,
      batchSizeGallons,
      batchSizeAssumed: !gallons,
      stats,
      hints,
      suggestedYeasts,
      ingredients,
      tips,
      warnings,
    },
  };
}
