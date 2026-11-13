import { describe, it, expect } from "vitest";
import { bucketEdges, bucketRelayRuns, formatRunTime, totalUsage } from "./relayUsage";

// Local-time dates, so the tests hold in any timezone the runner is in.
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const iso = (t: number) => new Date(t).toISOString();

describe("bucketEdges", () => {
  it("covers whole local days", () => {
    const edges = bucketEdges("day", at(10, 15), at(12, 9));
    expect(edges).toEqual([at(10, 0), at(11, 0), at(12, 0), at(13, 0)]);
  });

  it("covers whole hours", () => {
    const edges = bucketEdges("hour", at(10, 15, 20), at(10, 17, 5));
    expect(edges).toEqual([at(10, 15), at(10, 16), at(10, 17), at(10, 18)]);
  });
});

describe("bucketRelayRuns", () => {
  it("splits a run across the hours it spans", () => {
    const runs = [{ mode: "heat" as const, startedAt: iso(at(10, 15, 40)), endedAt: iso(at(10, 16, 10)) }];
    const b = bucketRelayRuns(runs, "hour", at(10, 15), at(10, 17), at(10, 18));
    expect(b.map((x) => x.heatMin)).toEqual([20, 10]);
    expect(b.every((x) => x.coolMin === 0 && x.otherMin === 0)).toBe(true);
  });

  it("splits a run across midnight", () => {
    const runs = [{ mode: "cool" as const, startedAt: iso(at(10, 23, 30)), endedAt: iso(at(11, 1)) }];
    const b = bucketRelayRuns(runs, "day", at(10, 0), at(11, 12), at(11, 12));
    expect(b.map((x) => x.coolMin)).toEqual([30, 60]);
  });

  it("counts a run that is still on up to now", () => {
    const runs = [{ mode: "heat" as const, startedAt: iso(at(10, 9)), endedAt: null }];
    const b = bucketRelayRuns(runs, "hour", at(10, 9), at(10, 10), at(10, 9, 25));
    expect(b[0]!.heatMin).toBe(25);
  });

  it("files runs with no mode as other, and ignores runs outside the range", () => {
    const runs = [
      { mode: null, startedAt: iso(at(10, 9)), endedAt: iso(at(10, 9, 15)) },
      { mode: "heat" as const, startedAt: iso(at(9, 9)), endedAt: iso(at(9, 10)) },
    ];
    const b = bucketRelayRuns(runs, "day", at(10, 0), at(10, 12), at(10, 12));
    expect(b).toHaveLength(1);
    expect(totalUsage(b)).toEqual({ heatMin: 0, coolMin: 0, otherMin: 15 });
  });
});

describe("formatRunTime", () => {
  it("reads naturally", () => {
    expect(formatRunTime(45)).toBe("45 min");
    expect(formatRunTime(120)).toBe("2 h");
    expect(formatRunTime(200)).toBe("3 h 20 min");
  });
});
