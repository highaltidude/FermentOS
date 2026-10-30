import { useQueryClient } from "@tanstack/react-query";
import { Check, Leaf, Undo2 } from "lucide-react";
import {
  useGetBrewSessionDryHops,
  getGetBrewSessionDryHopsQueryKey,
  useMarkDryHopAdded,
  useUnmarkDryHopAdded,
  type DryHopScheduleItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn, getErrorMessage } from "@/lib/utils";
import { formatDateTimeShort } from "@/lib/format";

/**
 * The recipe's dry hops for this brew, counted in days from when the batch
 * entered conditioning. A due addition keeps sending reminders until it is
 * marked added here; the server's alert monitor resolves it on its next tick.
 * Renders nothing when the recipe has no scheduled dry hops.
 */
export function DryHopCard({ brewSessionId }: { brewSessionId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const queryKey = getGetBrewSessionDryHopsQueryKey(brewSessionId);

  const { data: schedule } = useGetBrewSessionDryHops(brewSessionId, {
    // Polled so an addition flips to due while the page is open.
    query: { enabled: !!brewSessionId, refetchInterval: 60_000, queryKey },
  });

  const onSuccess = (next: DryHopScheduleItem[]) => qc.setQueryData(queryKey, next);
  const onError = (err: unknown) =>
    toast({ title: "Failed to update dry hop", description: getErrorMessage(err), variant: "destructive" });
  const mark = useMarkDryHopAdded({ mutation: { onSuccess, onError } });
  const unmark = useUnmarkDryHopAdded({ mutation: { onSuccess, onError } });
  const pending = mark.isPending || unmark.isPending;

  if (!schedule || schedule.length === 0) return null;

  const due = schedule.filter((s) => s.status === "due");

  return (
    <div className={cn(
      "bg-card border rounded-lg",
      due.length > 0 ? "border-amber-500/50" : "border-card-border",
    )}>
      <div className="px-4 py-3 border-b border-card-border flex items-center gap-2">
        <Leaf className="w-4 h-4 text-green-600 dark:text-green-400" />
        <h2 className="text-sm font-semibold text-foreground">Dry Hops</h2>
      </div>

      {due.length > 0 && (
        <div className="mx-4 mt-3 px-3 py-2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm">
          Time to dry hop: {due.map((d) => `${d.amount} ${d.unit} ${d.name}`).join(", ")}.
          Reminders repeat until each one is marked added.
        </div>
      )}

      <div className="p-4 space-y-1">
        {schedule.map((item) => (
          <div
            key={item.ingredientId}
            className={cn(
              "flex items-center gap-3 text-sm py-1.5 px-2 rounded",
              item.status === "due" && "bg-amber-500/5",
            )}
          >
            <span className="text-xs font-medium text-muted-foreground w-12 shrink-0">Day {item.day}</span>
            <div className="flex-1 min-w-0">
              <span className={cn("font-medium", item.status === "added" && "line-through text-muted-foreground")}>
                {item.name}
              </span>
              <span className="text-muted-foreground ml-2">{item.amount} {item.unit}</span>
              <p className="text-xs text-muted-foreground">
                {item.status === "added" ? "Added"
                  : item.dueAt ? `${item.status === "due" ? "Due since" : "Due"} ${formatDateTimeShort(item.dueAt)}`
                  : "Scheduled once the batch enters conditioning"}
              </p>
            </div>
            {item.status === "added" ? (
              <Button
                size="sm" variant="ghost" disabled={pending}
                onClick={() => unmark.mutate({ id: brewSessionId, ingredientId: item.ingredientId })}
              >
                <Undo2 className="w-3.5 h-3.5 mr-1" />Undo
              </Button>
            ) : (
              <Button
                size="sm" variant={item.status === "due" ? "default" : "outline"} disabled={pending}
                onClick={() => mark.mutate({ id: brewSessionId, ingredientId: item.ingredientId })}
              >
                <Check className="w-3.5 h-3.5 mr-1" />Mark added
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
