/**
 * Whether a scheduled backup was missed while FermentOS wasn't running.
 *
 * node-cron never fires a schedule that passed while the process was down, so
 * a Pi or desktop that is off or asleep at 2 AM would otherwise go without
 * backups indefinitely. The catch-up check uses this to run the missed one.
 *
 * Import-free on purpose, like boilTimer.ts — anything reaching `@workspace/db`
 * throws at load without DATABASE_URL, which CI does not have.
 */

export type BackupSchedule = "none" | "daily" | "weekly";

/** The hour the scheduled run is due, matching cronExpression in services/backup.ts. */
const SLOT_HOUR = 2;

/**
 * The most recent time a scheduled backup was due, at or before `now`: 2 AM
 * every day, or 2 AM on Sunday. Local time, like node-cron's own schedule.
 */
export function lastScheduledSlot(schedule: BackupSchedule, now: Date): Date | null {
  if (schedule === "none") return null;
  const slot = new Date(now);
  slot.setHours(SLOT_HOUR, 0, 0, 0);
  if (schedule === "weekly") slot.setDate(slot.getDate() - slot.getDay());
  while (slot.getTime() > now.getTime()) {
    slot.setDate(slot.getDate() - (schedule === "weekly" ? 7 : 1));
    // Stepping across a DST change keeps the date but can shift the hour.
    slot.setHours(SLOT_HOUR, 0, 0, 0);
  }
  return slot;
}

/**
 * True when no backup has finished since the most recent scheduled slot.
 * `lastRun` is written when a run finishes, so the slot's own run always lands
 * after it. It is the last backup of any kind, so an on-demand backup taken
 * after the slot also counts. With no run on record (a fresh install) there is
 * nothing to catch up on; the first backup comes at the scheduled time.
 */
export function isBackupOverdue(
  schedule: BackupSchedule,
  status: { lastRun: string | null },
  now: Date,
): boolean {
  const slot = lastScheduledSlot(schedule, now);
  if (!slot || !status.lastRun) return false;
  const last = Date.parse(status.lastRun);
  if (Number.isNaN(last)) return true;
  return last < slot.getTime();
}
