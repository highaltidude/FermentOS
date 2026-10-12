import type { RecipeVariant } from "@workspace/api-client-react";

/**
 * Recipe versions for the page: one recipe brewed as LME, DME or all-grain.
 * Mirrors artifacts/api-server/src/lib/recipeVariants.ts, which filters the
 * same way when it deducts inventory and schedules boil alerts, so keep the
 * two in step: if they disagree, the page lists one version's additions while
 * the server alerts on another's.
 */

export const VARIANT_LABELS: Record<RecipeVariant, string> = {
  lme: "LME",
  dme: "DME",
  all_grain: "All-Grain",
};

export const VARIANT_OPTIONS = (Object.keys(VARIANT_LABELS) as RecipeVariant[]).map((value) => ({
  value,
  label: VARIANT_LABELS[value],
}));

type VariantList = readonly RecipeVariant[] | null | undefined;

/** True when the recipe has versions to choose between. */
export function isMultiVariant(recipeVariants: VariantList): recipeVariants is readonly RecipeVariant[] {
  return Array.isArray(recipeVariants) && recipeVariants.length > 0;
}

/** An ingredient with no version list belongs to every version. */
export function appliesToVariant(ingredientVariants: VariantList, variant: RecipeVariant | null | undefined): boolean {
  if (variant == null) return true;
  if (!ingredientVariants || ingredientVariants.length === 0) return true;
  return ingredientVariants.includes(variant);
}

export function ingredientsForVariant<T extends { variants?: VariantList }>(
  ingredients: readonly T[],
  variant: RecipeVariant | null | undefined,
): T[] {
  return ingredients.filter((ing) => appliesToVariant(ing.variants, variant));
}

/**
 * The version a session should be read as. Null for a single-version recipe;
 * a session with no usable version falls back to the recipe's first.
 */
export function resolveSessionVariant(
  recipeVariants: VariantList,
  sessionVariant: RecipeVariant | null | undefined,
): RecipeVariant | null {
  if (!isMultiVariant(recipeVariants)) return null;
  if (sessionVariant != null && recipeVariants.includes(sessionVariant)) return sessionVariant;
  return recipeVariants[0] ?? null;
}

/** "LME · DME" */
export function variantListLabel(variants: readonly RecipeVariant[]): string {
  return variants.map((v) => VARIANT_LABELS[v]).join(" · ");
}
