/**
 * BACKUP_REGISTRY — the canonical list of every application table that must
 * be covered by a pg_dump backup. pg_dump already captures all tables in the
 * public schema, so this list's purpose is auditability: if a developer adds
 * a table without updating this file, the CI test in backup-registry.test.ts
 * will fail, forcing an explicit decision (add to BACKUP_REGISTRY or, if the
 * table is intentionally excluded, add to EXCLUDED_TABLES).
 *
 * Naming convention: use the PostgreSQL table name (lowercase, underscores).
 */
export const BACKUP_REGISTRY = [
  "recipes",
  "recipe_ingredients",
  "recipe_steps",
  "brew_sessions",
  "fermentation_readings",
  "brew_session_status_log",
  "inventory",
  "equipment",
  "beer_styles",
  "app_config",
  "api_tokens",
] as const;

export type BackedUpTable = (typeof BACKUP_REGISTRY)[number];

/**
 * EXCLUDED_TABLES — tables intentionally omitted from backup coverage checks.
 *
 * Add a table here ONLY if it is truly ephemeral, purely system-managed, or
 * otherwise safe to lose (e.g., session caches, migration state). Every entry
 * must have a comment explaining why it is excluded.
 *
 * Leave empty if all DB tables should be backed up (the common case).
 */
export const EXCLUDED_TABLES: readonly string[] = [
  // Currently empty: all public schema tables are user data worth preserving.
  // Example (if using drizzle migrate instead of push):
  //   "__drizzle_migrations",  // managed by drizzle-kit, not user data
];
