/**
 * Turns a brew's relay runs into minutes of heating and cooling per hour or
 * per day, in the browser's local time (so a day is the brewer's day, and DST
 * days come out 23 or 25 hours long).
 */

export type RelayUsageUnit = "hour" | "day";

export type RelayRunLike = { mode: "heat" | "cool" | null; startedAt: string; endedAt: string | null };

export type RelayUsageBucket = {
  start: number;
  end: number;
  heatMin: number;
  coolMin: number;
  /** Runs with no mode: a schedule flow, by hand, or the Shelly app. */
  otherMin: number;
};

const HOUR_MS = 3_600_000;

/** Local midnight of the day `t` falls in. */
export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight of the day after the one `t` falls in. */
export function nextDay(t: number): number {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Bucket edges covering [from, to): local days, or real hours (so a DST change adds or drops one). */
export function bucketEdges(unit: RelayUsageUnit, from: number, to: number): number[] {
  const edges: number[] = [];
  if (unit === "day") {
    for (let t = startOfDay(from); t < to; t = nextDay(t)) edges.push(t);
    edges.push(edges.length > 0 ? nextDay(edges[edges.length - 1]!) : nextDay(from));
  } else {
    const first = new Date(from);
    first.setMinutes(0, 0, 0);
    for (let t = first.getTime(); t < to; t += HOUR_MS) edges.push(t);
    edges.push(edges.length > 0 ? edges[edges.length - 1]! + HOUR_MS : first.getTime() + HOUR_MS);
  }
  return edges;
}

/** Minutes each mode ran in each bucket. A run with no end is counted up to `now`. */
export function bucketRelayRuns(
  runs: RelayRunLike[],
  unit: RelayUsageUnit,
  from: number,
  to: number,
  now: number,
): RelayUsageBucket[] {
  const edges = bucketEdges(unit, from, to);
  const buckets: RelayUsageBucket[] = edges.slice(0, -1).map((start, i) => ({
    start, end: edges[i + 1]!, heatMin: 0, coolMin: 0, otherMin: 0,
  }));
  for (const run of runs) {
    const s = Date.parse(run.startedAt);
    const e = run.endedAt ? Date.parse(run.endedAt) : now;
    if (!(e > s)) continue;
    const key = run.mode === "heat" ? "heatMin" : run.mode === "cool" ? "coolMin" : "otherMin";
    for (const b of buckets) {
      if (b.end <= s) continue;
      if (b.start >= e) break;
      b[key] += (Math.min(e, b.end) - Math.max(s, b.start)) / 60_000;
    }
  }
  return buckets;
}

/** Total minutes per mode across buckets. */
export function totalUsage(buckets: RelayUsageBucket[]): { heatMin: number; coolMin: number; otherMin: number } {
  return buckets.reduce(
    (t, b) => ({ heatMin: t.heatMin + b.heatMin, coolMin: t.coolMin + b.coolMin, otherMin: t.otherMin + b.otherMin }),
    { heatMin: 0, coolMin: 0, otherMin: 0 },
  );
}

/** "45 min", "3 h 20 min". */
export function formatRunTime(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}
