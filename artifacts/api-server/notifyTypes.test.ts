import { describe, it, expect } from "vitest";
import { parseNotifyTypes } from "./src/lib/notifyTypes.js";

const VALID = ["temp_out_of_range", "gravity_stalled", "device_offline", "battery_low"] as const;

describe("parseNotifyTypes", () => {
  it("gives a fresh install every type", () => {
    expect(parseNotifyTypes(undefined, VALID, VALID)).toEqual([...VALID]);
  });

  it("keeps everything off when every box was unchecked", () => {
    // Saving an empty selection writes "". Reading that as unset is what
    // silently re-enabled every alert.
    expect(parseNotifyTypes("", VALID, VALID)).toEqual([]);
  });

  it("keeps a partial selection", () => {
    expect(parseNotifyTypes("battery_low,temp_out_of_range", VALID, VALID)).toEqual(["battery_low", "temp_out_of_range"]);
  });

  it("drops blank and unknown entries", () => {
    expect(parseNotifyTypes(" battery_low ,, bogus", VALID, VALID)).toEqual(["battery_low"]);
  });
});
