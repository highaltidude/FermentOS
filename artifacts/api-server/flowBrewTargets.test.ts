import { describe, it, expect } from "vitest";
import { validateFlowGraph } from "./src/lib/flows/graph.js";
import { evaluateTemperatureTick, thermostatTarget, type BrewContext } from "./src/lib/flows/evaluate.js";
import { parseNodeConfig } from "./src/lib/flows/nodes.js";

const isValidCron = () => true;
const now = new Date("2026-10-26T12:00:00Z");

const brew = (patch: Partial<BrewContext> = {}): BrewContext => ({
  name: "Pale Ale",
  recipeId: 4,
  status: "fermenting",
  stageStartedAt: now,
  fermentIdealC: 19,
  conditionIdealC: 21,
  ...patch,
});

const flow = (setpointFrom: string) => validateFlowGraph({
  version: 1,
  nodes: [
    { id: "t", type: "trigger.temperature", position: { x: 0, y: 0 }, data: { config: { source: { kind: "shelly", outputDeviceId: 7 } } } },
    { id: "th", type: "control.thermostat", position: { x: 0, y: 0 }, data: { config: { outputDeviceId: 3, mode: "cool", setpointFrom, hysteresisC: 0.5 } } },
  ],
  edges: [{ id: "e", source: "t", target: "th" }],
}, { isValidCron }).compiled!;

describe("thermostat setpointFrom", () => {
  it("defaults to a fixed target, and needs no number when following the brew", () => {
    const fixed = parseNodeConfig("control.thermostat", { outputDeviceId: 3, mode: "heat", setpointC: 20 }, isValidCron);
    expect(fixed).toMatchObject({ ok: true, value: { setpointFrom: "fixed", setpointC: 20 } });
    const brewed = parseNodeConfig("control.thermostat", { outputDeviceId: 3, mode: "heat", setpointFrom: "fermentIdeal" }, isValidCron);
    expect(brewed).toMatchObject({ ok: true, value: { setpointFrom: "fermentIdeal" } });
    expect(parseNodeConfig("control.thermostat", { outputDeviceId: 3, mode: "heat", setpointFrom: "mashIdeal" }, isValidCron).ok).toBe(false);
    expect(parseNodeConfig("control.thermostat", { outputDeviceId: 3, mode: "heat" }, isValidCron).ok).toBe(false);
  });

  it("resolves the target from the brew", () => {
    expect(thermostatTarget({ setpointFrom: "fixed", setpointC: 18 }, null)).toEqual({ ok: true, targetC: 18 });
    expect(thermostatTarget({ setpointFrom: "fermentIdeal", setpointC: 18 }, brew())).toEqual({ ok: true, targetC: 19 });
    expect(thermostatTarget({ setpointFrom: "conditionIdeal", setpointC: 18 }, brew())).toEqual({ ok: true, targetC: 21 });
  });

  it("explains a missing target", () => {
    expect(thermostatTarget({ setpointFrom: "fermentIdeal", setpointC: 18 }, null))
      .toMatchObject({ ok: false, message: expect.stringMatching(/No brew is assigned/) });
    expect(thermostatTarget({ setpointFrom: "conditionIdeal", setpointC: 18 }, brew({ conditionIdealC: null })))
      .toEqual({ ok: false, message: "Pale Ale has no ideal conditioning temperature set" });
  });
});

describe("evaluateTemperatureTick with brew targets", () => {
  it("cools to the brew's fermentation temperature", () => {
    const r = evaluateTemperatureTick(flow("fermentIdeal"), { tempC: 20, now, brew: brew(), relays: new Map() });
    expect(r.missingTargets).toEqual([]);
    expect(r.desired.get(3)).toMatchObject({ on: true, reason: "cooling" });
    expect(r.nodes.th).toMatchObject({ active: true, targetC: 19 });
    // 19.2 °C is inside the band above a 19 °C target, so an idle fridge stays off.
    expect(evaluateTemperatureTick(flow("fermentIdeal"), { tempC: 19.2, now, brew: brew(), relays: new Map() }).desired.get(3)?.on).toBe(false);
  });

  it("reports a missing target and leaves the relay off", () => {
    const r = evaluateTemperatureTick(flow("fermentIdeal"), { tempC: 25, now, brew: brew({ fermentIdealC: null }), relays: new Map() });
    expect(r.missingTargets).toEqual([{ nodeId: "th", message: "Pale Ale has no ideal fermentation temperature set" }]);
    expect(r.desired.get(3)).toMatchObject({ on: false });
  });
});
