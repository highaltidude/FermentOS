import type { RecipeVariant } from "@workspace/api-client-react";
import { FilterChip } from "@/components/ui/filter-chip";
import { VARIANT_LABELS } from "@/lib/recipeVariants";

/**
 * Which versions of a recipe an ingredient belongs to. `value` is null when it
 * belongs to all of them, which is also what picking every chip gives back.
 * The last chip can't be switched off: an ingredient in no version is nowhere.
 */
export function VariantChips({ available, value, onChange }: {
  available: readonly RecipeVariant[];
  value: readonly RecipeVariant[] | null;
  onChange: (value: RecipeVariant[] | null) => void;
}) {
  const selected = value && value.length > 0 ? value : available;

  const toggle = (variant: RecipeVariant) => {
    const next = selected.includes(variant)
      ? selected.filter((v) => v !== variant)
      : available.filter((v) => v === variant || selected.includes(v));
    if (next.length === 0) return;
    onChange(next.length === available.length ? null : next);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground mr-0.5">Used in</span>
      {available.map((variant) => (
        <FilterChip
          key={variant}
          active={selected.includes(variant)}
          aria-pressed={selected.includes(variant)}
          className="px-2 py-0.5"
          onClick={() => toggle(variant)}
        >
          {VARIANT_LABELS[variant]}
        </FilterChip>
      ))}
    </div>
  );
}

/** Pick one version to look at, or (when `allowAll`) all of them together. */
export function VariantSwitcher({ available, value, onChange, allowAll = false }: {
  available: readonly RecipeVariant[];
  value: RecipeVariant | null;
  onChange: (value: RecipeVariant | null) => void;
  allowAll?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Recipe version">
      {available.map((variant) => (
        <FilterChip key={variant} active={value === variant} aria-pressed={value === variant} onClick={() => onChange(variant)}>
          {VARIANT_LABELS[variant]}
        </FilterChip>
      ))}
      {allowAll && (
        <FilterChip active={value === null} aria-pressed={value === null} onClick={() => onChange(null)}>
          All
        </FilterChip>
      )}
    </div>
  );
}
