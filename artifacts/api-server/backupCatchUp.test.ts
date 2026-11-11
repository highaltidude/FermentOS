import { describe, it, expect } from "vitest";
import { isBackupOverdue, lastScheduledSlot } from "./src/lib/backupCatchUp.js";

// Local-time dates, like node-cron's schedule, so these hold in any timezone.
// 2026-10-18 and 2026-10-25 are Sundays, and clear of DST changes.
const at = (day: number, hour: number, minute = 0, second = 0) => new Date(2026, 9, day, hour, minute, second);
const ran = (d: Date) => ({ lastRun: d.toISOString() });

describe("lastScheduledSlot", () => {
  it("daily: today's 2 AM once it has passed, else yesterday's", () => {
    expect(lastScheduledSlot("daily", at(21, 9))).toEqual(at(21, 2));
    expect(lastScheduledSlot("daily", at(21, 1, 58))).toEqual(at(20, 2));
  });

  it("weekly: the latest Sunday 2 AM", () => {
    expect(lastScheduledSlot("weekly", at(25, 9))).toEqual(at(25, 2));
    expect(lastScheduledSlot("weekly", at(25, 1, 58))).toEqual(at(18, 2));
    expect(lastScheduledSlot("weekly", at(22, 15))).toEqual(at(18, 2));
    expect(lastScheduledSlot("weekly", at(24, 23, 59))).toEqual(at(18, 2));
  });

  it("2 AM exactly is that day's slot", () => {
    expect(lastScheduledSlot("daily", at(21, 2))).toEqual(at(21, 2));
    expect(lastScheduledSlot("weekly", at(25, 2))).toEqual(at(25, 2));
  });

  it("has no slot when backups aren't scheduled", () => {
    expect(lastScheduledSlot("none", at(21, 9))).toBeNull();
  });
});

describe("isBackupOverdue", () => {
  it("never catches up when backups aren't scheduled", () => {
    expect(isBackupOverdue("none", ran(at(1, 2)), at(25, 9))).toBe(false);
  });

  it("leaves a fresh install to its first scheduled run", () => {
    expect(isBackupOverdue("daily", { lastRun: null }, at(25, 9))).toBe(false);
  });

  it("an unreadable lastRun counts as overdue", () => {
    expect(isBackupOverdue("daily", { lastRun: "garbage" }, at(25, 9))).toBe(true);
  });

  it("weekly: off at Sunday 2 AM and booted that morning catches up (#225)", () => {
    expect(isBackupOverdue("weekly", ran(at(18, 2, 0, 40)), at(25, 9))).toBe(true);
  });

  it("weekly: last Sunday's run is on time all week", () => {
    expect(isBackupOverdue("weekly", ran(at(18, 2, 0, 40)), at(24, 23))).toBe(false);
  });

  it("daily: booted between 2 and 4 AM after a missed run catches up (#225)", () => {
    expect(isBackupOverdue("daily", ran(at(20, 2, 0, 40)), at(21, 3))).toBe(true);
  });

  it("daily: today's run is on time", () => {
    expect(isBackupOverdue("daily", ran(at(21, 2, 0, 40)), at(21, 3))).toBe(false);
  });

  it("just before 2 AM, yesterday's run is still on time, leaving tonight to cron", () => {
    expect(isBackupOverdue("daily", ran(at(20, 2, 0, 40)), at(21, 1, 58))).toBe(false);
  });

  it("an on-demand backup after the latest slot counts", () => {
    expect(isBackupOverdue("daily", ran(at(21, 8)), at(21, 9))).toBe(false);
    expect(isBackupOverdue("weekly", ran(at(22, 12)), at(24, 9))).toBe(false);
  });

  it("the gap that first prompted catch-up: off from the 25th's run until the evening of the 26th", () => {
    expect(isBackupOverdue("daily", ran(at(25, 2, 0, 1)), at(26, 19, 40))).toBe(true);
  });
});
