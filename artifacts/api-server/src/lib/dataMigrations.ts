import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

/**
 * One-shot data migrations that need to run after a deploy. Each step is
 * idempotent so it's safe to re-run on every boot.
 */
export async function migrateLegacyStatuses(): Promise<void> {
  // Self-healing schema patch: the standard update path runs `drizzle-kit
  // push`, but home-lab users who only `git pull` + restart (or who use the
  // in-app updater on a stale snapshot) would otherwise crash on missing
  // column errors. `IF NOT EXISTS` makes this safely idempotent.
  await db.execute(
    sql`ALTER TABLE brew_sessions ADD COLUMN IF NOT EXISTS planned_date date`,
  );

  // ── Fermentation reading source column (v3) ───────────────────────────
  // Add source column with a default of 'manual', then backfill any rows
  // that were mirrored from iSpindel (identified by the old '[iSpindel]'
  // note prefix written by the pre-source-column mirroring code).
  await db.execute(
    sql`ALTER TABLE fermentation_readings ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'`,
  );
  const backfilled = await db.execute(
    sql`UPDATE fermentation_readings SET source = 'ispindel' WHERE source = 'manual' AND notes LIKE '[iSpindel]%'`,
  );
  const backfilledCount = (backfilled as { rowCount?: number }).rowCount ?? 0;
  if (backfilledCount > 0) {
    logger.info({ rows: backfilledCount }, "Backfilled fermentation_readings.source = ispindel for legacy iSpindel mirrors");
  }

  // ── Lifecycle simplification (v2) ─────────────────────────────────────
  // Old stages: planned → scheduled → brewing → fermenting → conditioning
  //             → packaged → complete
  // New stages: brew_day → fermenting → conditioning → packaged
  //
  // Mapping:
  //   planned   → brew_day  (was a draft/scheduled state, treated as not-yet-started)
  //   scheduled → brew_day  (same)
  //   brewing   → brew_day  (was the active brew-day stage, now renamed)
  //   complete  → packaged  (terminal state consolidated into packaged)
  //   fermenting, conditioning, packaged — unchanged
  const sessionsBrew = await db.execute(
    sql`UPDATE brew_sessions SET status = 'brew_day' WHERE status IN ('planned', 'scheduled', 'brewing')`,
  );
  const logBrew = await db.execute(
    sql`UPDATE brew_session_status_log SET status = 'brew_day' WHERE status IN ('planned', 'scheduled', 'brewing')`,
  );
  const sessionsComplete = await db.execute(
    sql`UPDATE brew_sessions SET status = 'packaged' WHERE status = 'complete'`,
  );
  const logComplete = await db.execute(
    sql`UPDATE brew_session_status_log SET status = 'packaged' WHERE status = 'complete'`,
  );

  const brewCount = ((sessionsBrew as { rowCount?: number }).rowCount ?? 0) +
    ((logBrew as { rowCount?: number }).rowCount ?? 0);
  const completeCount = ((sessionsComplete as { rowCount?: number }).rowCount ?? 0) +
    ((logComplete as { rowCount?: number }).rowCount ?? 0);

  if (brewCount > 0) {
    logger.info({ rows: brewCount }, "Migrated legacy planned/scheduled/brewing → brew_day");
  }
  if (completeCount > 0) {
    logger.info({ rows: completeCount }, "Migrated legacy complete → packaged");
  }
}
