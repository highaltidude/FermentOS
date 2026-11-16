/**
 * Reads a Northern Brewer kit instruction sheet — the two-page PDF that ships
 * with each of their recipe kits — into a recipe draft.
 *
 * Page one holds the recipe: a title, a stats box (O.G., ABV, IBU and the
 * brew-time schedule), the kit inventory in headed lists, and the suggested
 * yeasts. Page two is the brew-day walkthrough, which is the only place the
 * sheet says when the non-hop additions go in and how long the boil is.
 *
 * Northern Brewer sells extract and all-grain versions of a kit as separate
 * products with separate sheets, so a sheet is always a single recipe.
 *
 * Import-free apart from the shared text helpers, so it can be unit tested
 * without a database or a PDF library.
 */

import {
  DEFAULT_BATCH_GALLONS,
  additionType,
  clean,
  parseKitLine,
  prepare,
  readUse,
  rowsOf,
  titleCase,
  type KitIngredientType,
  type KitIngredientUse,
  type KitSheetDraftIngredient,
  type KitSheetParseResult,
  type KitSheetWarning,
  type PdfPage,
  type PdfTextItem,
} from "./morebeerKitSheet.js";

/** True when the text reads like one of Northern Brewer's sheets. */
export function isNorthernBrewerSheet(pages: PdfPage[]): boolean {
  const strs = pages.flatMap((p) => p.items.map((i) => clean(i.str)));
  if (strs.some((s) => /northern\s*brewer/i.test(s))) return true;
  return strs.some((s) => /^kit inventory$/i.test(s)) && strs.some((s) => /^(premium\s+)?hops$/i.test(s));
}

type Section =
  | { kind: "ingredients"; type: KitIngredientType | null; use: KitIngredientUse | null; fromSteps: boolean }
  | { kind: "yeast" };

/** The inventory's list headings, and what the lines under each are. */
const SECTIONS: [RegExp, Section][] = [
  [/^(steeping|specialty|speciality)\s+grains?$/i, { kind: "ingredients", type: "malt", use: "steep", fromSteps: false }],
  [/^(base\s+grains?|mash(\s+ingredients)?|grains?|grain\s+bill|malts?)$/i, { kind: "ingredients", type: "malt", use: "mash", fromSteps: false }],
  // Extract goes in before the boil starts; no timing, as on MoreBeer imports.
  [/^(malt\s+extracts?|extracts?)$/i, { kind: "ingredients", type: "malt", use: "boil", fromSteps: false }],
  [/^other\s+fermentables?$/i, { kind: "ingredients", type: null, use: null, fromSteps: true }],
  [/^(premium\s+)?hops?$/i, { kind: "ingredients", type: "hop", use: "boil", fromSteps: false }],
  [/^yeasts?$/i, { kind: "yeast" }],
];

/** A heading the importer doesn't know, still read for ingredients. */
const UNKNOWN_SECTION: Section = { kind: "ingredients", type: null, use: null, fromSteps: true };

/** A hop's time sits in its own column: "60 min", "Dry Hop", "Flameout". */
const TIME_CELL = /^(\d+\s*min(?:ute)?s?|dry[\s-]*hop.*|flame\s*out|knock\s*out|whirlpool.*|hop\s*stand.*|first\s+wort.*)$/i;

