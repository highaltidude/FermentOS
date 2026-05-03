import { eq, sql } from "drizzle-orm";
import {
  db,
  appConfigTable,
  inventoryTable,
  recipeIngredientsTable,
} from "@workspace/db";

const FLAG_KEY = "inventory_enforcement_required";

export type InventoryShortage = {
  name: string;
  type: string;
  required: number;
  available: number;
  unit: string;
  reason: "missing" | "insufficient" | "unit_mismatch";
  availableUnit?: string;
};

// Drizzle transaction type — derived from the db instance.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function isInventoryEnforcementEnabled(): Promise<boolean> {
  const [row] = await db
    .select()
    .from(appConfigTable)
    .where(eq(appConfigTable.key, FLAG_KEY));
  return row?.value === "true";
}

export async function setInventoryEnforcementEnabled(value: boolean): Promise<void> {
  await db
    .insert(appConfigTable)
    .values({ key: FLAG_KEY, value: value ? "true" : "false" })
    .onConflictDoUpdate({
      target: appConfigTable.key,
      set: { value: value ? "true" : "false", updatedAt: new Date() },
    });
}

/**
 * Verify and deduct recipe ingredients from inventory inside an existing
 * transaction. Caller must hold the transaction open and only commit if
 * the rest of their work (e.g. inserting the brew session) also succeeds.
 *
 * Inventory rows are locked with SELECT ... FOR UPDATE so concurrent brew
 * sessions can't both pass the check and double-deduct.
 *
 * Matches inventory rows by case-insensitive name + same type. Units must
 * match exactly — we don't try to convert between lb/oz/g/etc. since recipes
 * and inventory are user-entered and ambiguous.
 */
export async function consumeRecipeIngredientsTx(
  tx: Tx,
  recipeId: number,
): Promise<
  | { ok: true; consumed: number }
  | { ok: false; shortages: InventoryShortage[] }
> {
  const ingredients = await tx
    .select()
    .from(recipeIngredientsTable)
    .where(eq(recipeIngredientsTable.recipeId, recipeId));

  if (ingredients.length === 0) return { ok: true, consumed: 0 };

  // Lock candidate inventory rows for the duration of the transaction.
  // We narrow by type+name (lowercased) so we don't lock the entire table.
  const ingNames = Array.from(new Set(ingredients.map((i) => i.name.trim().toLowerCase())));
  const ingTypes = Array.from(new Set(ingredients.map((i) => i.type)));

  const inventory = await tx
    .select()
    .from(inventoryTable)
    .where(
      sql`${inventoryTable.type} IN ${ingTypes} AND lower(trim(${inventoryTable.name})) IN ${ingNames}`,
    )
    .for("update");

  const shortages: InventoryShortage[] = [];
  const updates: Array<{ id: number; newAmount: number }> = [];

  for (const ing of ingredients) {
    const matches = inventory.filter(
      (inv) =>
        inv.type === ing.type &&
        inv.name.trim().toLowerCase() === ing.name.trim().toLowerCase(),
    );

    if (matches.length === 0) {
      shortages.push({
        name: ing.name,
        type: ing.type,
        required: ing.amount,
        available: 0,
        unit: ing.unit,
        reason: "missing",
      });
      continue;
    }

    const sameUnit = matches.filter(
      (m) => m.unit.trim().toLowerCase() === ing.unit.trim().toLowerCase(),
    );

    if (sameUnit.length === 0) {
      shortages.push({
        name: ing.name,
        type: ing.type,
        required: ing.amount,
        available: matches.reduce((s, m) => s + m.amount, 0),
        unit: ing.unit,
        reason: "unit_mismatch",
        availableUnit: matches[0].unit,
      });
      continue;
    }

    let remaining = ing.amount;
    const totalAvailable = sameUnit.reduce((s, m) => s + m.amount, 0);
    if (totalAvailable < remaining) {
      shortages.push({
        name: ing.name,
        type: ing.type,
        required: ing.amount,
        available: totalAvailable,
        unit: ing.unit,
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

    for (const m of sorted) {
      if (remaining <= 0) break;
      const take = Math.min(m.amount, remaining);
      remaining -= take;
      updates.push({ id: m.id, newAmount: Number((m.amount - take).toFixed(4)) });
    }
  }

  if (shortages.length > 0) return { ok: false, shortages };

  for (const u of updates) {
    await tx
      .update(inventoryTable)
      .set({ amount: u.newAmount, updatedAt: new Date() })
      .where(eq(inventoryTable.id, u.id));
  }

  return { ok: true, consumed: updates.length };
}
