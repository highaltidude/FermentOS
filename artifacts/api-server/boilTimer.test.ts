import { describe, it, expect } from "vitest";
import {
  boilPhase,
  boilElapsedMs,
  boilRemainingMs,
  boilAlertGroups,
  upcomingBoilAlerts,
  type BoilState,
  type BoilIngredient,
} from "./src/lib/boilTimer.js";

const T0 = Date.parse("2026-09-22T12:00:00Z");
const min = (n: number) => n * 60_000;

const idle: BoilState = { boilMinutes: null, boilStartedAt: null, boilPausedAt: null, boilPausedMs: null, boilEndedAt: null };
const running = (over: Partial<BoilState> = {}): BoilState => ({
  boilMinutes: 60,
  boilStartedAt: new Date(T0),
  boilPausedAt: null,
  boilPausedMs: 0,
  boilEndedAt: null,
  ...over,
});

const hop = (id: number, timingMinutes: number | null, use = "boil"): BoilIngredient => ({
  id, name: `Hop ${id}`, amount: 1, unit: "oz", use, timingMinutes,
});

describe("boil timer state", () => {
  it("derives the phase from which timestamps are set", () => {
    expect(boilPhase(idle)).toBe("idle");
    expect(boilPhase(running())).toBe("running");
    expect(boilPhase(running({ boilPausedAt: new Date(T0 + min(5)) }))).toBe("paused");
    expect(boilPhase(running({ boilEndedAt: new Date(T0 + min(60)) }))).toBe("ended");
  });

  it("counts down from wall-clock time while running", () => {
    expect(boilRemainingMs(running(), T0 + min(15))).toBe(min(45));
  });

  it("freezes while paused and excludes earlier pauses", () => {
    // Paused at 10 min after a previous 3-minute pause: 7 minutes boiled.
    const s = running({ boilPausedAt: new Date(T0 + min(10)), boilPausedMs: min(3) });
    expect(boilElapsedMs(s, T0 + min(40))).toBe(min(7));
    expect(boilRemainingMs(s, T0 + min(99))).toBe(min(53));
  });

  it("goes negative on overrun so the page can show it", () => {
    expect(boilRemainingMs(running(), T0 + min(62))).toBe(-min(2));
  });

  it("reads ISO strings as well as Dates", () => {
    const s = running({ boilStartedAt: new Date(T0).toISOString() });
    expect(boilRemainingMs(s, T0 + min(1))).toBe(min(59));
  });
});

describe("boilAlertGroups", () => {
  it("groups additions by minute, longest first, with flameout last", () => {
    const groups = boilAlertGroups(60, [hop(1, 15), hop(2, 60), hop(3, 15), hop(4, 0)]);
    expect(groups.map((g) => g.atMinutesRemaining)).toEqual([60, 15, 0]);
    expect(groups[1]!.additions.map((a) => a.id)).toEqual([1, 3]);
    expect(groups[2]!.flameout).toBe(true);
  });

  it("always includes flameout, even with no additions", () => {
    expect(boilAlertGroups(60, [])).toEqual([{ atMinutesRemaining: 0, additions: [], flameout: true }]);
  });

  it("puts whirlpool additions at flameout and ignores dry hops and mash", () => {
    const groups = boilAlertGroups(60, [hop(1, 20, "whirlpool"), hop(2, 3, "dry_hop"), hop(3, 60, "mash")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.additions.map((a) => a.id)).toEqual([1]);
  });

  it("starts additions with no time or one longer than the boil at the start", () => {
    const groups = boilAlertGroups(60, [hop(1, null), hop(2, 90)]);
    expect(groups[0]).toMatchObject({ atMinutesRemaining: 60 });
    expect(groups[0]!.additions.map((a) => a.id)).toEqual([1, 2]);
  });
});

describe("upcomingBoilAlerts", () => {
  const ings = [hop(1, 60), hop(2, 15), hop(3, 5)];

  it("schedules what is still ahead at its wall-clock time", () => {
    const up = upcomingBoilAlerts(running(), ings, T0 + min(50));
    // 15 min passed at the 45-minute mark; 5 min and flameout remain.
    expect(up.map((u) => u.group.atMinutesRemaining)).toEqual([5, 0]);
    expect(up[0]!.fireAt).toBe(T0 + min(55));
    expect(up[1]!.fireAt).toBe(T0 + min(60));
  });

  it("does not re-fire the addition due at the moment the boil starts", () => {
    const up = upcomingBoilAlerts(running(), ings, T0);
    expect(up.map((u) => u.group.atMinutesRemaining)).toEqual([15, 5, 0]);
  });

  it("shifts later alerts by the time spent paused", () => {
    const up = upcomingBoilAlerts(running({ boilPausedMs: min(10) }), ings, T0 + min(50));
    expect(up.map((u) => u.group.atMinutesRemaining)).toEqual([15, 5, 0]);
    expect(up[0]!.fireAt).toBe(T0 + min(55));
  });

  it("has nothing upcoming unless the boil is running", () => {
    expect(upcomingBoilAlerts(idle, ings, T0)).toEqual([]);
    expect(upcomingBoilAlerts(running({ boilPausedAt: new Date(T0 + min(1)) }), ings, T0 + min(2))).toEqual([]);
    expect(upcomingBoilAlerts(running({ boilEndedAt: new Date(T0 + min(1)) }), ings, T0 + min(2))).toEqual([]);
  });
});
