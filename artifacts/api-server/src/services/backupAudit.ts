import { pool } from "@workspace/db";
import { BACKUP_REGISTRY, EXCLUDED_TABLES } from "@workspace/db/backup-registry";

/**
 * Backup coverage audit.
 *
 * Answers one question: is every table in the database accounted for in
 * lib/db/src/backup-registry.ts? A table nobody has classified is the signal
 * that a schema change shipped without anyone deciding whether it holds real
 * user data.
 *
 * Note what this does *not* mean. EXCLUDED_TABLES is a classification, not a
 * pg_dump filter — the dump is taken with no --exclude-table, so an "excluded"
 * table is still present in the backup file. Excluded means "not required to be
 * registered", not "kept out of backups".
 *
 * Lives here rather than in the route because two routes need it: the audit
 * endpoint reports it, and POST /admin/update refuses to run below 100%.
 */

export type BackupAuditResult = {
  totalTables: number;
  backedUp: string[];
  excluded: string[];
  /** Tables present in the DB but absent from BACKUP_REGISTRY and EXCLUDED_TABLES. */
  missing: string[];
  /** Tables in BACKUP_REGISTRY that don't exist in the actual DB (stale entries). */
  orphaned: string[];
  coveragePercent: number;
};

/**
 * The classification itself, kept free of I/O so it can be tested directly.
 * Coverage counts tables that are *classified* — registered or deliberately
 * excluded — so 100% means nothing is unaccounted for.
 */
export function classifyTables(
  actualTables: readonly string[],
  registry: readonly string[] = BACKUP_REGISTRY,
  excluded: readonly string[] = EXCLUDED_TABLES,
): BackupAuditResult {
  const registrySet = new Set<string>(registry);
  const excludedSet = new Set<string>(excluded);
  const actualSet = new Set<string>(actualTables);

  const backedUp = actualTables.filter((t) => registrySet.has(t));
  const excludedPresent = actualTables.filter((t) => excludedSet.has(t));
  const missing = actualTables.filter((t) => !registrySet.has(t) && !excludedSet.has(t));
  const orphaned = [...registry].filter((t) => !actualSet.has(t));

  const totalTables = actualTables.length;
  // An empty database is vacuously covered — and guards the division below.
  const coveragePercent =
    totalTables === 0 ? 100 : Math.round(((totalTables - missing.length) / totalTables) * 100);

  return { totalTables, backedUp, excluded: excludedPresent, missing, orphaned, coveragePercent };
}

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
