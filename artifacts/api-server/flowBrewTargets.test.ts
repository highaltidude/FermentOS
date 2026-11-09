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

  it("refuses a followed target no fermenter should aim at", () => {
    // 68 stored as °F but read as °C after the unit setting was flipped.
    expect(thermostatTarget({ setpointFrom: "fermentIdeal", setpointC: 18 }, brew({ fermentIdealC: 68 })))
      .toMatchObject({ ok: false, message: expect.stringMatching(/out of range/) });
    // 20 stored as °C but read as °F: -6.7 °C.
    expect(thermostatTarget({ setpointFrom: "fermentIdeal", setpointC: 18 }, brew({ fermentIdealC: (20 - 32) * 5 / 9 })).ok).toBe(false);
    expect(thermostatTarget({ setpointFrom: "conditionIdeal", setpointC: 18 }, brew({ conditionIdealC: 0 }))).toEqual({ ok: true, targetC: 0 });
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

// The shape the brew page's temperature control builds (brewTempControlTemplate
// in the frontend): each stage gets a heater (relay 1) and a cooler (relay 2).
describe("heat and cool on one probe", () => {
  const thermostat = (id: string, outputDeviceId: number, mode: "heat" | "cool", setpointFrom: string) => ({
    id, type: "control.thermostat", position: { x: 0, y: 0 },
    data: { config: { outputDeviceId, mode, setpointFrom, setpointC: 20, hysteresisC: 0.5, minOnSec: mode === "cool" ? 60 : 0, minOffSec: mode === "cool" ? 300 : 0 } },
  });
  const stage = (status: string) => ({ id: status, type: "condition.brewStatus", position: { x: 0, y: 0 }, data: { config: { statuses: [status] } } });
  const e = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });
  const result = validateFlowGraph({
    version: 1,
    nodes: [
      { id: "trigger", type: "trigger.temperature", position: { x: 0, y: 0 }, data: { config: { source: { kind: "shelly", outputDeviceId: 9 } } } },
      stage("fermenting"), thermostat("ferment-heat", 1, "heat", "fermentIdeal"), thermostat("ferment-cool", 2, "cool", "fermentIdeal"),
      stage("conditioning"), thermostat("condition-heat", 1, "heat", "conditionIdeal"), thermostat("condition-cool", 2, "cool", "conditionIdeal"),
    ],
    edges: [
      e("trigger", "fermenting"), e("fermenting", "ferment-heat"), e("fermenting", "ferment-cool"),
      e("trigger", "conditioning"), e("conditioning", "condition-heat"), e("conditioning", "condition-cool"),
    ],
  }, { isValidCron });

  it("is a valid graph", () => {
    expect(result.problems).toEqual([]);
    expect(result.compiled?.relays.sort()).toEqual([1, 2]);
  });

  it("never heats and cools at once across a temperature sweep, either way", () => {
    const flowC = result.compiled!;
    // Relays start off and keep whatever the last tick decided; no minimum times
    // block a switch because each step is ten minutes apart.
    const relays = new Map<number, { on: boolean; since: number | null }>();
    const temps = [...Array(81).keys()].map((i) => 15 + i * 0.1);
    let t = now.getTime();
    for (const tempC of [...temps, ...temps.reverse()]) {
      t += 600_000;
      const r = evaluateTemperatureTick(flowC, { tempC, now: new Date(t), brew: brew(), relays });
      expect(r.conflicts).toEqual([]);
      const heat = r.desired.get(1)!.on;
      const cool = r.desired.get(2)!.on;
      expect(heat && cool).toBe(false);
      // Target 19 °C, 0.5 °C band: heat only below it, cool only above it.
      if (heat) expect(tempC).toBeLessThan(19);
      if (cool) expect(tempC).toBeGreaterThan(19);
      for (const [id, want] of [[1, heat], [2, cool]] as const) {
        if (relays.get(id)?.on !== want) relays.set(id, { on: want, since: t });
      }
    }
  });

  it("follows the conditioning target once the brew moves on", () => {
    const r = evaluateTemperatureTick(result.compiled!, { tempC: 20, now, brew: brew({ status: "conditioning" }), relays: new Map() });
    expect(r.nodes["condition-heat"]).toMatchObject({ active: true, targetC: 21, relayOn: true });
    expect(r.nodes["ferment-cool"]).toMatchObject({ active: false });
    expect(r.desired.get(2)?.on).toBe(false);
  });
});
