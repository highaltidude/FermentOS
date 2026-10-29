/**
 * Recipe version history: the frozen copy of a recipe kept on each brew
 * session, what changed between two of them, and recipe fork families.
 *
 * Import-free apart from types, like recipeVariants.ts, so it can be unit
 * tested without a database.
 */
import type { Recipe, RecipeIngredient, RecipeStep, RecipeSnapshot } from "@workspace/db";
import { ingredientsForVariant } from "./recipeVariants";

type SnapshotIngredient = RecipeSnapshot["ingredients"][number];
type SnapshotStep = RecipeSnapshot["steps"][number];
type SnapshotField = keyof RecipeSnapshot["recipe"];

export type RecipeChange =
  | { kind: "field"; field: SnapshotField; from: number | string | null; to: number | string | null }
  | { kind: "ingredient_added" | "ingredient_removed"; ingredient: SnapshotIngredient }
  | { kind: "ingredient_changed"; ingredient: SnapshotIngredient; previousIngredient: SnapshotIngredient }
  | { kind: "step_added" | "step_removed"; step: SnapshotStep }
  | { kind: "step_changed"; step: SnapshotStep; previousStep: SnapshotStep };

/** Header fields compared between versions, in the order they're reported. */
const FIELDS: readonly SnapshotField[] = [
  "name", "style", "batchSizeGallons", "originalGravity", "finalGravity", "abv", "ibu", "colorSrm",
  "efficiencyPercent", "fermentTempMin", "fermentTempIdeal", "fermentTempMax",
  "conditionTempMin", "conditionTempIdeal", "conditionTempMax", "notes",
];

/** A recipe as it stands, frozen. Only the ingredients of the given version are kept. */
export function buildRecipeSnapshot(
  recipe: Recipe,
  ingredients: readonly RecipeIngredient[],
  steps: readonly RecipeStep[],
  variant: RecipeSnapshot["variant"],
  capturedAt: Date = new Date(),
): RecipeSnapshot {
  return {
    capturedAt: capturedAt.toISOString(),
    variant,
    recipe: {
      name: recipe.name,
      style: recipe.style,
      batchSizeGallons: recipe.batchSizeGallons,
      originalGravity: recipe.originalGravity,
      finalGravity: recipe.finalGravity,
      abv: recipe.abv,
      ibu: recipe.ibu,
      colorSrm: recipe.colorSrm,
      efficiencyPercent: recipe.efficiencyPercent,
      fermentTempMin: recipe.fermentTempMin,
      fermentTempMax: recipe.fermentTempMax,
      fermentTempIdeal: recipe.fermentTempIdeal,
      conditionTempMin: recipe.conditionTempMin,
      conditionTempMax: recipe.conditionTempMax,
      conditionTempIdeal: recipe.conditionTempIdeal,
      notes: recipe.notes,
    },
    ingredients: ingredientsForVariant(ingredients, variant).map((i) => ({
      name: i.name,
      type: i.type,
      amount: i.amount,
      unit: i.unit,
      use: i.use,
      timingMinutes: i.timingMinutes,
      dryHopDay: i.dryHopDay,
      notes: i.notes,
    })),
    steps: [...steps]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ position: s.position, phase: s.phase, body: s.body, durationMinutes: s.durationMinutes })),
  };
}

const blankToNull = <T>(v: T | null | undefined): T | null => (v === undefined || v === "" ? null : v);

/**
 * Pair up items that share a key. Within a key, items that are the same
 * (same timing, say) pair first and the rest pair in order, so the same hop
 * at 60 and 15 minutes pairs with itself rather than crosswise, and dropping
 * the 60 minute one reads as a removal rather than a change to both.
 */
function pairByKey<T>(
  before: readonly T[],
  after: readonly T[],
  key: (item: T) => string,
  order: (a: T, b: T) => number,
  same: (a: T, b: T) => boolean,
): { pairs: [T, T][]; removed: T[]; added: T[] } {
  const group = (items: readonly T[]) => {
    const map = new Map<string, T[]>();
    for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
    for (const list of map.values()) list.sort(order);
    return map;
  };
  const was = group(before);
  const now = group(after);
  const pairs: [T, T][] = [];
  const added: T[] = [];
  const removed: T[] = [];
  // Walk the newer list so changes come out in the recipe's current order.
  const seen = new Set<string>();
  for (const item of after) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    const a = [...(was.get(k) ?? [])];
    const b: T[] = [];
    for (const item of now.get(k) ?? []) {
      const match = a.findIndex((old) => same(old, item));
      if (match === -1) b.push(item);
      else pairs.push([a.splice(match, 1)[0]!, item]);
    }
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] && b[i]) pairs.push([a[i]!, b[i]!]);
      else if (b[i]) added.push(b[i]!);
      else removed.push(a[i]!);
    }
  }
  for (const [k, list] of was) if (!seen.has(k)) removed.push(...list);
  return { pairs, removed, added };
}

const byNullable = (a: number | null, b: number | null) =>
  (a ?? Number.POSITIVE_INFINITY) - (b ?? Number.POSITIVE_INFINITY) || 0;

