import { describe, it, expect } from "vitest";
import { thermostatStep, type RelayTiming } from "./src/lib/flows/thermostat.js";
import type { ThermostatConfig } from "./src/lib/flows/nodes.js";

const T0 = Date.parse("2026-10-26T12:00:00Z");
const sec = (n: number) => n * 1000;

const heat: ThermostatConfig = { outputDeviceId: 1, mode: "heat", setpointC: 20, hysteresisC: 0.5, minOnSec: 0, minOffSec: 0 };
const cool: ThermostatConfig = { ...heat, mode: "cool", minOffSec: 300 };

const off = (since: number | null = null): RelayTiming => ({ on: false, since });
const on = (since: number | null = null): RelayTiming => ({ on: true, since });

describe("thermostatStep — heating", () => {
  it("stays off inside the band and switches on at setpoint − hysteresis", () => {
    expect(thermostatStep(heat, 19.6, off(), T0)).toEqual({ on: false, reason: "idle" });
    expect(thermostatStep(heat, 19.5, off(), T0)).toEqual({ on: true, reason: "heating" });
  });

  it("keeps heating until the setpoint is reached, then switches off", () => {
    expect(thermostatStep(heat, 19.9, on(), T0)).toEqual({ on: true, reason: "heating" });
    expect(thermostatStep(heat, 20, on(), T0)).toEqual({ on: false, reason: "idle" });
  });

  it("holds on for the minimum on time", () => {
    const cfg = { ...heat, minOnSec: 120 };
    expect(thermostatStep(cfg, 20.5, on(T0 - sec(60)), T0)).toEqual({ on: true, reason: "holding_min_on" });
    expect(thermostatStep(cfg, 20.5, on(T0 - sec(120)), T0)).toEqual({ on: false, reason: "idle" });
  });

  it("treats an unknown last switch time as long ago", () => {
    const cfg = { ...heat, minOffSec: 600 };
    expect(thermostatStep(cfg, 18, off(null), T0)).toEqual({ on: true, reason: "heating" });
  });
});

describe("thermostatStep — cooling", () => {
  it("switches on at setpoint + hysteresis and off at the setpoint", () => {
    expect(thermostatStep(cool, 20.4, off(), T0)).toEqual({ on: false, reason: "idle" });
    expect(thermostatStep(cool, 20.5, off(), T0)).toEqual({ on: true, reason: "cooling" });
    expect(thermostatStep(cool, 20.1, on(), T0)).toEqual({ on: true, reason: "cooling" });
    expect(thermostatStep(cool, 20, on(), T0)).toEqual({ on: false, reason: "idle" });
  });

  it("protects the compressor with the minimum off time", () => {
    expect(thermostatStep(cool, 22, off(T0 - sec(299)), T0)).toEqual({ on: false, reason: "holding_min_off" });
    expect(thermostatStep(cool, 22, off(T0 - sec(300)), T0)).toEqual({ on: true, reason: "cooling" });
  });
});
