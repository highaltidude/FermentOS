import { describe, it, expect } from "vitest";
// The pure module — services/brewAlerts.ts reaches `@workspace/db` and throws
// at load without DATABASE_URL, as CI has none.
import { consecutiveTempExcursions, tempAlertConfirmed, tempExcursion, type TempRange } from "./src/lib/tempExcursion.js";

const range = (min: number | null, max: number | null, unit: "F" | "C"): TempRange =>
  ({ min, max, ideal: null, unit, phase: "fermenting" });

describe("tempExcursion", () => {
  it("converts a Celsius reading to a Fahrenheit range", () => {
    const hit = tempExcursion({ temperature: 20, temperatureUnit: "C" }, range(60, 66, "F"));
    expect(hit).toMatchObject({ direction: "above", limit: 66, unit: "°F" });
    expect(hit!.value).toBeCloseTo(68, 5);
  });

  it("converts a Fahrenheit reading to a Celsius range", () => {
    const hit = tempExcursion({ temperature: 50, temperatureUnit: "F" }, range(15, 22, "C"));
    expect(hit).toMatchObject({ direction: "below", limit: 15, unit: "°C" });
    expect(hit!.value).toBeCloseTo(10, 5);
  });

  it("compares directly when the units agree", () => {
    expect(tempExcursion({ temperature: 67, temperatureUnit: "F" }, range(60, 66, "F"))).toMatchObject({ value: 67 });
    expect(tempExcursion({ temperature: 64, temperatureUnit: "F" }, range(60, 66, "F"))).toBeNull();
  });

  it("treats a missing unit as Celsius and accepts a lowercase one", () => {
    // 18 °C is 64.4 °F, inside the range; read as Fahrenheit it would be below.
    expect(tempExcursion({ temperature: 18 }, range(60, 66, "F"))).toBeNull();
    expect(tempExcursion({ temperature: 18, temperatureUnit: "c" }, range(60, 66, "F"))).toBeNull();
    expect(tempExcursion({ temperature: 70, temperatureUnit: "f" }, range(60, 66, "F"))).toMatchObject({ direction: "above" });
  });

  it("returns null with no range or no temperature", () => {
    expect(tempExcursion({ temperature: 99, temperatureUnit: "F" }, null)).toBeNull();
    expect(tempExcursion({ temperature: null, temperatureUnit: "F" }, range(60, 66, "F"))).toBeNull();
    expect(tempExcursion(null, range(60, 66, "F"))).toBeNull();
  });

  it("checks only the bound that is set", () => {
    expect(tempExcursion({ temperature: 10, temperatureUnit: "F" }, range(null, 66, "F"))).toBeNull();
    expect(tempExcursion({ temperature: 90, temperatureUnit: "F" }, range(60, null, "F"))).toBeNull();
    expect(tempExcursion({ temperature: 50, temperatureUnit: "F" }, range(60, null, "F"))).toMatchObject({ direction: "below" });
  });
});

describe("consecutiveTempExcursions", () => {
  const r = range(60, 66, "F");
  const at = (temperature: number | null) => ({ temperature, temperatureUnit: "F" });

  it("counts the trailing run of out-of-range readings", () => {
    expect(consecutiveTempExcursions([at(70), at(64), at(70), at(71), at(72)], r)).toBe(3);
  });

  it("stops at the latest in-range reading", () => {
    expect(consecutiveTempExcursions([at(70), at(71), at(64)], r)).toBe(0);
  });

  it("skips readings with no temperature instead of treating them as a recovery", () => {
    expect(consecutiveTempExcursions([at(70), at(null), at(71), at(null)], r)).toBe(2);
  });

  it("is 0 with no range or no readings", () => {
    expect(consecutiveTempExcursions([at(70), at(71)], null)).toBe(0);
    expect(consecutiveTempExcursions([at(70), at(71)], undefined)).toBe(0);
    expect(consecutiveTempExcursions([], r)).toBe(0);
  });
});

describe("tempAlertConfirmed", () => {
  it("holds a temperature alert until the streak reaches the required count", () => {
    expect(tempAlertConfirmed("temp_out_of_range", 2, 3)).toBe(false);
    expect(tempAlertConfirmed("temp_out_of_range", 3, 3)).toBe(true);
  });

  it("confirms every other alert type at once", () => {
    for (const type of ["device_offline", "battery_low", "gravity_stalled"]) {
      expect(tempAlertConfirmed(type, 0, 3)).toBe(true);
    }
  });
});
