import { describe, expect, it } from "vitest";
import { cpuPercentBetween, parseProcStat } from "./src/lib/cpuUsage.js";

describe("parseProcStat", () => {
  it("reads total and idle+iowait from the aggregate cpu line", () => {
    const text = "cpu  100 0 50 800 50 0 0 0 0 0\ncpu0 25 0 12 200 13 0 0 0 0 0\n";
    expect(parseProcStat(text)).toEqual({ total: 1000, idle: 850 });
  });

  it("rejects text that isn't /proc/stat", () => {
    expect(parseProcStat("")).toBeNull();
    expect(parseProcStat("intr 1 2 3")).toBeNull();
  });
});

describe("cpuPercentBetween", () => {
  it("averages busy time over the whole interval", () => {
    expect(cpuPercentBetween({ total: 1000, idle: 900 }, { total: 2000, idle: 1880 })).toBe(2);
  });

  it("is null when no time has passed", () => {
    expect(cpuPercentBetween({ total: 1000, idle: 900 }, { total: 1000, idle: 900 })).toBeNull();
  });
});
