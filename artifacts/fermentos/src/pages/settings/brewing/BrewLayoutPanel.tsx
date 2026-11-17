import { ArrowDown, ArrowUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBrewLayout,
  useSetBrewLayout,
  getGetBrewLayoutQueryKey,
  type BrewLayout,
  type BrewLayoutSection,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { BREW_SECTION_INFO, DEFAULT_BREW_LAYOUT, moveSection } from "@/lib/brewLayout";
import { cn } from "@/lib/utils";

/**
 * The brew session page's cards, top to bottom: move each up or down, or
 * hide it. Every change saves straight away.
 */
export function BrewLayoutPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = getGetBrewLayoutQueryKey();
  const { data: layout, isLoading } = useGetBrewLayout();

  const save = useSetBrewLayout({
    mutation: {
      onMutate: async ({ data }) => {
        await qc.cancelQueries({ queryKey: key });
        const before = qc.getQueryData<BrewLayout>(key);
        qc.setQueryData(key, data);
        return { before };
      },
      onError: (_err, _vars, ctx) => {
        qc.setQueryData(key, ctx?.before);
        toast({ title: "Couldn't save the layout", variant: "destructive" });
      },
      onSuccess: (saved) => qc.setQueryData(key, saved),
    },
  });

  if (isLoading || !layout) return <Skeleton className="h-64 rounded-md" />;

  const hidden = new Set(layout.hidden);
  const update = (next: Partial<BrewLayout>) => save.mutate({ data: { ...layout, ...next } });
  const toggle = (s: BrewLayoutSection) =>
    update({ hidden: hidden.has(s) ? layout.hidden.filter((h) => h !== s) : [...layout.hidden, s] });
  const isDefault =
    layout.hidden.length === 0 && layout.order.every((s, i) => s === DEFAULT_BREW_LAYOUT.order[i]);

  return (
    <div className="space-y-3">
      <ol className="divide-y divide-border rounded-md border border-border bg-background">
        {layout.order.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2 px-3 py-2", hidden.has(s) && "opacity-60")}>
            <div className="flex flex-col shrink-0">
              <button
                type="button"
                onClick={() => update({ order: moveSection(layout.order, s, -1) })}
                disabled={i === 0}
                aria-label={`Move ${BREW_SECTION_INFO[s].label} up`}
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => update({ order: moveSection(layout.order, s, 1) })}
                disabled={i === layout.order.length - 1}
                aria-label={`Move ${BREW_SECTION_INFO[s].label} down`}
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground">{BREW_SECTION_INFO[s].label}</div>
              <div className="text-xs text-muted-foreground">{BREW_SECTION_INFO[s].description}</div>
            </div>
            <Switch
              checked={!hidden.has(s)}
              onChange={() => toggle(s)}
              title={hidden.has(s) ? `Show ${BREW_SECTION_INFO[s].label}` : `Hide ${BREW_SECTION_INFO[s].label}`}
            />
          </li>
        ))}
      </ol>
      <div className="flex justify-end">
        <Button size="sm" variant="outline" disabled={isDefault} onClick={() => update(DEFAULT_BREW_LAYOUT)}>
          Reset to default
        </Button>
      </div>
    </div>
  );
}
