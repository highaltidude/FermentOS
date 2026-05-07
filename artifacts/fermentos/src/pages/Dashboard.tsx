import { Link } from "wouter";
import { Beer, BookOpen, Package, Thermometer, Droplets, ArrowRight, Plus, Calendar, Play } from "lucide-react";
import {
  useGetDashboardSummary,
  useGetActiveBrews,
  useGetUpcomingBrews,
  useUpdateBrewSession,
  getGetUpcomingBrewsQueryKey,
  getGetActiveBrewsQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-slate-100 text-slate-700 border-slate-200",
  brewing: "bg-amber-100 text-amber-800 border-amber-200",
  fermenting: "bg-green-100 text-green-800 border-green-200",
  conditioning: "bg-blue-100 text-blue-800 border-blue-200",
  packaged: "bg-purple-100 text-purple-800 border-purple-200",
  complete: "bg-gray-100 text-gray-600 border-gray-200",
};

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-md ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// Parse a YYYY-MM-DD date string as local midnight (not UTC midnight) so the
// displayed date never shifts by one day in negative-offset timezones.
function parseLocalDate(d: string): Date {
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, day ?? 1);
}

function formatDate(d: string) {
  return parseLocalDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatScheduleDate(d: string) {
  return parseLocalDate(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDaysUntil(days: number): { label: string; tone: string } {
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, tone: "text-red-600" };
  if (days === 0) return { label: "Today", tone: "text-amber-700 font-medium" };
  if (days === 1) return { label: "Tomorrow", tone: "text-foreground" };
  return { label: `In ${days}d`, tone: "text-muted-foreground" };
}

export default function Dashboard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: activeBrews, isLoading: brewsLoading } = useGetActiveBrews();
  const { data: upcomingBrews, isLoading: upcomingLoading } = useGetUpcomingBrews({ limit: 5 });

  const startBrewMutation = useUpdateBrewSession({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetUpcomingBrewsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetActiveBrewsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        toast({ title: "Brew started" });
      },
      onError: () => toast({ title: "Failed to start brew", variant: "destructive" }),
    },
  });

  const handleStartBrew = (e: React.MouseEvent, brew: { id: number; recipeName: string; brewDate: string; batchSizeGallons: number }) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Start brewing "${brew.recipeName}" now? Today's date will be recorded as the actual brew date and the original planned date (${formatDate(brew.brewDate)}) will be saved for reference.`)) return;
    const today = new Date().toISOString().split("T")[0]!;
    startBrewMutation.mutate({
      id: brew.id,
      data: {
        recipeName: brew.recipeName,
        status: "brewing",
        brewDate: today,
        plannedDate: brew.brewDate,
        batchSizeGallons: brew.batchSizeGallons,
      },
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Brewery Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track your brews, recipes, and ingredients</p>
        </div>
        <Link href="/brew-sessions/new">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Brew Session
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
        ) : (
          <>
            <StatCard label="Active Brews" value={summary?.activeBrewCount ?? 0} icon={Beer} color="bg-amber-50 text-amber-700" />
            <StatCard label="Total Recipes" value={summary?.totalRecipes ?? 0} icon={BookOpen} color="bg-green-50 text-green-700" />
            <StatCard label="Brew Sessions" value={summary?.totalBrewSessions ?? 0} icon={Beer} color="bg-blue-50 text-blue-700" />
            <StatCard label="Ingredients" value={summary?.inventoryItemCount ?? 0} icon={Package} color="bg-purple-50 text-purple-700" />
          </>
        )}
      </div>

      {/* Upcoming Brews */}
      <div className="bg-card border border-card-border rounded-lg">
        <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            Upcoming Brews
          </h2>
          <Link href="/brew-sessions?status=scheduled">
            <span className="text-xs text-primary hover:underline cursor-pointer">View all</span>
          </Link>
        </div>
        <div className="divide-y divide-border">
          {upcomingLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : upcomingBrews && upcomingBrews.length > 0 ? (
            upcomingBrews.map((brew) => {
              const { label, tone } = formatDaysUntil(brew.daysUntilBrew);
              return (
                <div key={brew.id} className="px-4 py-3 hover:bg-muted transition-colors flex items-center gap-3">
                  <Link href={`/brew-sessions/${brew.id}`} className="flex-1 min-w-0">
                    <div className="cursor-pointer">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground truncate">{brew.recipeName}</span>
                        <span className={`text-xs ${tone} ml-2 shrink-0`}>{label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{formatScheduleDate(brew.brewDate)}</span>
                        <span>{brew.batchSizeGallons} gal</span>
                      </div>
                    </div>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={(e) => handleStartBrew(e, brew)}
                    disabled={startBrewMutation.isPending}
                    data-testid={`button-start-brew-${brew.id}`}
                  >
                    <Play className="w-3.5 h-3.5 mr-1" />
                    Start brew
                  </Button>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-8 text-center">
              <Calendar className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">No scheduled brews</p>
              <Link href="/brew-sessions/new">
                <Button variant="outline" size="sm" className="mt-3">Schedule a Brew</Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Active Fermentations */}
        <div className="bg-card border border-card-border rounded-lg">
          <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Active Fermentations</h2>
            <Link href="/brew-sessions?status=fermenting">
              <span className="text-xs text-primary hover:underline cursor-pointer">View all</span>
            </Link>
          </div>
          <div className="divide-y divide-border">
            {brewsLoading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : activeBrews && activeBrews.length > 0 ? (
              activeBrews.map((brew) => (
                <Link key={brew.id} href={`/brew-sessions/${brew.id}`}>
                  <div className="px-4 py-3 hover:bg-muted transition-colors cursor-pointer">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-foreground">{brew.recipeName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[brew.status]}`}>
                        {brew.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Day {brew.daysSinceBrew}</span>
                      {brew.latestTemperature != null && (
                        <span className="flex items-center gap-1">
                          <Thermometer className="w-3 h-3" />
                          {brew.latestTemperature}°F
                        </span>
                      )}
                      {brew.latestGravity != null && (
                        <span className="flex items-center gap-1">
                          <Droplets className="w-3 h-3" />
                          {brew.latestGravity.toFixed(3)}
                          {brew.targetFinalGravity != null && ` / ${brew.targetFinalGravity.toFixed(3)} FG`}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <Beer className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">No active brews</p>
                <Link href="/brew-sessions/new">
                  <Button variant="outline" size="sm" className="mt-3">Start a Brew</Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent Sessions */}
        <div className="bg-card border border-card-border rounded-lg">
          <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent Sessions</h2>
            <Link href="/brew-sessions">
              <span className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </span>
            </Link>
          </div>
          <div className="divide-y divide-border">
            {summaryLoading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : summary?.recentSessions && summary.recentSessions.length > 0 ? (
              summary.recentSessions.map((session) => (
                <Link key={session.id} href={`/brew-sessions/${session.id}`}>
                  <div className="px-4 py-3 hover:bg-muted transition-colors cursor-pointer">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{session.recipeName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[session.status]}`}>
                        {session.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(session.brewDate)}</span>
                      <span>{session.batchSizeGallons} gal</span>
                      {session.originalGravityActual && <span>OG: {session.originalGravityActual.toFixed(3)}</span>}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">No brew sessions yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
