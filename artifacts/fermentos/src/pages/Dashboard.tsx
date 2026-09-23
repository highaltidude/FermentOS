import { Link } from "wouter";
import { Beer, BookOpen, Package, Thermometer, Droplets, ArrowRight, Plus, Flame } from "lucide-react";
import {
  useGetDashboardSummary,
  useGetActiveBrews,
  useListBrewSessions,
  getListBrewSessionsQueryKey,
  useGetHaStatus,
  getGetHaStatusQueryKey,
} from "@workspace/api-client-react";
import { boilPhase, boilRemainingMs, formatCountdown } from "@/lib/boil";
import { STATUS_LABELS } from "@/lib/brewStatus";
import { formatDate } from "@/lib/format";
import { estimateAbv } from "@/lib/brewMath";
import { useNow } from "@/hooks/useNow";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreBadge } from "@/components/ui/score-picker";
import { BrewStatusBadge } from "@/components/BrewStatusBadge";

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

function formatInsightStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Brew-day shortcut to the boil timer. Hidden unless something is on brew day,
 * and shows a live countdown while a boil runs so the dashboard doubles as a
 * glanceable timer.
 */
function BoilCard() {
  const { data: sessions } = useListBrewSessions(
    { status: "brew_day" },
    { query: { refetchInterval: 30_000, queryKey: getListBrewSessionsQueryKey({ status: "brew_day" }) } },
  );
  const anyRunning = !!sessions?.some((s) => boilPhase(s) === "running");
  const now = useNow(anyRunning, 1000);

  if (!sessions?.length) return null;

  return (
    <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg divide-y divide-orange-500/20">
      {sessions.map((s) => {
        const phase = boilPhase(s);
        return (
          <Link key={s.id} href={`/brew-sessions/${s.id}/boil`}>
            <div className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-orange-500/5">
              <Flame className="w-5 h-5 text-orange-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{s.recipeName}</p>
                <p className="text-xs text-muted-foreground">
                  {phase === "idle" && "Brew day — ready to boil"}
                  {phase === "running" && "Boiling"}
                  {phase === "paused" && "Boil paused"}
                  {phase === "ended" && "Boil complete"}
                </p>
              </div>
              {phase === "running" || phase === "paused" ? (
                <span className="font-mono tabular-nums text-lg font-bold text-foreground shrink-0">
                  {formatCountdown(boilRemainingMs(s, now))}
                </span>
              ) : phase === "idle" ? (
                <Button size="sm" className="shrink-0">Start Boil</Button>
              ) : null}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: activeBrews, isLoading: brewsLoading } = useGetActiveBrews();

  const { data: sensors = [] } = useGetHaStatus({
    query: { refetchInterval: 60_000, queryKey: getGetHaStatusQueryKey() },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">{summary?.breweryName || "Brewery Overview"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track your brews, recipes, and ingredients</p>
        </div>
        <Link href="/brew-sessions/new">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Brew Session
          </Button>
        </Link>
      </div>

      <BoilCard />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
        ) : (
          <>
            <StatCard label="Active Brews" value={summary?.activeBrewCount ?? 0} icon={Beer} color="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" />
            <StatCard label="Total Recipes" value={summary?.totalRecipes ?? 0} icon={BookOpen} color="bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400" />
            <StatCard label="Brew Sessions" value={summary?.totalBrewSessions ?? 0} icon={Beer} color="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" />
            <StatCard label="Ingredients" value={summary?.inventoryItemCount ?? 0} icon={Package} color="bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400" />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Active Brews */}
        <div className="bg-card border border-card-border rounded-lg">
          <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Active Brews</h2>
            <Link href="/brew-sessions">
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
                      <BrewStatusBadge status={brew.status} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Day {brew.daysSinceBrew}</span>
                      {brew.daysInCurrentStage != null && (
                        <span className="text-muted-foreground">
                          {STATUS_LABELS[brew.status] ?? brew.status} for {brew.daysInCurrentStage}d
                        </span>
                      )}
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
                      {brew.originalGravityActual != null && brew.latestGravity != null && (
                        <span>
                          Est. ABV <span className="text-foreground">{estimateAbv(brew.originalGravityActual, brew.latestGravity).toFixed(1)}%</span>
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

        {/* Top Rated */}
        <div className="bg-card border border-card-border rounded-lg">
          <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Top Rated</h2>
            <Link href="/brew-sessions">
              <span className="text-xs text-primary hover:underline cursor-pointer">View all</span>
            </Link>
          </div>
          <div className="divide-y divide-border">
            {summaryLoading ? (
              <div className="p-4 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : summary?.topRatedBrews && summary.topRatedBrews.length > 0 ? (
              summary.topRatedBrews.map((brew) => (
                <Link key={brew.id} href={`/brew-sessions/${brew.id}`}>
                  <div className="px-4 py-3 hover:bg-muted transition-colors cursor-pointer flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{brew.recipeName}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(brew.brewDate)}</div>
                    </div>
                    <ScoreBadge value={brew.overallScore} />
                  </div>
                </Link>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <Beer className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">No rated batches yet</p>
                <p className="text-xs text-muted-foreground mt-1">Rate a packaged batch to see it here</p>
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
                      <BrewStatusBadge status={session.status} />
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

      {sensors.length > 0 && (
        <div className="bg-card border border-card-border rounded-lg">
          <div className="px-4 py-3 border-b border-card-border">
            <h2 className="text-sm font-semibold text-foreground">Live Sensors</h2>
          </div>
          <div className="divide-y divide-border">
            {sensors.map((sensor) => {
              const dot =
                sensor.connectionStatus === "connected"
                  ? "bg-green-500"
                  : sensor.connectionStatus === "warning"
                  ? "bg-yellow-400"
                  : "bg-red-500";
              const card = (
                <div className="px-4 py-3 hover:bg-muted transition-colors cursor-pointer">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                      <span className="text-sm font-medium text-foreground">{sensor.deviceName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {sensor.assignedBrewName ?? "Unassigned"}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {sensor.latestReading?.gravity != null && (
                      <span className="flex items-center gap-1">
                        <Droplets className="w-3 h-3" />
                        {sensor.latestReading.gravity.toFixed(3)}
                      </span>
                    )}
                    {sensor.latestReading?.temperature != null && (
                      <span className="flex items-center gap-1">
                        <Thermometer className="w-3 h-3" />
                        {sensor.latestReading.temperature}
                        {sensor.latestReading.temperatureUnit ?? "°F"}
                      </span>
                    )}
                    {sensor.latestReading?.batteryPercentEstimate != null && (
                      <span>{sensor.latestReading.batteryPercentEstimate}%</span>
                    )}
                    {sensor.insights?.fermentationStatus && (
                      <span>{formatInsightStatus(sensor.insights.fermentationStatus)}</span>
                    )}
                  </div>
                </div>
              );
              return sensor.assignedBrewSessionId ? (
                <Link key={sensor.deviceId} href={`/brew-sessions/${sensor.assignedBrewSessionId}`}>
                  {card}
                </Link>
              ) : (
                <div key={sensor.deviceId}>{card}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
