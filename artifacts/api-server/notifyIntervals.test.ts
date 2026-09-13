import { describe, it, expect } from "vitest";
// The pure module, which imports nothing — services/notifications.ts reaches
// `@workspace/db` and throws at load without DATABASE_URL, as CI has none.
import { resolveRepeatHours } from "./src/lib/notifyIntervals.js";

/**
 * The fallback rule decides how often a live alert nags. Getting it wrong is
 * quiet in both directions: too short and the user is woken repeatedly, too long
 * and an ongoing excursion goes unmentioned for hours.
 */
describe("resolveRepeatHours", () => {
  it("uses the override for temperature when one is set", () => {
    expect(resolveRepeatHours("temp_out_of_range", 6, 1)).toBe(1);
    expect(resolveRepeatHours("temp_out_of_range", 24, 3)).toBe(3);
  });

  it("inherits the global interval for temperature when the override is null", () => {
    // The default, and what keeps an upgrade from changing existing behaviour:
    // someone on 12 hours stays on 12 hours until they choose otherwise.
    expect(resolveRepeatHours("temp_out_of_range", 12, null)).toBe(12);
    expect(resolveRepeatHours("temp_out_of_range", 6, null)).toBe(6);
  });

  it("ignores the override for every other alert type, even when set", () => {
    // A short temperature leash must not make the battery warning nag hourly.
    for (const type of ["gravity_stalled", "device_offline", "battery_low"]) {
      expect(resolveRepeatHours(type, 6, 1)).toBe(6);
      expect(resolveRepeatHours(type, 24, 1)).toBe(24);
    }
  });

  it("treats an unknown alert type as a non-temperature one", () => {
    // A type added later shouldn't silently inherit the temperature interval.
    expect(resolveRepeatHours("something_new", 6, 1)).toBe(6);
  });
});
