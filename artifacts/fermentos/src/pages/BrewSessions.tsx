import { useState } from "react";
import { Link } from "wouter";
import { Plus, Beer, ChevronRight } from "lucide-react";
import { useListBrewSessions } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-slate-100 text-slate-700 border-slate-200",
  brewing: "bg-amber-100 text-amber-800 border-amber-200",
  fermenting: "bg-green-100 text-green-800 border-green-200",
  conditioning: "bg-blue-100 text-blue-800 border-blue-200",
  packaged: "bg-purple-100 text-purple-800 border-purple-200",
  complete: "bg-gray-100 text-gray-600 border-gray-200",
};

// Filter pills include "scheduled" as a separate bucket so the user can find
// brews they've drafted but not started. The actual stage progression bar (in
// BrewSessionDetail) excludes it because it's a pre-brew state, not a stage.
const STATUS_ORDER = ["scheduled", "brewing", "fermenting", "conditioning", "packaged", "complete"];

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function BrewSessions() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const { data: sessions, isLoading } = useListBrewSessions(statusFilter ? { status: statusFilter as any } : {});

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Brew Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{sessions?.length ?? 0} recorded sessions</p>
        </div>
        <Link href="/brew-sessions/new">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Session
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setStatusFilter(undefined)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!statusFilter ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}
        >All</button>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s === statusFilter ? undefined : s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}
          >{s}</button>
        ))}
      </div>

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
        ) : sessions && sessions.length > 0 ? (
          sessions.map((session) => (
            <Link key={session.id} href={`/brew-sessions/${session.id}`}>
              <div className="bg-card border border-card-border rounded-lg px-4 py-3.5 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer flex items-center gap-4">
                <div className="p-2 rounded-md bg-muted">
                  <Beer className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground truncate">{session.recipeName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${STATUS_COLORS[session.status]}`}>
                      {session.status}
                    </span>
                    {session.rating && (
                      <span className="text-xs text-muted-foreground ml-auto">{"★".repeat(session.rating)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatDate(session.brewDate)}</span>
                    <span>{session.batchSizeGallons} gal</span>
                    {session.originalGravityActual && <span>OG: {session.originalGravityActual.toFixed(3)}</span>}
                    {session.finalGravityActual && <span>FG: {session.finalGravityActual.toFixed(3)}</span>}
                    {session.abvActual && <span>{session.abvActual.toFixed(1)}% ABV</span>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ))
        ) : (
          <div className="bg-card border border-card-border rounded-lg py-16 text-center">
            <Beer className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-foreground mb-1">No brew sessions yet</p>
            <p className="text-xs text-muted-foreground mb-4">Log your first brew day</p>
            <Link href="/brew-sessions/new">
              <Button size="sm"><Plus className="w-4 h-4 mr-1.5" />Log a Brew</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
