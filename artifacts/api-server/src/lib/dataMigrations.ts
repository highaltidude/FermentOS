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

  // The "planned" status was renamed to "scheduled" to better reflect that the
  // brew has not actually started yet. Update any pre-rename rows so the new
  // app code (which only knows about "scheduled") doesn't render unknown
  // statuses with broken styling.
  const sessions = await db.execute(
    sql`UPDATE brew_sessions SET status = 'scheduled' WHERE status = 'planned'`,
  );
  const log = await db.execute(
    sql`UPDATE brew_session_status_log SET status = 'scheduled' WHERE status = 'planned'`,
  );
  const sessionCount = (sessions as { rowCount?: number }).rowCount ?? 0;
  const logCount = (log as { rowCount?: number }).rowCount ?? 0;
  if (sessionCount > 0 || logCount > 0) {
    logger.info(
      { sessions: sessionCount, statusLog: logCount },
      "Migrated legacy 'planned' → 'scheduled' rows",
    );
  }
}
