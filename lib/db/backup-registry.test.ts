import { describe, it, expect } from "vitest";
import { BACKUP_REGISTRY, EXCLUDED_TABLES } from "./src/backup-registry.js";
import * as schema from "./src/schema/index.js";

/**
 * Drizzle table objects carry their SQL table name on a well-known Symbol.
 * Symbol.for() is registry-based, so this is stable across module boundaries.
 */
const DRIZZLE_BASE_NAME = Symbol.for("drizzle:BaseName");

function isTable(v: unknown): boolean {
  return typeof v === "object" && v !== null && DRIZZLE_BASE_NAME in (v as object);
}

const SCHEMA_TABLES: string[] = (Object.values(schema as Record<string, unknown>))
  .filter(isTable)
  .map((v) => (v as Record<symbol, string>)[DRIZZLE_BASE_NAME]);

describe("backup registry coverage", () => {
  it("Symbol API detects at least one schema table (smoke-test)", () => {
    expect(SCHEMA_TABLES.length).toBeGreaterThan(0);
  });

  it("every schema table is in BACKUP_REGISTRY or EXCLUDED_TABLES", () => {
    const covered = new Set<string>([...BACKUP_REGISTRY, ...EXCLUDED_TABLES]);
    const missing = SCHEMA_TABLES.filter((t) => !covered.has(t));
    expect(
      missing,
      [
        "These schema tables have no backup coverage declaration.",
        "Add them to BACKUP_REGISTRY (or EXCLUDED_TABLES with a reason) in lib/db/src/backup-registry.ts:",
        ...missing.map((t) => `  - ${t}`),
      ].join("\n"),
    ).toHaveLength(0);
  });

  it("every BACKUP_REGISTRY entry matches a real schema table", () => {
    const known = new Set(SCHEMA_TABLES);
    const orphans = [...BACKUP_REGISTRY].filter((t) => !known.has(t));
    expect(
      orphans,
      [
        "These BACKUP_REGISTRY entries have no matching schema table (stale?).",
        "Remove them from lib/db/src/backup-registry.ts:",
        ...orphans.map((t) => `  - ${t}`),
      ].join("\n"),
    ).toHaveLength(0);
  });

  it("EXCLUDED_TABLES has no overlap with BACKUP_REGISTRY", () => {
    const registrySet = new Set(BACKUP_REGISTRY as readonly string[]);
    const overlap = [...EXCLUDED_TABLES].filter((t) => registrySet.has(t));
    expect(
      overlap,
      [
        "These tables appear in both BACKUP_REGISTRY and EXCLUDED_TABLES — pick one:",
        ...overlap.map((t) => `  - ${t}`),
      ].join("\n"),
    ).toHaveLength(0);
  });
});
