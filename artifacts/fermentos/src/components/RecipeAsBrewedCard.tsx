import { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import {
  useGetBrewSessionRecipeSnapshot,
  getGetBrewSessionRecipeSnapshotQueryKey,
} from "@workspace/api-client-react";
import { RecipeChangeList, ingredientDetail } from "@/components/RecipeChangeList";
import { formatDateTime } from "@/lib/format";
import { VARIANT_LABELS } from "@/lib/recipeVariants";

/**
 * The recipe as this batch was brewed: a record kept for version history.
 * The batch itself still follows the live recipe.
 */
export function RecipeAsBrewedCard({ brewSessionId }: { brewSessionId: number }) {
  const [open, setOpen] = useState(false);
  const { data } = useGetBrewSessionRecipeSnapshot(brewSessionId, {
    query: { queryKey: getGetBrewSessionRecipeSnapshotQueryKey(brewSessionId) },
  });
  const snapshot = data?.snapshot;
  if (!snapshot) return null;
  const changes = data.changesSinceBrew ?? [];

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 flex items-center gap-2 text-left"
      >
        <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Recipe as brewed</h2>
        {changes.length > 0 && (
          <span className="text-xs text-amber-600 ml-1">recipe changed since</span>
        )}
        {open ? <ChevronDown className="w-4 h-4 ml-auto text-muted-foreground" /> : <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-card-border pt-3">
          <p className="text-xs text-muted-foreground">
            {snapshot.recipe.name}
            {snapshot.variant && ` (${VARIANT_LABELS[snapshot.variant]})`}, recorded {formatDateTime(snapshot.capturedAt)}.
          </p>
          {changes.length > 0 && (
            <div className="rounded-md border border-border p-3">
              <div className="text-xs font-medium text-foreground mb-1.5">Changed in the recipe since this brew</div>
              <RecipeChangeList changes={changes} />
            </div>
          )}
          {snapshot.ingredients.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Ingredients</div>
              <ul className="space-y-0.5">
                {snapshot.ingredients.map((ing, i) => (
                  <li key={i} className="text-sm text-foreground">
                    {ing.name} <span className="text-xs text-muted-foreground">{ingredientDetail(ing)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {snapshot.steps.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Steps</div>
              <ol className="list-decimal list-inside space-y-0.5">
                {snapshot.steps.map((s, i) => (
                  <li key={i} className="text-sm text-foreground whitespace-pre-line">
                    {s.body}
                    {s.durationMinutes != null && <span className="text-xs text-muted-foreground"> · {s.durationMinutes} min</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
