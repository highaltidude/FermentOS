import { describe, it, expect } from "vitest";
import { relayRunEnd, relayRunStep } from "./src/lib/relayRunStep";

const fermenting = { brewSessionId: 7, mode: "heat" as const };

describe("relayRunStep", () => {
  it("opens a run when a relay comes on", () => {
    expect(relayRunStep(null, true, fermenting)).toBe("open");
    expect(relayRunStep(null, true)).toBe("open");
  });

  it("does nothing on the heartbeat while it stays on", () => {
    expect(relayRunStep({ id: 1, ...fermenting }, true, fermenting)).toBe("noop");
    expect(relayRunStep({ id: 1, ...fermenting }, true)).toBe("noop");
  });

  it("closes the run when it goes off, and ignores an off with nothing open", () => {
    expect(relayRunStep({ id: 1, ...fermenting }, false)).toBe("close");
    expect(relayRunStep(null, false)).toBe("noop");
  });

  it("starts a new run when the brew or mode changes while on", () => {
    expect(relayRunStep({ id: 1, ...fermenting }, true, { brewSessionId: 8, mode: "heat" })).toBe("reopen");
    expect(relayRunStep({ id: 1, ...fermenting }, true, { brewSessionId: 7, mode: "cool" })).toBe("reopen");
  });

  it("adopts a context-free run the poller opened a moment before the flow recorded it", () => {
    expect(relayRunStep({ id: 1, brewSessionId: null, mode: null }, true, fermenting)).toBe("adopt");
  });
});

describe("relayRunEnd", () => {
  it("uses the time the off was seen when there's no timer", () => {
    expect(relayRunEnd(5_000, 1_000)).toBe(5_000);
    expect(relayRunEnd(5_000, 1_000, null)).toBe(5_000);
  });

  it("moves a late off back to when the device timer ran out", () => {
    expect(relayRunEnd(600_000, 0, 90_000)).toBe(90_000);
    expect(relayRunEnd(60_000, 0, 90_000)).toBe(60_000);
  });

  it("never ends a run before it started", () => {
    expect(relayRunEnd(5_000, 10_000, 2_000)).toBe(10_000);
  });
});
