import { useGetDefaultReadingsShown, useSetDefaultReadingsShown, getGetDefaultReadingsShownQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_READINGS_OPTIONS = [5, 10, 25, 50, 100] as const;

export function DefaultReadingsShownPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useGetDefaultReadingsShown();
  const count = data?.count ?? 5;

  const setMutation = useSetDefaultReadingsShown({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetDefaultReadingsShownQueryKey() });
        toast({ title: "Settings saved" });
      },
    },
  });

  if (isLoading) return <Skeleton className="h-10 rounded-md" />;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 p-3 rounded-md border border-border bg-background">
        <div className="space-y-0.5 flex-1">
          <div className="text-sm font-medium text-foreground">Default readings shown</div>
          <div className="text-xs text-muted-foreground">
            How many fermentation readings to show by default on a brew session page
          </div>
        </div>
        <div className="flex items-center rounded-md border border-border bg-muted/30 overflow-hidden shrink-0">
          {DEFAULT_READINGS_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={setMutation.isPending}
              onClick={() => setMutation.mutate({ data: { count: opt } })}
              className={`px-2.5 py-1.5 text-xs transition-colors ${
                count === opt
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              } ${setMutation.isPending ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
