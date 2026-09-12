import { pool } from "@workspace/db";
import { classifyTables, type BackupAuditResult } from "../lib/backupAudit";

/**
 * The database side of the backup coverage audit.
 *
 * The classification itself lives in lib/backupAudit.ts and is kept free of
 * this file's `@workspace/db` import, which throws at module load when
 * DATABASE_URL is unset — that import is what makes this module unusable
 * without a live database, and why the pure logic is testable and this is not.
 *
 * Lives in services/ rather than a route because two routes need it: the audit
 * endpoint reports it, and POST /admin/update refuses to run below 100%.
 */

export { classifyTables, type BackupAuditResult } from "../lib/backupAudit";

/** Read the live table list and classify it. */
export async function computeBackupAudit(): Promise<BackupAuditResult> {
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );
  return classifyTables(result.rows.map((r) => r.table_name));
}
