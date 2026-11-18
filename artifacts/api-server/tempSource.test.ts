import { describe, it, expect } from "vitest";
import { effectiveTempSensor, tempReadings } from "./src/lib/tempSource";

type R = { id: number; deviceId: number | null };
const by = (r: R) => r.deviceId;
const readings: R[] = [
  { id: 1, deviceId: 10 },
  { id: 2, deviceId: 20 },
  { id: 3, deviceId: null },
  { id: 4, deviceId: 10 },
];

describe("tempReadings", () => {
  it("uses every reading when no sensor is chosen", () => {
    expect(tempReadings(readings, null, by).map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });

  it("keeps the chosen sensor's readings and the hand-entered ones", () => {
    expect(tempReadings(readings, 10, by).map((r) => r.id)).toEqual([1, 3, 4]);
    expect(tempReadings(readings, 20, by).map((r) => r.id)).toEqual([2, 3]);
  });

  it("goes back to every reading when the chosen sensor has none", () => {
    expect(tempReadings(readings, 99, by).map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });
});

describe("effectiveTempSensor", () => {
  it("is the chosen sensor only while it has readings", () => {
    expect(effectiveTempSensor(readings, 20, by)).toBe(20);
    expect(effectiveTempSensor(readings, 99, by)).toBeNull();
    expect(effectiveTempSensor(readings, null, by)).toBeNull();
    expect(effectiveTempSensor([], 10, by)).toBeNull();
  });
});
