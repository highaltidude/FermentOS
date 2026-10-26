/**
 * Whether a scheduled backup was missed while FermentOS wasn't running.
 *
 * node-cron never fires a schedule that passed while the process was down, so
 * a Pi or desktop that is off or asleep at 2 AM would otherwise go without
 * backups indefinitely. The boot check uses this to run the missed one.
 *
 * Import-free on purpose, like boilTimer.ts — anything reaching `@workspace/db`
 * throws at load without DATABASE_URL, which CI does not have.
 */

export type BackupSchedule = "none" | "daily" | "weekly";

const HOUR = 60 * 60 * 1000;

/**
 * Longest gap a working schedule leaves between runs, plus slack so a normal
 * 2 AM run is never doubled by a restart shortly before it.
 */
const MAX_GAP_MS: Record<Exclude<BackupSchedule, "none">, number> = {
  daily: 26 * HOUR,
  weekly: 8 * 24 * HOUR,
};

/**
 * `lastRun` is the last backup of any kind, so an on-demand backup also counts
 * as recent. A failed last run is overdue on the same terms, which gives it a
 * retry at the next boot. With no run on record (a fresh install) there is
 * nothing to catch up on; the first backup comes at the scheduled time.
 */
export function isBackupOverdue(
  schedule: BackupSchedule,
  status: { lastRun: string | null },
  now: Date,
): boolean {
  if (schedule === "none" || !status.lastRun) return false;
  const last = Date.parse(status.lastRun);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last > MAX_GAP_MS[schedule];
}
