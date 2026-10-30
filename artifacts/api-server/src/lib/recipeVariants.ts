/**
 * Recipe versions: one recipe that can be brewed as LME, DME or all-grain,
 * sharing most of its ingredients.
 *
 * A recipe lists the versions it has (`variants`, null for an ordinary
 * recipe); each ingredient lists the versions it belongs to (null = all of
 * them); a brew session records the one that was brewed.
 *
 * Import-free on purpose, like boilTimer.ts, so it can be unit tested without
 * a database. artifacts/fermentos/src/lib/recipeVariants.ts mirrors the
 * filtering rules for the browser — keep the two in step.
 */

export const RECIPE_VARIANTS = ["lme", "dme", "all_grain"] as const;
export type RecipeVariant = (typeof RECIPE_VARIANTS)[number];

type VariantList = readonly string[] | null | undefined;

export function isRecipeVariant(value: unknown): value is RecipeVariant {
  return typeof value === "string" && (RECIPE_VARIANTS as readonly string[]).includes(value);
}

/** True when the recipe has versions to choose between. */
export function isMultiVariant(recipeVariants: VariantList): recipeVariants is readonly RecipeVariant[] {
  return Array.isArray(recipeVariants) && recipeVariants.length > 0;
}

/** An ingredient with no version list belongs to every version. */
export function appliesToVariant(ingredientVariants: VariantList, variant: string | null | undefined): boolean {
  if (variant == null) return true;
  if (!ingredientVariants || ingredientVariants.length === 0) return true;
  return ingredientVariants.includes(variant);
}

export function ingredientsForVariant<T extends { variants?: VariantList }>(
  ingredients: readonly T[],
  variant: string | null | undefined,
): T[] {
  return ingredients.filter((ing) => appliesToVariant(ing.variants, variant));
}

/**
 * The version a session should be read as. Null for a single-version recipe.
 * A session with no usable version (created before the recipe had versions, or
 * re-pointed at another recipe) falls back to the recipe's first, so readers
 * never see every version's ingredients at once.
 */
export function resolveSessionVariant(
  recipeVariants: VariantList,
  sessionVariant: string | null | undefined,
): RecipeVariant | null {
  if (!isMultiVariant(recipeVariants)) return null;
  if (sessionVariant != null && recipeVariants.includes(sessionVariant as RecipeVariant)) {
    return sessionVariant as RecipeVariant;
  }
  return recipeVariants[0] ?? null;
}

/**
 * Validate and tidy the version list of an ingredient against its recipe:
 * de-duplicated, in the recipe's order, and collapsed to null when it names
 * every version. Fails when it names a version the recipe does not have.
 */
export function normalizeIngredientVariants(
  recipeVariants: VariantList,
  variants: VariantList,
): { ok: true; variants: RecipeVariant[] | null } | { ok: false } {
  if (!variants || variants.length === 0) return { ok: true, variants: null };
  if (!isMultiVariant(recipeVariants)) return { ok: false };
  if (variants.some((v) => !recipeVariants.includes(v as RecipeVariant))) return { ok: false };
  const ordered = recipeVariants.filter((v) => variants.includes(v));
  return { ok: true, variants: ordered.length === recipeVariants.length ? null : ordered };
}

/**
 * A recipe's version list: de-duplicated and in canonical order. Fewer than
 * two is not a choice, so it collapses to null — an ordinary recipe.
 */
export function normalizeRecipeVariants(variants: VariantList): RecipeVariant[] | null {
  if (!variants) return null;
  const ordered = RECIPE_VARIANTS.filter((v) => variants.includes(v));
  return ordered.length > 1 ? ordered : null;
}
