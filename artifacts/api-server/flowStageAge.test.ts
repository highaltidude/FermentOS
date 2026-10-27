import { describe, it, expect } from "vitest";
import { validateFlowGraph } from "./src/lib/flows/graph.js";
import { evaluateTemperatureTick, type BrewContext } from "./src/lib/flows/evaluate.js";
import { parseNodeConfig, stageAgePasses } from "./src/lib/flows/nodes.js";

const isValidCron = () => true;
const validate = (graph: unknown) => validateFlowGraph(graph, { isValidCron });
const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-26T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);

type N = { id: string; type: string; config: Record<string, unknown> };
const graph = (nodes: N[], edges: [string, string][]) => ({
  version: 1,
  nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: { x: 0, y: 0 }, data: { config: n.config } })),
  edges: edges.map(([source, target], i) => ({ id: `e${i}`, source, target })),
});

const trigger: N = { id: "t", type: "trigger.temperature", config: { source: { kind: "shelly", outputDeviceId: 7 } } };
const stageAge = (id: string, op: "atLeast" | "lessThan", days: number): N => ({ id, type: "condition.stageAge", config: { status: "conditioning", op, days } });
const cool = (id: string, setpointC: number): N => ({ id, type: "control.thermostat", config: { outputDeviceId: 3, mode: "cool", setpointC, hysteresisC: 0.5 } });

/** The cold crash template's shape: ferment and early-conditioning hold 19 °C, then crash to 1 °C on day 3. */
const crashFlow = graph(
  [
    trigger,
    { id: "fermenting", type: "condition.brewStatus", config: { statuses: ["fermenting"] } },
    cool("ferment", 19),
    stageAge("before", "lessThan", 3),
    cool("hold", 19),
    stageAge("after", "atLeast", 3),
    cool("crash", 1),
    { id: "n", type: "action.notify", config: { message: "{flow}: crashing" } },
  ],
  [["t", "fermenting"], ["fermenting", "ferment"], ["t", "before"], ["before", "hold"], ["t", "after"], ["after", "crash"], ["after", "n"]],
);

describe("condition.stageAge config", () => {
  it("parses and rounds days to a tenth", () => {
    expect(parseNodeConfig("condition.stageAge", { status: "conditioning", op: "atLeast", days: 2.54 }, isValidCron))
      .toEqual({ ok: true, value: { status: "conditioning", op: "atLeast", days: 2.5 } });
  });

  it("rejects bad stages, comparisons and day counts", () => {
    expect(parseNodeConfig("condition.stageAge", { status: "boiling", op: "atLeast", days: 1 }, isValidCron).ok).toBe(false);
    expect(parseNodeConfig("condition.stageAge", { status: "conditioning", op: "gt", days: 1 }, isValidCron).ok).toBe(false);
    expect(parseNodeConfig("condition.stageAge", { status: "conditioning", op: "atLeast", days: -1 }, isValidCron).ok).toBe(false);
  });

  it("needs a temperature trigger", () => {
    const g = graph(
      [{ id: "s", type: "trigger.schedule", config: { cron: "0 6 * * *" } }, stageAge("a", "atLeast", 1), { id: "n", type: "action.notify", config: { message: "x" } }],
      [["s", "a"], ["a", "n"]],
    );
    expect(validate(g).problems.map((p) => p.message)).toContain("Days in stage needs a temperature trigger with a sensor");
  });
});

describe("stageAgePasses", () => {
  const cfg = { status: "conditioning" as const, op: "atLeast" as const, days: 3 };
  it("counts from the stage start", () => {
    expect(stageAgePasses(cfg, { status: "conditioning", stageStartedAt: daysAgo(2.9) }, now)).toBe(false);
    expect(stageAgePasses(cfg, { status: "conditioning", stageStartedAt: daysAgo(3) }, now)).toBe(true);
    expect(stageAgePasses({ ...cfg, op: "lessThan" }, { status: "conditioning", stageStartedAt: daysAgo(2.9) }, now)).toBe(true);
    expect(stageAgePasses({ ...cfg, op: "lessThan" }, { status: "conditioning", stageStartedAt: daysAgo(3) }, now)).toBe(false);
  });

  it("never passes for another stage, an unknown start or no brew", () => {
    expect(stageAgePasses(cfg, { status: "fermenting", stageStartedAt: daysAgo(10) }, now)).toBe(false);
    expect(stageAgePasses({ ...cfg, op: "lessThan" }, { status: "fermenting", stageStartedAt: daysAgo(1) }, now)).toBe(false);
    expect(stageAgePasses(cfg, { status: "conditioning", stageStartedAt: null }, now)).toBe(false);
    expect(stageAgePasses(cfg, null, now)).toBe(false);
  });
});

describe("cold crash hand-off", () => {
  const compiled = validate(crashFlow).compiled!;
  const tick = (brew: BrewContext | null, tempC: number) =>
    evaluateTemperatureTick(compiled, { tempC, now, brew, relays: new Map() });

  it("compiles with one relay shared by three thermostats", () => {
    expect(validate(crashFlow).problems).toEqual([]);
    expect(compiled.relays).toEqual([3]);
  });

  it("holds 19 °C while fermenting and early in conditioning", () => {
    for (const brew of [{ status: "fermenting", stageStartedAt: daysAgo(5) }, { status: "conditioning", stageStartedAt: daysAgo(1) }]) {
      const r = tick(brew, 20);
      expect(r.conflicts).toEqual([]);
      expect(r.desired.get(3)).toMatchObject({ on: true, reason: "cooling" });
      expect(r.nodes.crash?.active).toBe(false);
    }
  });

  it("crashes from day 3, cooling a 19 °C beer, and notifies", () => {
    const r = tick({ status: "conditioning", stageStartedAt: daysAgo(3.5) }, 19);
    expect(r.conflicts).toEqual([]);
    expect(r.desired.get(3)).toMatchObject({ on: true, nodeId: "crash", reason: "cooling" });
    expect(r.notify.map((n) => n.id)).toEqual(["n"]);
  });

  it("drives the relay off with no brew assigned", () => {
    const r = tick(null, 25);
    expect(r.desired.get(3)).toMatchObject({ on: false, reason: "conditions not met" });
  });

  it("reports a conflict when two branches for one relay pass at once", () => {
    const overlapping = validate(graph(
      [trigger, stageAge("a", "atLeast", 1), cool("x", 19), stageAge("b", "atLeast", 2), cool("y", 1)],
      [["t", "a"], ["a", "x"], ["t", "b"], ["b", "y"]],
    )).compiled!;
    const r = evaluateTemperatureTick(overlapping, { tempC: 20, now, brew: { status: "conditioning", stageStartedAt: daysAgo(5) }, relays: new Map() });
    expect(r.conflicts).toEqual([{ relayId: 3, nodeIds: ["x", "y"] }]);
  });
});
