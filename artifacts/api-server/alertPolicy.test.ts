import { describe, it, expect } from "vitest";
// The pure module, which imports nothing — services/alertMonitor.ts reaches
// `@workspace/db` and throws at load without DATABASE_URL, as CI has none.
import { activeTempPhase, alertAppliesToStatus, alertsForBrew, notifiesOncePerBrew } from "./src/lib/alertPolicy.js";

const OTHER_TYPES = ["temp_out_of_range", "device_offline", "battery_low"];
const ACTIVE = ["brew_day", "fermenting", "conditioning"];

describe("alertAppliesToStatus", () => {
  it("checks for a stall only while fermenting", () => {
    expect(alertAppliesToStatus("gravity_stalled", "fermenting")).toBe(true);
    for (const status of ["brew_day", "conditioning", "packaged"]) {
      expect(alertAppliesToStatus("gravity_stalled", status)).toBe(false);
    }
  });

  it("leaves every other type on in every active stage", () => {
    for (const type of OTHER_TYPES) {
      for (const status of ACTIVE) {
        expect(alertAppliesToStatus(type, status)).toBe(true);
      }
    }
  });
});

describe("notifiesOncePerBrew", () => {
  it("is true only for the stall alert", () => {
    expect(notifiesOncePerBrew("gravity_stalled")).toBe(true);
    for (const type of OTHER_TYPES) {
      expect(notifiesOncePerBrew(type)).toBe(false);
    }
  });
});

describe("activeTempPhase", () => {
  it("uses the conditioning range only while conditioning", () => {
    expect(activeTempPhase("conditioning")).toBe("conditioning");
    for (const status of ["brew_day", "fermenting", "packaged"]) {
      expect(activeTempPhase(status)).toBe("fermenting");
    }
  });
});

describe("alertsForBrew", () => {
  const all = ["device_offline", "battery_low", "temp_out_of_range", "gravity_stalled"].map((type) => ({ type }));
  const types = (status: string | null, active: boolean) => alertsForBrew(all, { status, active }).map((a) => a.type);

  it("keeps everything while fermenting", () => {
    expect(types("fermenting", true)).toEqual(["device_offline", "battery_low", "temp_out_of_range", "gravity_stalled"]);
  });

  it("drops a stall but keeps temperature while conditioning", () => {
    expect(types("conditioning", true)).toEqual(["device_offline", "battery_low", "temp_out_of_range"]);
  });

  it("keeps only device alerts for a brew that isn't active", () => {
    expect(types("packaged", false)).toEqual(["device_offline", "battery_low"]);
    expect(types(null, false)).toEqual(["device_offline", "battery_low"]);
  });
});
