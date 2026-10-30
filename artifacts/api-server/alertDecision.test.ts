import { describe, it, expect } from "vitest";
import { decideFiringAlert, type AlertDecisionInput, type PriorAlertState } from "./src/lib/alertDecision.js";

const HOUR = 60 * 60 * 1000;
const t0 = new Date("2026-10-01T12:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);

const decide = (over: Partial<AlertDecisionInput>) =>
  decideFiringAlert({ prior: undefined, now: t0, repeatMs: 6 * HOUR, oncePerBrew: false, debounced: true, ...over });

const row = (over: Partial<PriorAlertState>): PriorAlertState =>
  ({ seenCount: 1, firstSeenAt: t0, lastNotifiedAt: t0, resolvedAt: null, ...over });

describe("decideFiringAlert", () => {
  it("notifies on first detection", () => {
    expect(decide({})).toEqual({ seenCount: 1, firstSeenAt: t0, lastNotifiedAt: null, shouldNotify: true });
  });

  it("records but does not notify while the condition is still being confirmed", () => {
    expect(decide({ debounced: false })).toMatchObject({ seenCount: 1, shouldNotify: false });
  });

  it("suppresses repeats until the interval has passed", () => {
    const still = decide({ prior: row({ seenCount: 4 }), now: later(5 * HOUR) });
    expect(still).toEqual({ seenCount: 5, firstSeenAt: t0, lastNotifiedAt: t0, shouldNotify: false });

    expect(decide({ prior: row({}), now: later(6 * HOUR) }).shouldNotify).toBe(true);
    expect(decide({ prior: row({}), now: later(30 * HOUR) }).shouldNotify).toBe(true);
  });

  it("does not repeat while unconfirmed, even when due", () => {
    expect(decide({ prior: row({}), now: later(7 * HOUR), debounced: false }).shouldNotify).toBe(false);
  });

  it("never repeats a once-per-brew alert", () => {
    expect(decide({ prior: row({}), now: later(100 * HOUR), oncePerBrew: true }).shouldNotify).toBe(false);
  });

  it("starts a fresh incident when a resolved condition recurs", () => {
    const now = later(48 * HOUR);
    const prior = row({ seenCount: 0, lastNotifiedAt: later(HOUR), resolvedAt: later(2 * HOUR) });
    expect(decide({ prior, now })).toEqual({ seenCount: 1, firstSeenAt: now, lastNotifiedAt: null, shouldNotify: true });
  });

  it("keeps a once-per-brew alert's send time through a recurrence", () => {
    const prior = row({ seenCount: 0, lastNotifiedAt: later(HOUR), resolvedAt: later(2 * HOUR) });
    expect(decide({ prior, now: later(48 * HOUR), oncePerBrew: true }))
      .toMatchObject({ seenCount: 1, lastNotifiedAt: later(HOUR), shouldNotify: false });
  });

  it("retries next tick after a failed send is rolled back", () => {
    // Tick 1: first detection, sent. The send fails and recordFiringAlert
    // restores lastNotifiedAt to the decision's value — null here.
    const first = decide({});
    expect(first.shouldNotify).toBe(true);
    const rolledBack = row({ seenCount: first.seenCount, lastNotifiedAt: first.lastNotifiedAt });

    // Tick 2, five minutes on: still never delivered, so it sends again.
    expect(decide({ prior: rolledBack, now: later(5 * 60 * 1000) })).toMatchObject({ seenCount: 2, shouldNotify: true });
  });
});
