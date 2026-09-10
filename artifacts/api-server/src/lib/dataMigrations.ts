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

  // ── Tasting scorecard (v4) ────────────────────────────────────────────
  // Same self-healing rationale as above, then a one-time rescale of the
  // legacy 1-5 star rating onto the new 1-10 overall score. The rescale is a
  // separate column rather than an in-place UPDATE precisely so it can be
  // guarded: `overall_score IS NULL` can't be satisfied twice, whereas an
  // in-place `rating = rating * 2` would re-double a legitimate new score on
  // the next boot.
  for (const [column, type] of [
    ["appearance_aroma_score", "integer"],
    ["flavor_balance_score", "integer"],
    ["mouthfeel_score", "integer"],
    ["overall_score", "integer"],
    ["off_flavors", "text[]"],
    ["brew_again", "text"],
    ["rated_at", "timestamp with time zone"],
  ] as const) {
    await db.execute(
      sql`ALTER TABLE brew_sessions ADD COLUMN IF NOT EXISTS ${sql.raw(column)} ${sql.raw(type)}`,
    );
  }

  // The legacy `rating` column is dropped here rather than by drizzle-kit.
  // Plain `push` — what entrypoint.sh, update.sh and install.sh all run —
  // prompts before a data-loss statement and, with no TTY, takes the default
  // and aborts, exiting 0 without dropping anything. So the drop has to be
  // explicit, and it has to come after the rescale: someone upgrading straight
  // from a pre-1.4.0 release has never run the backfill, and would otherwise
  // lose their stars without them ever reaching overall_score.
  //
  // The whole block can go once every supported install has booted a release
  // containing it — at that point no database still has the column.
  const ratingColumn = await db.execute(
    sql`SELECT 1 FROM information_schema.columns WHERE table_name = 'brew_sessions' AND column_name = 'rating'`,
  );
  if (((ratingColumn as { rowCount?: number }).rowCount ?? 0) > 0) {
    // LEAST(..., 10) because the old rating column carried no bounds — a stray
    // value above 5 would otherwise rescale to an out-of-range score.
    const rescaled = await db.execute(
      sql`UPDATE brew_sessions SET overall_score = LEAST(rating * 2, 10), rated_at = COALESCE(rated_at, updated_at) WHERE rating IS NOT NULL AND overall_score IS NULL`,
    );
    const rescaledCount = (rescaled as { rowCount?: number }).rowCount ?? 0;
    if (rescaledCount > 0) {
      logger.info({ rows: rescaledCount }, "Rescaled legacy 1-5 brew_sessions.rating onto 1-10 overall_score");
    }

    await db.execute(sql`ALTER TABLE brew_sessions DROP COLUMN IF EXISTS rating`);
    logger.info("Dropped legacy brew_sessions.rating column");
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
