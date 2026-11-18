/**
 * The brew session page's card order and the cards left off it, as saved in
 * app_config. Whatever was saved, the layout handed out lists every section
 * once, so a card added in a later release still shows up.
 */

/** The page's cards, in their default order, top to bottom. */
export const BREW_LAYOUT_SECTIONS = [
  "water",
  "dryHops",
  "tasting",
  "recipeAsBrewed",
  "stageHistory",
  "tempControl",
  "heatingCooling",
  "telemetry",
  "sensors",
  "sensorReadings",
  "fermentationChart",
  "referenceCharts",
  "readings",
] as const;

export type BrewLayoutSection = (typeof BREW_LAYOUT_SECTIONS)[number];

export interface BrewLayout {
  order: BrewLayoutSection[];
  hidden: BrewLayoutSection[];
}

export const DEFAULT_BREW_LAYOUT: BrewLayout = { order: [...BREW_LAYOUT_SECTIONS], hidden: [] };

const isSection = (v: unknown): v is BrewLayoutSection =>
  typeof v === "string" && (BREW_LAYOUT_SECTIONS as readonly string[]).includes(v);

const known = (list: unknown): BrewLayoutSection[] =>
  Array.isArray(list) ? [...new Set(list.filter(isSection))] : [];

/**
 * Any layout, even a broken one, as a complete one: unknown and repeated
 * sections dropped, and each missing section put back after the one that
 * comes before it by default (first, when nothing does).
 */
export function normalizeBrewLayout(raw: unknown): BrewLayout {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const order = known(obj.order);

  BREW_LAYOUT_SECTIONS.forEach((section, i) => {
    if (order.includes(section)) return;
    const before = BREW_LAYOUT_SECTIONS.slice(0, i).reverse().find((s) => order.includes(s));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, section);
  });

  return { order, hidden: known(obj.hidden) };
}

/** The saved JSON, or the default when there is none or it doesn't parse. */
export function parseBrewLayout(json: string | null | undefined): BrewLayout {
  if (!json) return normalizeBrewLayout(null);
  try {
    return normalizeBrewLayout(JSON.parse(json));
  } catch {
    return normalizeBrewLayout(null);
  }
}
