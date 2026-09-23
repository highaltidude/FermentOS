import { db, brewSessionsTable } from "@workspace/db";
import type { CreateBrewSessionBody } from "@workspace/api-zod";
import {
  isInventoryEnforcementEnabled,
  consumeRecipeIngredientsTx,
  type InventoryShortage,
} from "./inventoryEnforcement";

type CreateBrewSessionInput = ReturnType<typeof CreateBrewSessionBody.parse>;

export type CreateBrewSessionOutcome =
  | { kind: "created"; session: typeof brewSessionsTable.$inferSelect }
  | { kind: "shortage"; shortages: InventoryShortage[] };

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
 */
export async function createBrewSession(data: CreateBrewSessionInput): Promise<CreateBrewSessionOutcome> {
  const { brewDate, ...rest } = data;
  const values = { ...rest, brewDate: String(brewDate) };
  const { recipeId } = data;

  if (recipeId && (await isInventoryEnforcementEnabled())) {
    return db.transaction(async (tx) => {
      const result = await consumeRecipeIngredientsTx(tx, recipeId);
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
