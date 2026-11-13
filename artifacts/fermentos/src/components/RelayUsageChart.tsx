import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ChevronLeft, ChevronRight, Flame, Snowflake } from "lucide-react";
import { useGetBrewRelayRuns, getGetBrewRelayRunsQueryKey } from "@workspace/api-client-react";
import { bucketRelayRuns, formatRunTime, nextDay, startOfDay, totalUsage, type RelayUsageUnit } from "@/lib/relayUsage";
import { cn } from "@/lib/utils";

const HEAT = "#f97316";
const COOL = "#0ea5e9";
const OTHER = "#94a3b8";

const SERIES = { heatMin: "Heating", coolMin: "Cooling", otherMin: "Other" } as const;

/**
 * How long the relays ran heating and cooling this brew: minutes per day
 * across the brew, or per hour for one day. Hidden when there are no relays.
 */
export function RelayUsageChart({ brewSessionId, active }: { brewSessionId: number; active: boolean }) {
  const { data } = useGetBrewRelayRuns(brewSessionId, {
    query: { queryKey: getGetBrewRelayRunsQueryKey(brewSessionId), refetchInterval: active ? 60_000 : false },
  });
  const [unit, setUnit] = useState<RelayUsageUnit>("day");
  // The day the hourly view shows, as local midnight; null = the latest day.
  const [day, setDay] = useState<number | null>(null);

  const runs = data?.runs ?? [];
  const now = Date.now();
  const firstMs = runs.length > 0 ? Date.parse(runs[0]!.startedAt) : now;
  // A finished brew's chart stops at its last run rather than stretching to today.
  const lastMs = active || runs.length === 0
    ? now
    : Math.max(...runs.map((r) => (r.endedAt ? Date.parse(r.endedAt) : now)));
  const lastDay = startOfDay(lastMs);
  const shownDay = day ?? lastDay;

  const buckets = useMemo(() => {
    if (unit === "day") return bucketRelayRuns(runs, "day", firstMs, lastMs, now);
    return bucketRelayRuns(runs, "hour", shownDay, nextDay(shownDay) - 1, now);
  }, [runs, unit, firstMs, lastMs, shownDay]);
  const totals = totalUsage(buckets);

  // Nothing to show: no relays at all, or a finished brew that never used one.
  if (!data || (runs.length === 0 && (!data.hasRelays || !active))) return null;

  const chartData = buckets.map((b) => ({
    ...b,
    label: unit === "day"
      ? new Date(b.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : new Date(b.start).toLocaleTimeString(undefined, { hour: "numeric" }),
    heatMin: round(b.heatMin),
    coolMin: round(b.coolMin),
    otherMin: round(b.otherMin),
  }));
  const hasOther = totals.otherMin > 0;
  const step = (dir: -1 | 1) => {
    const d = new Date(shownDay);
    d.setDate(d.getDate() + dir);
    setDay(Math.min(Math.max(startOfDay(d.getTime()), startOfDay(firstMs)), lastDay));
  };

  return (
    <div className="bg-card border border-card-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <h2 className="text-sm font-semibold text-foreground">Heating &amp; cooling</h2>
        <div className="inline-flex rounded-md border border-border overflow-hidden text-xs" role="group" aria-label="Group by">
          {(["hour", "day"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => setUnit(u)}
              className={cn("px-3 py-1 capitalize", unit === u ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {runs.length === 0 ? (
        <p className="text-xs text-muted-foreground mt-2">
          No relay activity recorded for this brew yet. Run time is counted from this version on, whenever a temperature flow
          following one of this brew's sensors switches a relay.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <p className="text-xs text-muted-foreground">
              <Flame className="w-3 h-3 inline mr-0.5 text-orange-500" />{formatRunTime(totals.heatMin)} heating
              <span className="mx-1.5">·</span>
              <Snowflake className="w-3 h-3 inline mr-0.5 text-sky-500" />{formatRunTime(totals.coolMin)} cooling
              {hasOther && <><span className="mx-1.5">·</span>{formatRunTime(totals.otherMin)} other</>}
              <span className="ml-1.5">{unit === "day" ? "this brew" : "this day"}</span>
            </p>
            {unit === "hour" && (
              <div className="flex items-center gap-1 text-xs">
                <button type="button" aria-label="Previous day" className="p-1 rounded hover:bg-muted disabled:opacity-30"
                  disabled={shownDay <= startOfDay(firstMs)} onClick={() => step(-1)}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-foreground min-w-[6.5rem] text-center">
                  {new Date(shownDay).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <button type="button" aria-label="Next day" className="p-1 rounded hover:bg-muted disabled:opacity-30"
                  disabled={shownDay >= lastDay} onClick={() => step(1)}>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={36}
                allowDecimals={false}
                // A day's minutes read better as hours.
                tickFormatter={(v: number) => (unit === "day" ? `${Math.round((v / 60) * 10) / 10}h` : `${v}m`)}
              />
              <Tooltip
                cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  padding: "8px 12px",
                }}
                labelStyle={{ color: "var(--color-muted-foreground)", marginBottom: 4 }}
                formatter={(value: number, key: string, item: { payload?: { start: number; end: number } }) => {
                  const span = item.payload ? (item.payload.end - item.payload.start) / 60_000 : 0;
                  const duty = span > 0 ? ` (${Math.round((value / span) * 100)}%)` : "";
                  return [`${formatRunTime(value)}${duty}`, SERIES[key as keyof typeof SERIES] ?? key];
                }}
              />
              <Bar dataKey="heatMin" stackId="run" fill={HEAT} name="heatMin" />
              <Bar dataKey="coolMin" stackId="run" fill={COOL} name="coolMin" />
              {hasOther && <Bar dataKey="otherMin" stackId="run" fill={OTHER} name="otherMin" />}
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

const round = (n: number) => Math.round(n * 10) / 10;
