import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateRecipeIngredient, getGetRecipeQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";

/**
 * "@ 15 min" on a boil or whirlpool ingredient, editable in place. Ingredients
 * have no edit form, and without a time the boil timer cannot schedule an
 * addition, so this is how an existing recipe gets its schedule.
 */
export function IngredientTiming({ recipeId, ingredientId, use, timingMinutes }: {
  recipeId: number; ingredientId: number; use: string; timingMinutes: number | null | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();
  const update = useUpdateRecipeIngredient({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(recipeId) }); setEditing(false); },
      onError: (err: unknown) =>
        toast({ title: "Failed to save time", description: getErrorMessage(err), variant: "destructive" }),
    },
  });

  const save = () => {
    const next = value.trim() === "" ? null : Math.max(0, Math.round(Number(value)));
    if (next !== null && !Number.isFinite(next)) return;
    if (next === (timingMinutes ?? null)) { setEditing(false); return; }
    update.mutate({ id: ingredientId, data: { timingMinutes: next } });
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 ml-1">
        <input
          type="number" min="0" step="1" inputMode="numeric" autoFocus
          aria-label={use === "whirlpool" ? "Whirlpool minutes" : "Minutes left in boil"}
          className="w-16 text-sm border border-border rounded px-1.5 py-0.5 bg-background text-foreground"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          onBlur={save}
          disabled={update.isPending}
        />
        <span className="text-muted-foreground text-xs">min</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setValue(timingMinutes != null ? String(timingMinutes) : ""); setEditing(true); }}
      className={`ml-1 hover:underline ${timingMinutes != null ? "text-muted-foreground" : "text-primary text-xs"}`}
      title={use === "whirlpool" ? "Set whirlpool time" : "Set minutes left in the boil when this goes in"}
    >
      {timingMinutes != null ? `@ ${timingMinutes} min` : "+ time"}
    </button>
  );
}
