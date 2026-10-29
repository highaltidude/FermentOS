import { eq } from "drizzle-orm";
import { db, brewSessionsTable, brewSessionStatusLogTable, recipesTable } from "@workspace/db";
import type { CreateBrewSessionBody } from "@workspace/api-zod";
import { isMultiVariant, type RecipeVariant } from "../lib/recipeVariants";
import {
  isInventoryEnforcementEnabled,
  consumeRecipeIngredientsTx,
  type InventoryShortage,
} from "./inventoryEnforcement";
import { captureRecipeSnapshot } from "./recipeSnapshot";

type CreateBrewSessionInput = ReturnType<typeof CreateBrewSessionBody.parse>;

export type CreateBrewSessionOutcome =
  | { kind: "created"; session: typeof brewSessionsTable.$inferSelect }
  | { kind: "shortage"; shortages: InventoryShortage[] }
  | { kind: "invalid_variant"; variants: RecipeVariant[] };

/** The versions a recipe can be brewed as, or null for an ordinary recipe. */
export async function recipeVariantsOf(recipeId: number | null | undefined): Promise<RecipeVariant[] | null> {
  if (recipeId == null) return null;
  const [recipe] = await db
    .select({ variants: recipesTable.variants })
    .from(recipesTable)
    .where(eq(recipesTable.id, recipeId));
  return isMultiVariant(recipe?.variants) ? [...recipe.variants] : null;
}

// Sentinel error used only to abort the transaction with a typed payload.
class ShortageAbort extends Error {
  constructor(public shortages: InventoryShortage[]) { super("inventory shortage"); }
}

async function insertSession(
  executor: Pick<typeof db, "insert">,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values: any,
): Promise<typeof brewSessionsTable.$inferSelect> {
  const [session] = await executor.insert(brewSessionsTable).values(values).returning();
  // A batch entered part-way through (already fermenting or conditioning) gets
  // its stage start logged too: dry hop days and "days in stage" count from it.
  if (session && session.status !== "brew_day") {
    await executor.insert(brewSessionStatusLogTable).values({ brewSessionId: session.id, status: session.status, changedAt: new Date() });
  }
  return session;
}

/**
 * Create a brew session, deducting its recipe's ingredients from inventory
 * when enforcement is on.
 *
 * With enforcement, the inventory check + deduction + session insert run in a
 * single transaction. Inventory rows are SELECT FOR UPDATE locked inside
 * consumeRecipeIngredientsTx so two concurrent brews can't both pass the
 * check on the same stock.
 *
 * A recipe with several versions has to be told which one is being brewed.
 * Guessing would deduct the wrong version's stock, silently, with no undo.
 */
export async function createBrewSession(data: CreateBrewSessionInput): Promise<CreateBrewSessionOutcome> {
  const { brewDate, ...rest } = data;
  const { recipeId } = data;

  const variants = await recipeVariantsOf(recipeId);
  let recipeVariant: RecipeVariant | null = null;
  if (variants) {
    if (!data.recipeVariant || !variants.includes(data.recipeVariant)) {
      return { kind: "invalid_variant", variants };
    }
    recipeVariant = data.recipeVariant;
  }
  // A record of the recipe as brewed, for version history. Taken again when
  // the session leaves brew_day, in case the recipe is edited before then.
  const recipeSnapshot = recipeId ? await captureRecipeSnapshot(recipeId, recipeVariant) : null;
  const values = { ...rest, recipeVariant, recipeSnapshot, brewDate: String(brewDate) };

  if (recipeId && (await isInventoryEnforcementEnabled())) {
    return db.transaction(async (tx) => {
      const result = await consumeRecipeIngredientsTx(tx, recipeId, recipeVariant);
      if (!result.ok) {
        // Rolling back is required so the FOR UPDATE locks release without
        // half-applying any deductions. Throwing aborts the transaction.
        throw new ShortageAbort(result.shortages);
      }
      return { kind: "created" as const, session: await insertSession(tx, values) };
    }).catch((err: unknown) => {
      if (err instanceof ShortageAbort) {
        return { kind: "shortage" as const, shortages: err.shortages };
      }
      throw err;
    });
  }

  return { kind: "created", session: await insertSession(db, values) };
}
