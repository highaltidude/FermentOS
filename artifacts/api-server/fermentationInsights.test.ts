import { describe, it, expect } from "vitest";
import { calcInsights } from "./src/lib/fermentationInsights.js";

const NOW = new Date("2026-10-06T12:00:00Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);
const r = (hoursAgo: number, gravity: number | null) => ({ gravity, receivedAt: ago(hoursAgo) });
const status = (readings: ReturnType<typeof r>[], og?: number | null) =>
  calcInsights(readings, og, NOW).fermentationStatus;

describe("calcInsights fermentationStatus", () => {
  it("does not call a batch that never got going complete", () => {
    // Three days in, still at OG: a lag or a stall, not a finished beer.
    expect(status([r(72, 1.05), r(48, 1.05), r(20, 1.05), r(1, 1.05)])).toBe("stable");
  });

  it("does not call a slow batch complete at low attenuation", () => {
    expect(status([r(72, 1.05), r(48, 1.046), r(20, 1.0452), r(1, 1.045)])).toBe("stable");
  });

  it("calls flat gravity complete once the beer has attenuated", () => {
    expect(status([r(120, 1.05), r(72, 1.02), r(20, 1.012), r(1, 1.012)])).toBe("possibly_complete");
  });

  it("waits 48 hours even when attenuated", () => {
    expect(status([r(40, 1.05), r(20, 1.012), r(1, 1.012)])).toBe("stable");
  });

  it("measures completion from the recorded OG when the sensor joined late", () => {
    const late = [r(72, 1.014), r(20, 1.012), r(1, 1.012)];
    expect(status(late)).toBe("stable");
    expect(status(late, 1.05)).toBe("possibly_complete");
  });

  it("still reports movement as active or slowing", () => {
    expect(status([r(72, 1.05), r(20, 1.04), r(1, 1.03)])).toBe("likely_active");
    expect(status([r(72, 1.05), r(20, 1.0135), r(1, 1.012)])).toBe("slowing");
  });
});
