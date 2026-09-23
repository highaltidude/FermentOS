import { useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import {
  useListBeerStyles,
  useCreateBeerStyle,
  useDeleteBeerStyle,
  getListBeerStylesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export function BeerStylesCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: styles, isLoading } = useListBeerStyles();
  const [newStyle, setNewStyle] = useState("");

  const createMutation = useCreateBeerStyle({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBeerStylesQueryKey() });
        setNewStyle("");
        toast({ title: "Style added" });
      },
      onError: () => toast({ title: "Failed to add style", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteBeerStyle({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBeerStylesQueryKey() });
        toast({ title: "Style removed" });
      },
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newStyle.trim();
    if (!name) return;
    createMutation.mutate({ data: { name } });
  };

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 border-b border-card-border">
        <h2 className="text-sm font-semibold text-foreground">Beer Styles</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Define the styles available in the recipe dropdown.
        </p>
      </div>
      <div className="p-4 space-y-3">
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            value={newStyle}
            onChange={(e) => setNewStyle(e.target.value)}
            placeholder="e.g., American IPA"
            className="text-sm"
          />
          <Button type="submit" size="sm" disabled={createMutation.isPending || !newStyle.trim()}>
            <Plus className="w-3.5 h-3.5 mr-1" />Add
          </Button>
        </form>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        ) : styles && styles.length > 0 ? (
          <div className="space-y-1">
            {styles.map((style) => (
              <div
                key={style.id}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-border bg-background group hover:border-primary/30 transition-colors"
              >
                <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                <span className="flex-1 text-sm text-foreground">{style.name}</span>
                <button
                  onClick={() => {
                    if (confirm(`Remove "${style.name}"?`)) {
                      deleteMutation.mutate({ id: style.id });
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No styles yet — add your first one above.
          </p>
        )}
      </div>
    </div>
  );
}
