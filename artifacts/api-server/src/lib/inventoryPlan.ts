/**
 * Works out what a recipe takes from inventory: which stock rows to draw down
 * and by how much, or what is short.
 *
 * Import-free on purpose, like boilTimer.ts, so it can be unit tested without
 * a database. inventoryEnforcement.ts does the locking and the writes.
 */

export type InventoryShortage = {
  name: string;
  type: string;
  required: number;
  available: number;
  unit: string;
  reason: "missing" | "insufficient" | "unit_mismatch";
  availableUnit?: string;
};

export type PlanIngredient = {
  name: string;
  type: string;
  amount: number;
  unit: string;
};

export type PlanInventoryRow = {
  id: number;
  name: string;
  type: string;
  amount: number;
  unit: string;
  purchasedDate: Date | string | null;
};

export type InventoryPlan = {
  shortages: InventoryShortage[];
  updates: Array<{ id: number; newAmount: number }>;
};

const norm = (s: string) => s.trim().toLowerCase();
const round4 = (n: number) => Number(n.toFixed(4));

/**
 * Matches inventory rows by case-insensitive name + same type. Units must
 * match exactly — we don't try to convert between lb/oz/g/etc. since recipes
 * and inventory are user-entered and ambiguous.
 *
 * A recipe often lists the same ingredient more than once (a hop at 60, at
 * flameout and as a dry hop), so lines for the same item are totalled before
 * they are checked. Checking them one at a time against the same stock let
 * each line pass on its own while the batch as a whole was short.
 */
export function planInventoryConsumption(
  ingredients: readonly PlanIngredient[],
  inventory: readonly PlanInventoryRow[],
): InventoryPlan {
  const needs = new Map<string, PlanIngredient>();
  for (const ing of ingredients) {
    const key = `${ing.type}|${norm(ing.name)}|${norm(ing.unit)}`;
    const existing = needs.get(key);
    if (existing) existing.amount = round4(existing.amount + ing.amount);
    else needs.set(key, { name: ing.name, type: ing.type, amount: ing.amount, unit: ing.unit });
  }

  const shortages: InventoryShortage[] = [];
  const updates: InventoryPlan["updates"] = [];

  for (const need of needs.values()) {
    const matches = inventory.filter((inv) => inv.type === need.type && norm(inv.name) === norm(need.name));

    if (matches.length === 0) {
      shortages.push({
        name: need.name,
        type: need.type,
        required: need.amount,
        available: 0,
        unit: need.unit,
        reason: "missing",
      });
      continue;
    }

    const sameUnit = matches.filter((m) => norm(m.unit) === norm(need.unit));

    if (sameUnit.length === 0) {
      shortages.push({
        name: need.name,
        type: need.type,
        required: need.amount,
        available: round4(matches.reduce((s, m) => s + m.amount, 0)),
        unit: need.unit,
        reason: "unit_mismatch",
        availableUnit: matches[0]!.unit,
      });
      continue;
    }

    const totalAvailable = round4(sameUnit.reduce((s, m) => s + m.amount, 0));
    if (totalAvailable < need.amount) {
      shortages.push({
        name: need.name,
        type: need.type,
        required: need.amount,
        available: totalAvailable,
        unit: need.unit,
        reason: "insufficient",
      });
      continue;
    }

    // Deduct from oldest-purchased first; fall back to id order for ties or
    // missing dates so the result is deterministic.
    const sorted = [...sameUnit].sort((a, b) => {
      const aDate = a.purchasedDate ? new Date(a.purchasedDate).getTime() : Number.POSITIVE_INFINITY;
      const bDate = b.purchasedDate ? new Date(b.purchasedDate).getTime() : Number.POSITIVE_INFINITY;
      if (aDate !== bDate) return aDate - bDate;
      return a.id - b.id;
    });

    let remaining = need.amount;
    for (const m of sorted) {
      if (remaining <= 0) break;
      const take = Math.min(m.amount, remaining);
      remaining = round4(remaining - take);
      updates.push({ id: m.id, newAmount: round4(m.amount - take) });
    }
  }

  return { shortages, updates };
}