/** What changed going from one version of a recipe to another. Empty when nothing did. */
export function diffRecipeSnapshots(before: RecipeSnapshot, after: RecipeSnapshot): RecipeChange[] {
  const changes: RecipeChange[] = [];

  for (const field of FIELDS) {
    const from = blankToNull(before.recipe[field]);
    const to = blankToNull(after.recipe[field]);
    if (from !== to) changes.push({ kind: "field", field, from, to });
  }

  const ing = pairByKey(
    before.ingredients,
    after.ingredients,
    (i) => `${i.type}|${i.name.trim().toLowerCase()}|${i.use ?? ""}`,
    (a, b) => byNullable(b.timingMinutes, a.timingMinutes) || byNullable(a.dryHopDay, b.dryHopDay) || a.amount - b.amount,
    (a, b) => blankToNull(a.timingMinutes) === blankToNull(b.timingMinutes) && blankToNull(a.dryHopDay) === blankToNull(b.dryHopDay),
  );
  for (const [was, now] of ing.pairs) {
    if (
      was.amount !== now.amount ||
      was.unit.trim().toLowerCase() !== now.unit.trim().toLowerCase() ||
      blankToNull(was.timingMinutes) !== blankToNull(now.timingMinutes) ||
      blankToNull(was.dryHopDay) !== blankToNull(now.dryHopDay)
    ) {
      changes.push({ kind: "ingredient_changed", ingredient: now, previousIngredient: was });
    }
  }
  for (const i of ing.added) changes.push({ kind: "ingredient_added", ingredient: i });
  for (const i of ing.removed) changes.push({ kind: "ingredient_removed", ingredient: i });

  const steps = pairByKey(
    before.steps,
    after.steps,
    (s) => `${s.phase ?? ""}|${s.body.trim()}`,
    (a, b) => a.position - b.position,
    (a, b) => blankToNull(a.durationMinutes) === blankToNull(b.durationMinutes),
  );
  for (const [was, now] of steps.pairs) {
    if (blankToNull(was.durationMinutes) !== blankToNull(now.durationMinutes)) {
      changes.push({ kind: "step_changed", step: now, previousStep: was });
    }
  }
  for (const s of steps.added) changes.push({ kind: "step_added", step: s });
  for (const s of steps.removed) changes.push({ kind: "step_removed", step: s });

  return changes;
}

export interface HistoryBrew {
  id: number;
  brewDate: string;
  recipeVariant: string | null;
  overallScore: number | null;
  recipeSnapshot: RecipeSnapshot | null;
}

/**
 * A recipe's brews, newest first, each with what changed since the brew
 * before it that has a snapshot. changes is null when there's nothing to
 * compare with: the first recorded brew, or one from before version history.
 */
export function recipeBrewHistory(brews: readonly HistoryBrew[]) {
  const oldestFirst = [...brews].sort((a, b) => a.brewDate.localeCompare(b.brewDate) || a.id - b.id);
  let previous: RecipeSnapshot | null = null;
  const entries = oldestFirst.map((b) => {
    const changes = b.recipeSnapshot && previous ? diffRecipeSnapshots(previous, b.recipeSnapshot) : null;
    if (b.recipeSnapshot) previous = b.recipeSnapshot;
    return {
      id: b.id,
      brewDate: b.brewDate,
      recipeVariant: b.recipeVariant,
      overallScore: b.overallScore,
      recorded: b.recipeSnapshot != null,
      changes,
    };
  });
  return { entries: entries.reverse(), latestSnapshot: previous as RecipeSnapshot | null };
}

/**
 * Every recipe related to this one by forking: the original at the top of
 * its chain and everything forked from it, original first. Survives a
 * parent pointer loop, which the schema doesn't prevent.
 */
export function recipeFamily(rows: readonly { id: number; parentRecipeId: number | null }[], id: number): number[] {
  const parentOf = new Map(rows.map((r) => [r.id, r.parentRecipeId]));
  if (!parentOf.has(id)) return [id];

  let root = id;
  const climbed = new Set([id]);
  for (let p = parentOf.get(root); p != null && parentOf.has(p) && !climbed.has(p); p = parentOf.get(root)) {
    climbed.add(p);
    root = p;
  }

  const children = new Map<number, number[]>();
  for (const r of rows) {
    if (r.parentRecipeId != null) children.set(r.parentRecipeId, [...(children.get(r.parentRecipeId) ?? []), r.id]);
  }
  const family: number[] = [];
  const seen = new Set<number>();
  const queue = [root];
  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    family.push(next);
    queue.push(...(children.get(next) ?? []));
  }
  return family;
}

/** "Pale Ale" → "Pale Ale v2", "Pale Ale v2" → "Pale Ale v3". */
export function nextVersionName(name: string): string {
  const trimmed = name.trim();
  const match = /^(.*\S)\s+v(\d+)$/i.exec(trimmed);
  return match ? `${match[1]} v${Number(match[2]) + 1}` : `${trimmed} v2`;
}