const YEAST_LABS =
  /^(fermentis|omega(?:\s+yeast)?|imperial(?:\s+yeast)?|wyeast|white\s+labs|lallemand|lalbrew|mangrove\s+jack'?s|escarpment(?:\s+labs)?|danstar|muntons|gigayeast|bootleg\s+biology|inland\s+island|propagate\s+lab)\s+(.+)$/i;

const isUpper = (s: string) => /[A-Z]/.test(s) && !/[a-z]/.test(s);

type Pending = Omit<KitSheetDraftIngredient, "variants"> & { warnings: Omit<KitSheetWarning, "ingredientIndex">[] };

export function parseNorthernBrewerKitSheet(rawPages: PdfPage[]): KitSheetParseResult {
  const pages = rawPages.map(prepare);
  if (pages.every((p) => p.length === 0)) return { ok: false, code: "no_text" };

  // The recipe page is the one with the inventory's headings.
  const isSection = (i: PdfTextItem) => SECTIONS.some(([re]) => re.test(i.str));
  const pageIndex = pages.findIndex((items) => items.some(isSection));
  if (pageIndex < 0) return { ok: false, code: "unrecognized_sheet" };
  const items = pages[pageIndex]!;
  const page = rawPages[pageIndex]!;

  // List headings are set larger than the lines under them; the black banners
  // ("KIT INVENTORY", "BEFORE BREW DAY") are capitals at about body size and
  // run across columns.
  const body = median(items.map((i) => i.height));
  const subheadings = items.filter((i) => isUpper(i.str) && i.height >= body * 1.3 && i.height < body * 3);
  const banners = items.filter((i) => isUpper(i.str) && i.height > body * 1.05 && i.height < body * 1.3);
  const columnXs = [...new Set(subheadings.map((h) => h.x))].sort((a, b) => a - b);

  /** The lines under a heading: down to the next heading in its column or the next banner. */
  const bandBelow = (heading: PdfTextItem): PdfTextItem[] => {
    const right = columnXs.find((x) => x > heading.x + 20) ?? page.width;
    const stops = [
      ...subheadings.filter((h) => Math.abs(h.x - heading.x) < 20),
      ...banners.filter((b) => b.x <= heading.x + 20),
    ].filter((h) => h.y > heading.y + 1);
    const bottom = Math.min(...stops.map((h) => h.y - h.height * 0.6), page.height);
    return items.filter(
      (i) => i.y > heading.y + 1 && i.y < bottom && i.x >= heading.x - 3 && i.x < right - 3 &&
        !subheadings.includes(i) && !banners.includes(i),
    );
  };

  // ── Page text, column by column, for the walkthrough's sentences ──
  const textOf = (p: PdfTextItem[], width: number) =>
    [p.filter((i) => i.x < width / 2), p.filter((i) => i.x >= width / 2)]
      .map((half) => rowsOf(half).map((row) => row.map((i) => i.str).join(" ")).join(" "))
      .join(" ");
  const pageText = pages.map((p, n) => clean(textOf(p, rawPages[n]!.width)));
  const steps = pageText.filter((_, n) => n !== pageIndex).join(" ");
  const allText = pageText.join(" ");

  const boil = /total\s+boil\s+time\s+is\s+(\d+)\s*min/i.exec(steps) ?? /(\d+)[\s-]*minute\s+boil/i.exec(steps);
  const boilMinutes = boil ? Number(boil[1]) : null;

  /** When the walkthrough says to add something, if it does. */
  const whenAdded = (name: string): { use: KitIngredientUse; timingMinutes: number | null; said: string } | null => {
    const at = steps.toLowerCase().indexOf(name.toLowerCase());
    if (at < 0) return null;
    // The rest of the sentence; "0.5 oz" has a point but no space after it.
    const said = steps.slice(at + name.length).split(/\.(?:\s|$)/)[0]!.slice(0, 160);
    const left = /(\d+)\s*min(?:ute)?s?\s+(?:remaining|left)/i.exec(said);
    if (left) return { use: "boil", timingMinutes: Number(left[1]), said };
    if (/(beginning|start)\s+of\s+the\s+boil/i.test(said)) return { use: "boil", timingMinutes: boilMinutes, said };
    if (/flame\s*out|knock\s*out|end\s+of\s+the\s+boil/i.test(said)) return { use: "boil", timingMinutes: 0, said };
    if (/secondary/i.test(said)) return { use: "secondary", timingMinutes: null, said };
    if (/primary|ferment/i.test(said)) return { use: "primary", timingMinutes: null, said };
    if (/bottl|keg|priming/i.test(said)) return { use: "packaging", timingMinutes: null, said };
    return null;
  };

  // ── The inventory ──
  const pending: Pending[] = [];
  const warnings: KitSheetWarning[] = [];
  const suggestedYeasts: { lab: string; name: string }[] = [];
  const yeastTemps: { min: number; max: number }[] = [];
  let fermentables = 0;
  let hops = 0;

  const inventory = banners.find((b) => /^kit inventory$/i.test(b.str));
  const inventoryEnd = banners
    .filter((b) => inventory && b.y > inventory.y + 1 && b.x < inventory.x + 20)
    .sort((a, b) => a.y - b.y)[0]?.y ?? page.height;

  for (const heading of subheadings) {
    const known = SECTIONS.find(([re]) => re.test(heading.str))?.[1];
    // Unknown headings only count inside the inventory; "YOU WILL NEED" is equipment.
    if (!known && (!inventory || heading.y < inventory.y || heading.y > inventoryEnd)) continue;
    const section = known ?? UNKNOWN_SECTION;
    const band = bandBelow(heading);

    if (section.kind === "yeast") {
      for (const row of rowsOf(band)) {
        const text = clean(row.map((i) => i.str).join(" "));
        const temp = /temp\w*\.?\s*:?\s*(\d{2})\s*°?\s*[–—-]\s*(\d{2})\s*°?\s*F/i.exec(text);
        if (temp) {
          yeastTemps.push({ min: Number(temp[1]), max: Number(temp[2]) });
          continue;
        }
        if (/:$/.test(text) || !text) continue; // "DRY YEAST:", "LIQUID YEAST OPTION:"
        const lab = YEAST_LABS.exec(text);
        suggestedYeasts.push(lab ? { lab: lab[1]!, name: lab[2]! } : { lab: "", name: text });
      }
      continue;
    }

    // One ingredient per row; a row starting without an amount wraps the one above.
    const lines: { text: string; time: string | null }[] = [];
    for (const row of rowsOf(band)) {
      const last = row[row.length - 1]!;
      const time = row.length > 1 && TIME_CELL.test(last.str) ? last.str : null;
      const text = clean((time ? row.slice(0, -1) : row).map((i) => i.str).join(" "));
      if (!text && time && lines.length > 0) lines[lines.length - 1]!.time = time;
      else if (lines.length > 0 && !/^[\d.½¼¾]/.test(text) && !time) lines[lines.length - 1]!.text += ` ${text}`;
      else if (text) lines.push({ text, time });
    }

    for (const { text, time } of lines) {
      const line = parseKitLine(text);
      if (!line.name) continue;
      const sourceText = time ? `${text} ${time}` : text;
      const own: Pending["warnings"] = line.amount == null
        ? [{ code: "missing_amount", message: `The sheet gives no amount for ${line.name}.`, sourceText }]
        : [];

      const minutes = time ? /^(\d+)\s*min/i.exec(time) : null;
      let reading = readUse(minutes ? `Boil ${minutes[1]} min` : (time ?? line.descriptor));
      if (reading.use == null && section.use != null) reading = { use: section.use, timingMinutes: null, notes: reading.notes };
      if (reading.use == null && section.fromSteps) {
        const added = whenAdded(line.name);
        if (added) {
          reading = { use: added.use, timingMinutes: added.timingMinutes, notes: null };
        } else {
          reading = { use: "boil", timingMinutes: null, notes: null };
          own.push({
            code: "assumed_use",
            message: `The sheet doesn't say when ${line.name} goes in; assumed the boil. Check it against the instructions.`,
            sourceText,
          });
        }
      }

      const type = section.type ?? additionType(line.name);
      if (type === "hop") hops++;
      else if (type === "malt" || section.fromSteps) fermentables++;
      pending.push({
        name: line.name,
        type,
        amount: line.amount,
        unit: line.unit,
        use: reading.use,
        timingMinutes: reading.timingMinutes,
        notes: reading.notes,
        sourceText,
        warnings: own,
      });
    }
  }

  // ── Title and blurb ──
  const title = [...items].sort((a, b) => b.height - a.height)[0]!;
  const name = title.height >= body * 2.5 ? titleCase(clean(title.str)) : "";
  if (!name || fermentables === 0 || hops === 0) return { ok: false, code: "unrecognized_sheet" };

  const firstBelowTitle = Math.min(
    ...[...subheadings, ...banners].filter((h) => h.y > title.y + 1).map((h) => h.y - h.height),
    page.height,
  );
  const description = clean(
    rowsOf(items.filter((i) => i.y > title.y + 1 && i.y < firstBelowTitle && i.height < title.height * 0.5))
      .map((row) => row.map((i) => i.str).join(" "))
      .join(" "),
  ) || null;

  // ── The stats box: each value sits under its label ──
  const under = (label: RegExp): string | null => {
    const l = items.find((i) => label.test(clean(i.str)));
    if (!l) return null;
    const v = items
      .filter((i) => i !== l && Math.abs(i.x - l.x) < 4 && i.y > l.y + 1 && i.y - l.y <= l.height * 2.2)
      .sort((a, b) => a.y - b.y)[0];
    return v ? clean(v.str) : null;
  };
  const num = (s: string | null) => {
    const m = s ? /\d+(?:\.\d+)?/.exec(s) : null;
    return m ? Number(m[0]) : null;
  };
  const og = num(under(/^O\.?\s*G\.?$/i));
  const stats = {
    originalGravityMin: og,
    originalGravityMax: og,
    ibu: num(under(/^IBUs?$/i)),
    colorSrm: num(under(/^SRM$/i)),
    abv: num(under(/^ABV$/i)),
  };

  // "Primary: 2 Weeks", "Bottle Conditioning: 2 Weeks"
  const daysOf = (label: string): number | null => {
    const m = new RegExp(`(?:^|\\s)${label}\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*(weeks?|days?)`, "i").exec(pageText[pageIndex]!);
    if (!m) return null;
    return Math.round(Number(m[1]) * (/week/i.test(m[2]!) ? 7 : 1));
  };

  const ferment = /optimum\s+temp\w*\.?\s+for\s+this\s+beer\s+is\s+(\d{2})\s*°?\s*[–—-]\s*(\d{2})\s*°?\s*F/i.exec(allText);
  const hints = {
    boilMinutes,
    mashTempF: num(/mash[^.]{0,40}?\bat\s+(\d{3})\s*°?\s*F/i.exec(steps)?.[1] ?? null),
    fermentTempMinF: ferment ? Number(ferment[1]) : (yeastTemps[0]?.min ?? null),
    fermentTempMaxF: ferment ? Number(ferment[2]) : (yeastTemps[0]?.max ?? null),
    primaryDays: daysOf("primary"),
    secondaryDays: daysOf("secondary"),
    conditioningDays: daysOf("(?:bottle\\s+|keg\\s+)?conditioning"),
  };

  // ── The brew-day specifics worth keeping; the generic steps are the same on every kit ──
  const tipLines: string[] = [];
  const steep = /steep\s+for\s+\d+\s*min[^.]*?°\s*F/i.exec(steps);
  if (steep) tipLines.push(`${steep[0].charAt(0).toUpperCase()}${steep[0].slice(1)}.`);
  const priming = [...steps.matchAll(/(corn sugar|table sugar|dme)\s*(?:\([^)]*\))?[^.]*?\d[^.]*?cup[^.]*?water/gi)].map((m) => m[0]);
  if (priming.length > 0) tipLines.push(`Priming: ${priming.join("; ")}.`);
  const tips = tipLines.join(" ") || null;

  // ── Batch size ──
  const gallons =
    /brewing\s+(\d+(?:\.\d+)?)\s*gal(?:lon)?s?\s+batch/i.exec(allText) ??
    /bring\s+(?:the\s+)?volume\s+to\s+(\d+(?:\.\d+)?)\s*gal/i.exec(allText);
  const batchSizeGallons = gallons ? Number(gallons[1]) : DEFAULT_BATCH_GALLONS;
  if (!gallons) {
    warnings.push({
      code: "assumed_batch_size",
      message: `The sheet does not state a batch size; assumed ${DEFAULT_BATCH_GALLONS} gallons.`,
      ingredientIndex: null,
      sourceText: null,
    });
  }

  const ingredients = pending.map(({ warnings: own, ...ingredient }, index) => {
    for (const w of own) warnings.push({ ...w, ingredientIndex: index });
    return { ...ingredient, variants: null };
  });

  return {
    ok: true,
    draft: {
      source: "northern_brewer",
      name,
      description,
      variants: null,
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

function median(ns: number[]): number {
  const sorted = [...ns].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
