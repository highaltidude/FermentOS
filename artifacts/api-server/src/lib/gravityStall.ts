/**
 * Whether gravity has been flat for the whole stall window.
 *
 * "Unchanged for 24 hours" means the gravity at the start of the window and
 * every reading since are all within tolerance of each other. That needs a
 * reading from at least 24 hours ago to anchor on: without one, a brew that has
 * only just started reporting would look stalled after two flat readings a
 * minute apart (#168). At least one reading inside the window is required too,
 * so a probe that has stopped reporting is left to device_offline.
 *
 * Import-free on purpose, like alertPolicy.ts, so it stays testable without
 * DATABASE_URL.
 */
export const STALL_WINDOW_MS = 24 * 60 * 60 * 1000;
export const STALL_TOLERANCE = 0.001;

export function isGravityStalled(
  readings: ReadonlyArray<{ gravity: number | null; receivedAt: Date | string }>,
  now: Date = new Date(),
): boolean {
  const cutoff = now.getTime() - STALL_WINDOW_MS;

  let anchor: { at: number; gravity: number } | null = null;
  const window: number[] = [];
  for (const r of readings) {
    if (r.gravity == null) continue;
    const at = new Date(r.receivedAt).getTime();
    if (at > cutoff) window.push(r.gravity);
    else if (!anchor || at > anchor.at) anchor = { at, gravity: r.gravity };
  }

  if (!anchor || window.length === 0) return false;
  const values = [anchor.gravity, ...window];
  return Math.max(...values) - Math.min(...values) < STALL_TOLERANCE;
}
