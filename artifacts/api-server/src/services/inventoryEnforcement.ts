import { eq, sql } from "drizzle-orm";
import {
  db,
  inventoryTable,
  recipeIngredientsTable,
} from "@workspace/db";
import { getConfigValue, setConfigValue } from "./appConfig";
import { planInventoryConsumption, type InventoryShortage } from "../lib/inventoryPlan";
import { ingredientsForVariant, type RecipeVariant } from "../lib/recipeVariants";

export type { InventoryShortage };

const FLAG_KEY = "inventory_enforcement_required";

// Drizzle transaction type — derived from the db instance.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function isInventoryEnforcementEnabled(): Promise<boolean> {
  return (await getConfigValue(FLAG_KEY)) === "true";
}

export async function setInventoryEnforcementEnabled(value: boolean): Promise<void> {
  await setConfigValue(FLAG_KEY, value ? "true" : "false");
}

/**
 * Verify and deduct a recipe's ingredients from inventory inside an existing
 * transaction. Caller must hold the transaction open and only commit if
 * the rest of their work (e.g. inserting the brew session) also succeeds.
 *
 * Inventory rows are locked with SELECT ... FOR UPDATE so concurrent brew
 * sessions can't both pass the check and double-deduct.
 *
 * For a recipe with several versions, pass the one being brewed so only its
 * ingredients are counted. The matching rules live in planInventoryConsumption.
 */
export async function consumeRecipeIngredientsTx(
  tx: Tx,
  recipeId: number,
  variant: RecipeVariant | null,
): Promise<
  | { ok: true; consumed: number }
  | { ok: false; shortages: InventoryShortage[] }
> {
  const ingredients = ingredientsForVariant(
    await tx
      .select()
      .from(recipeIngredientsTable)
      .where(eq(recipeIngredientsTable.recipeId, recipeId)),
    variant,
  );

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

  const { shortages, updates } = planInventoryConsumption(ingredients, inventory);

  if (shortages.length > 0) return { ok: false, shortages };

  for (const u of updates) {
    await tx
      .update(inventoryTable)
      .set({ amount: u.newAmount, updatedAt: new Date() })
      .where(eq(inventoryTable.id, u.id));
  }

  return { ok: true, consumed: updates.length };
}
