import { describe, expect, it } from "vitest";
import type { FlowGraph } from "@workspace/api-client-react";
import { allowedInKind, connectionProblem, cronToSchedule, defaultConfig, fermentationTemplate, flowKindOf, fromUnit, scheduleToCron, type ScheduleChoice } from "./flows";

const n = (id: string, type: FlowGraph["nodes"][number]["type"]) => ({ id, type, position: { x: 0, y: 0 }, data: { config: {} } });
const e = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });

describe("cronToSchedule", () => {
  it("round-trips what scheduleToCron builds", () => {
    const choices: ScheduleChoice[] = [
      { kind: "daily", time: "06:00", days: [] },
      { kind: "daily", time: "21:05", days: [1, 3, 5] },
      { kind: "everyHours", hours: 4 },
    ];
    for (const s of choices) expect(cronToSchedule(scheduleToCron(s))).toEqual(s);
  });

  it("returns null for anything the picker can't show", () => {
    expect(cronToSchedule("*/5 * * * *")).toBeNull();
    expect(cronToSchedule("0 6 1 * *")).toBeNull();
    expect(cronToSchedule("75 6 * * *")).toBeNull();
  });
});

describe("connectionProblem", () => {
  const graph = {
    nodes: [n("t", "trigger.temperature"), n("c", "condition.compare"), n("th", "control.thermostat"), n("r", "action.relay"), n("x", "action.notify")],
    edges: [e("t", "c"), e("c", "r")],
  };

  it("allows a new branch", () => {
    expect(connectionProblem(graph, "c", "th")).toBeNull();
    expect(connectionProblem(graph, "t", "x")).toBeNull();
  });

  it("rejects edges that break the tree", () => {
    expect(connectionProblem(graph, "c", "t")).toMatch(/trigger/);
    expect(connectionProblem(graph, "th", "x")).toMatch(/thermostat/);
    expect(connectionProblem(graph, "t", "r")).toMatch(/one other step/);
    expect(connectionProblem(graph, "x", "x")).toMatch(/itself/);
  });

  it("rejects loops", () => {
    const g = { nodes: [n("a", "condition.compare"), n("b", "condition.compare"), n("c", "action.notify")], edges: [e("a", "b"), e("b", "c")] };
    expect(connectionProblem(g, "c", "a")).toMatch(/loop/);
  });
});

describe("flow kinds", () => {
  it("follows the trigger", () => {
    expect(flowKindOf({ nodes: [] })).toBeNull();
    expect(flowKindOf({ nodes: [n("t", "trigger.schedule")] })).toBe("schedule");
    expect(flowKindOf({ nodes: [n("t", "trigger.temperature")] })).toBe("temperature");
  });

  it("limits steps to the ones the kind supports", () => {
    expect(allowedInKind("control.thermostat", "schedule")).toBe(false);
    expect(allowedInKind("action.delay", "temperature")).toBe(false);
    expect(allowedInKind("action.delay", "schedule")).toBe(true);
    expect(allowedInKind("control.thermostat", null)).toBe(true);
  });

  it("starts relay steps with an action the kind accepts", () => {
    expect(defaultConfig("action.relay", "C", "temperature")).toMatchObject({ action: "on" });
    expect(defaultConfig("action.relay", "C", "schedule")).toMatchObject({ action: "onFor", minutes: 15 });
  });

  it("stores default temperatures in °C", () => {
    expect(defaultConfig("control.thermostat", "F", "temperature")).toMatchObject({ setpointC: 20, hysteresisC: 0.56 });
    expect(defaultConfig("control.thermostat", "C", "temperature")).toMatchObject({ setpointC: 20, hysteresisC: 0.5 });
  });
});

describe("fermentationTemplate with a cold crash", () => {
  const g = fermentationTemplate({
    source: { kind: "shelly", outputDeviceId: 1 },
    relayId: 2,
    mode: "cool",
    setpointC: fromUnit(66, "F"),
    hysteresisC: 0.5,
    onlyWhileFermenting: false,
    coldCrash: { afterDays: 3, crashC: fromUnit(34, "F"), notify: true },
  });
  const byId = new Map(g.nodes.map((node) => [node.id, node.data.config as Record<string, unknown>]));

  it("hands one relay from the holding thermostats to the crash", () => {
    const thermostats = g.nodes.filter((node) => node.type === "control.thermostat");
    expect(thermostats.map((node) => node.id)).toEqual(["thermostat", "hold", "crash"]);
    expect(thermostats.every((node) => (node.data.config as { outputDeviceId: number }).outputDeviceId === 2)).toBe(true);
    expect(byId.get("before-crash")).toEqual({ status: "conditioning", op: "lessThan", days: 3 });
    expect(byId.get("crash-time")).toEqual({ status: "conditioning", op: "atLeast", days: 3 });
    expect(byId.get("crash")).toMatchObject({ mode: "cool", setpointC: 1.11 });
    expect(byId.get("hold")).toMatchObject({ setpointC: 18.89 });
  });

  it("keeps thermostats at the end of their branches, with the notify beside the crash", () => {
    const sources = new Set(g.edges.map((e) => e.source));
    expect(["thermostat", "hold", "crash"].some((id) => sources.has(id))).toBe(false);
    expect(g.edges).toContainEqual({ id: "crash-time-crash-notify", source: "crash-time", target: "crash-notify" });
  });
});
