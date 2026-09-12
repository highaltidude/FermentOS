import { BACKUP_REGISTRY, EXCLUDED_TABLES } from "@workspace/db/backup-registry";

/**
 * Backup coverage classification.
 *
 * Deliberately separate from services/backupAudit.ts, which holds the database
 * query. Importing `@workspace/db` for the pool throws at module load when
 * DATABASE_URL is unset, so anything importing this file would be unusable in a
 * unit test or any other context without a live database. `@workspace/db/
 * backup-registry` is a subpath to a plain data file with no imports of its
 * own, so it is safe to pull in anywhere.
 *
 * Note what coverage does *not* mean. EXCLUDED_TABLES is a classification, not
 * a pg_dump filter — the dump is taken with no --exclude-table, so an
 * "excluded" table is still present in the backup file. Excluded means "not
 * required to be registered", not "kept out of backups".
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
 * Coverage counts tables that are *classified* — registered or deliberately
 * excluded — so 100% means nothing in the database is unaccounted for. A table
 * nobody has classified is the signal that a schema change shipped without
 * anyone deciding whether it holds real user data.
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
