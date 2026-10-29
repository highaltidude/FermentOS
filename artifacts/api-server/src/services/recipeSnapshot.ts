import { asc, eq } from "drizzle-orm";
import { db, recipesTable, recipeIngredientsTable, recipeStepsTable, type RecipeSnapshot } from "@workspace/db";
import { buildRecipeSnapshot } from "../lib/recipeHistory";
import { resolveSessionVariant } from "../lib/recipeVariants";

type Executor = Pick<typeof db, "select">;

/** The recipe as it stands now, frozen for a brew of the given version. Null if it's gone. */
export async function captureRecipeSnapshot(
  recipeId: number,
  variant: string | null,
  executor: Executor = db,
): Promise<RecipeSnapshot | null> {
  const [recipe] = await executor.select().from(recipesTable).where(eq(recipesTable.id, recipeId));
  if (!recipe) return null;
  const [ingredients, steps] = await Promise.all([
    executor
      .select()
      .from(recipeIngredientsTable)
      .where(eq(recipeIngredientsTable.recipeId, recipeId))
      .orderBy(asc(recipeIngredientsTable.id)),
    executor.select().from(recipeStepsTable).where(eq(recipeStepsTable.recipeId, recipeId)),
  ]);
  // Read the way the rest of the app reads a session, so a stale version never
  // freezes every version's ingredients at once.
  return buildRecipeSnapshot(recipe, ingredients, steps, resolveSessionVariant(recipe.variants, variant));
}

/**
 * A brew session without its recipe snapshot. The snapshot is only for
 * version history, which has its own endpoint, so session responses skip it.
 */
export function withoutSnapshot<T extends { recipeSnapshot?: unknown }>(session: T): Omit<T, "recipeSnapshot"> {
  const { recipeSnapshot: _snapshot, ...rest } = session;
  return rest;
}
