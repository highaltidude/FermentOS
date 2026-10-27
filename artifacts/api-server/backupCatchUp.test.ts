import { describe, it, expect } from "vitest";
import { isBackupOverdue } from "./src/lib/backupCatchUp.js";

const now = new Date("2026-10-26T19:40:00Z");
const ago = (hours: number) => ({ lastRun: new Date(now.getTime() - hours * 3600_000).toISOString() });

describe("isBackupOverdue", () => {
  it("never catches up when backups aren't scheduled", () => {
    expect(isBackupOverdue("none", ago(1000), now)).toBe(false);
  });

  it("leaves a fresh install to its first scheduled run", () => {
    expect(isBackupOverdue("daily", { lastRun: null }, now)).toBe(false);
  });

  it("daily: a run within the last 26 hours is on time", () => {
    expect(isBackupOverdue("daily", ago(25), now)).toBe(false);
    expect(isBackupOverdue("daily", ago(27), now)).toBe(true);
  });

  it("weekly: a run within the last 8 days is on time", () => {
    expect(isBackupOverdue("weekly", ago(7.5 * 24), now)).toBe(false);
    expect(isBackupOverdue("weekly", ago(9 * 24), now)).toBe(true);
  });

  it("an unreadable lastRun counts as overdue", () => {
    expect(isBackupOverdue("daily", { lastRun: "garbage" }, now)).toBe(true);
  });

  it("the gap that prompted this: off from the 25th's run until the evening of the 26th", () => {
    expect(isBackupOverdue("daily", { lastRun: "2026-10-25T02:00:00.375Z" }, now)).toBe(true);
  });
});
