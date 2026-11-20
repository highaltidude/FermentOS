/** Cumulative CPU time counters from the first line of /proc/stat. */
export type CpuTimes = { total: number; idle: number };

/** Parses the aggregate "cpu" line of /proc/stat; null when it doesn't look like one. */
export function parseProcStat(text: string): CpuTimes | null {
  const line = text.split("\n")[0] ?? "";
  if (!line.startsWith("cpu")) return null;
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  if (parts.length < 4 || parts.some((n) => !Number.isFinite(n))) return null;
  // idle + iowait
  const idle = parts[3]! + (parts[4] ?? 0);
  const total = parts.reduce((s, v) => s + v, 0);
  return { total, idle };
}

/** Busy share of CPU time between two snapshots, 0–100; null when no time passed. */
export function cpuPercentBetween(earlier: CpuTimes, later: CpuTimes): number | null {
  const dTotal = later.total - earlier.total;
  const dIdle = later.idle - earlier.idle;
  if (dTotal <= 0) return null;
  return Math.min(100, Math.max(0, Math.round(((dTotal - dIdle) / dTotal) * 100)));
}
