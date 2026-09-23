/**
 * Reads the stored alert-type selection back into a list.
 *
 * Absent and empty mean different things. A key that was never saved means a
 * fresh install, which gets every type. An empty string is what saving with
 * every box unchecked writes, and has to come back as an empty list — treating
 * it as unset silently switched all the alerts back on.
 *
 * Import-free like notifyIntervals.ts: services/notifications.ts reaches
 * `@workspace/db`, which throws at load without DATABASE_URL, as CI has none.
 */
export function parseNotifyTypes<T extends string>(
  raw: string | undefined,
  valid: readonly T[],
  defaults: readonly T[],
): T[] {
  if (raw === undefined) return [...defaults];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t): t is T => (valid as readonly string[]).includes(t));
}
