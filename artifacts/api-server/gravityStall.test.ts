import { describe, it, expect } from "vitest";
// The pure module, which imports nothing — services/brewAlerts.ts reaches
// `@workspace/db` and throws at load without DATABASE_URL, as CI has none.
import { isGravityStalled } from "./src/lib/gravityStall.js";

const NOW = new Date("2026-10-02T12:00:00Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);
const r = (hoursAgo: number, gravity: number | null) => ({ gravity, receivedAt: ago(hoursAgo) });

describe("isGravityStalled", () => {
  it("does not flag flat readings that cover less than 24 hours", () => {
    expect(isGravityStalled([r(0.5, 1.012), r(0.25, 1.012), r(0, 1.012)], NOW)).toBe(false);
  });

  it("flags gravity that has been flat for more than 24 hours", () => {
    expect(isGravityStalled([r(30, 1.012), r(20, 1.012), r(10, 1.012), r(1, 1.012)], NOW)).toBe(true);
  });

  it("does not flag gravity that dropped inside the window", () => {
    expect(isGravityStalled([r(30, 1.022), r(20, 1.012), r(10, 1.012), r(1, 1.012)], NOW)).toBe(false);
  });

  it("does not flag gravity that is still moving", () => {
    expect(isGravityStalled([r(30, 1.030), r(20, 1.024), r(10, 1.018), r(1, 1.012)], NOW)).toBe(false);
  });

  it("leaves a probe with no recent readings to the offline alert", () => {
    expect(isGravityStalled([r(40, 1.012), r(30, 1.012)], NOW)).toBe(false);
  });

  it("anchors on the latest reading before the cutoff", () => {
    // The 40h reading differs, but the one at 25h is the start of the window.
    expect(isGravityStalled([r(40, 1.030), r(25, 1.012), r(10, 1.012), r(1, 1.012)], NOW)).toBe(true);
  });

  it("ignores readings with no gravity", () => {
    expect(isGravityStalled([r(30, null), r(10, 1.012), r(1, 1.012)], NOW)).toBe(false);
    expect(isGravityStalled([r(30, 1.012), r(10, null), r(1, 1.012)], NOW)).toBe(true);
    expect(isGravityStalled([r(30, 1.012), r(1, null)], NOW)).toBe(false);
  });

  it("does not depend on the readings being sorted", () => {
    expect(isGravityStalled([r(1, 1.012), r(30, 1.012), r(10, 1.012)], NOW)).toBe(true);
    expect(isGravityStalled([r(1, 1.012), r(30, 1.022), r(10, 1.012)], NOW)).toBe(false);
  });
});
