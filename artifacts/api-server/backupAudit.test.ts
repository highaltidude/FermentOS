import { describe, it, expect } from "vitest";
import { classifyTables } from "./src/services/backupAudit.js";

/**
 * Guards the coverage number that POST /admin/update refuses on. Getting it
 * wrong in either direction is bad: too lenient and an update proceeds with an
 * unclassified table, too strict and updates are blocked for no reason.
 */
describe("classifyTables", () => {
  const registry = ["recipes", "brew_sessions"];
  const excluded = ["brew_alert_state"];

  it("reports 100% when every table is classified", () => {
    const r = classifyTables(["recipes", "brew_sessions", "brew_alert_state"], registry, excluded);
    expect(r.coveragePercent).toBe(100);
    expect(r.missing).toEqual([]);
    expect(r.orphaned).toEqual([]);
    expect(r.backedUp).toEqual(["recipes", "brew_sessions"]);
    expect(r.excluded).toEqual(["brew_alert_state"]);
    expect(r.totalTables).toBe(3);
  });

  it("puts an unclassified table in missing and drops coverage below 100", () => {
    // The case the whole audit exists for: a new table shipped without anyone
    // deciding whether it holds real user data.
    const r = classifyTables(["recipes", "brew_sessions", "zz_new_table"], registry, excluded);
    expect(r.missing).toEqual(["zz_new_table"]);
    expect(r.coveragePercent).toBe(67); // 2 of 3 classified, rounded
    expect(r.coveragePercent).toBeLessThan(100);
  });

  it("reports a registry entry with no matching table as orphaned", () => {
    // Stale entry — the table was dropped but the registry still lists it.
    const r = classifyTables(["recipes"], registry, excluded);
    expect(r.orphaned).toEqual(["brew_sessions"]);
    // Orphans are registry hygiene, not a coverage failure: every table that
    // actually exists is still classified.
    expect(r.coveragePercent).toBe(100);
    expect(r.missing).toEqual([]);
  });

  it("treats an empty database as covered rather than dividing by zero", () => {
    const r = classifyTables([], registry, excluded);
    expect(r.coveragePercent).toBe(100);
    expect(r.totalTables).toBe(0);
    expect(Number.isNaN(r.coveragePercent)).toBe(false);
  });

  it("counts an excluded table as covered, not as missing", () => {
    const r = classifyTables(["brew_alert_state"], [], excluded);
    expect(r.missing).toEqual([]);
    expect(r.excluded).toEqual(["brew_alert_state"]);
    expect(r.coveragePercent).toBe(100);
  });
});
