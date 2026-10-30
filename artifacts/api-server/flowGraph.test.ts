import { describe, it, expect } from "vitest";
import { validateFlowGraph, relayConflicts } from "./src/lib/flows/graph.js";
import { evaluateTemperatureTick, renderMessage } from "./src/lib/flows/evaluate.js";
import { inTimeWindow } from "./src/lib/flows/nodes.js";

// Stand-in for node-cron's validator: five numeric/star fields.
const isValidCron = (expr: string) => /^([\d*/,-]+\s+){4}[\d*/,-]+$/.test(expr);
const validate = (graph: unknown) => validateFlowGraph(graph, { isValidCron });

type N = { id: string; type: string; config: Record<string, unknown> };
const graph = (nodes: N[], edges: [string, string][]) => ({
  version: 1,
  nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: { x: 0, y: 0 }, data: { config: n.config } })),
  edges: edges.map(([source, target], i) => ({ id: `e${i}`, source, target })),
});

const tempTrigger: N = { id: "t", type: "trigger.temperature", config: { source: { kind: "shelly", outputDeviceId: 7 } } };
const thermostat = (id = "th", outputDeviceId = 3): N => ({
  id,
  type: "control.thermostat",
  config: { outputDeviceId, mode: "heat", setpointC: 20, hysteresisC: 0.5 },
});
const schedule: N = { id: "s", type: "trigger.schedule", config: { cron: "0 6 * * *" } };

const fermentationFlow = graph([tempTrigger, thermostat()], [["t", "th"]]);

const problemsOf = (g: unknown) => validate(g).problems.map((p) => [p.nodeId, p.message]);

describe("validateFlowGraph — structure", () => {
  it("compiles a trigger → thermostat flow", () => {
    const { problems, compiled } = validate(fermentationFlow);
    expect(problems).toEqual([]);
    expect(compiled?.kind).toBe("temperature");
    expect(compiled?.relays).toEqual([3]);
    expect(compiled?.source).toEqual({ kind: "shelly", outputDeviceId: 7 });
  });

  it("rejects unknown formats", () => {
    expect(problemsOf({ version: 2, nodes: [], edges: [] })[0]?.[1]).toMatch(/format/);
    expect(problemsOf(null)[0]?.[1]).toMatch(/format/);
  });

  it("needs exactly one trigger, with nothing feeding it", () => {
    expect(problemsOf(graph([thermostat()], []))).toContainEqual([null, "Add a trigger to start the flow"]);
    expect(problemsOf(graph([tempTrigger, { ...schedule }], []))).toContainEqual(["s", "A flow can only have one trigger"]);
    const loopIntoTrigger = graph([tempTrigger, { id: "c", type: "condition.compare", config: { op: "lt", valueC: 18 } }], [["t", "c"], ["c", "t"]]);
    expect(problemsOf(loopIntoTrigger)).toContainEqual(["t", "Nothing can feed into a trigger"]);
  });

  it("rejects joins, disconnected nodes and cycles", () => {
    const c1: N = { id: "c1", type: "condition.compare", config: { op: "lt", valueC: 18 } };
    const c2: N = { id: "c2", type: "condition.compare", config: { op: "gt", valueC: 10 } };
    expect(problemsOf(graph([tempTrigger, c1, c2, thermostat()], [["t", "c1"], ["t", "c2"], ["c1", "th"], ["c2", "th"]])))
      .toContainEqual(["th", "This node has more than one input; each step can only follow one other"]);
    expect(problemsOf(graph([tempTrigger, c1, thermostat()], [["t", "th"]]))).toContainEqual(["c1", "Not connected to the trigger"]);
    // c1 ⇄ c2 is a cycle hanging off nothing: each has one parent but neither is reachable.
    expect(problemsOf(graph([tempTrigger, c1, c2, thermostat()], [["t", "th"], ["c1", "c2"], ["c2", "c1"]])))
      .toEqual([["c1", "Not connected to the trigger"], ["c2", "Not connected to the trigger"]]);
  });

  it("needs something after the trigger", () => {
    expect(problemsOf(graph([tempTrigger], []))).toContainEqual(["t", "Add an action after the trigger"]);
  });

  it("reports bad configs against the node", () => {
    const bad = graph([tempTrigger, { id: "th", type: "control.thermostat", config: { outputDeviceId: 3, mode: "heat", setpointC: 68 * 10 } }], [["t", "th"]]);
    expect(problemsOf(bad)).toEqual([["th", "Thermostat: Enter a target temperature"]]);
    expect(problemsOf(graph([{ ...schedule, config: { cron: "* * * * * *" } }], []))[0]?.[1]).toMatch(/cron/);
  });
});

describe("validateFlowGraph — rules per kind", () => {
  it("temperature flows can't delay, and hold relays with \"on\"", () => {
    const g = graph(
      [tempTrigger, { id: "d", type: "action.delay", config: { minutes: 5 } }, { id: "r", type: "action.relay", config: { outputDeviceId: 3, action: "onFor", minutes: 5 } }],
      [["t", "d"], ["d", "r"]],
    );
    const messages = problemsOf(g).map(([, m]) => m);
    expect(messages).toContain("Delays only work in schedule flows");
    expect(messages.some((m) => m?.includes('choose "on"'))).toBe(true);
  });

  it("temperature flows may share a relay across branches, not down one", () => {
    const siblings = graph([tempTrigger, thermostat("a", 3), thermostat("b", 3)], [["t", "a"], ["t", "b"]]);
    expect(problemsOf(siblings)).toEqual([]);
    expect(validate(siblings).compiled?.relays).toEqual([3]);

    const chained = graph(
      [tempTrigger, { id: "r", type: "action.relay", config: { outputDeviceId: 3, action: "on" } }, { id: "n", type: "action.notify", config: { message: "x" } }, thermostat("b", 3)],
      [["t", "r"], ["r", "n"], ["n", "b"]],
    );
    expect(problemsOf(chained)).toEqual([["b", "Another step on this branch already switches this relay"]]);
  });

  it("schedule flows must time-limit \"on\" and can't use temperature nodes", () => {
    const g = graph(
      [schedule, { id: "r", type: "action.relay", config: { outputDeviceId: 3, action: "on" } }, thermostat("th", 4)],
      [["s", "r"], ["s", "th"]],
    );
    const messages = problemsOf(g).map(([, m]) => m);
    expect(messages.some((m) => m?.includes("can't leave a relay on"))).toBe(true);
    expect(messages).toContain("A thermostat needs a temperature trigger");
  });

  it("a thermostat ends its branch", () => {
    const g = graph([tempTrigger, thermostat(), { id: "n", type: "action.notify", config: { message: "hi" } }], [["t", "th"], ["th", "n"]]);
    expect(problemsOf(g)).toEqual([["th", "A thermostat must be the last step on its branch"]]);
  });

  it("schedule flow: on for → delay → off is fine", () => {
    const g = graph(
      [
        schedule,
        { id: "on", type: "action.relay", config: { outputDeviceId: 3, action: "onFor", minutes: 30 } },
        { id: "d", type: "action.delay", config: { minutes: 30 } },
        { id: "off", type: "action.relay", config: { outputDeviceId: 3, action: "off" } },
      ],
      [["s", "on"], ["on", "d"], ["d", "off"]],
    );
    const { problems, compiled } = validate(g);
    expect(problems).toEqual([]);
    expect(compiled?.kind).toBe("schedule");
  });
});

describe("relayConflicts", () => {
  it("flags relays owned by another enabled flow, not by itself", () => {
    const compiled = validate(fermentationFlow).compiled!;
    const owners = new Map([[3, { flowId: 9, name: "Keezer" }]]);
    expect(relayConflicts(compiled, owners, 1)).toEqual([{ nodeId: "th", message: 'This relay is already controlled by the enabled flow "Keezer"' }]);
    expect(relayConflicts(compiled, owners, 9)).toEqual([]);
  });
});

describe("inTimeWindow", () => {
  // Local wall-clock time, `day` days after Sunday 2026-10-25.
  const local = (day: number, hh: number, mm: number) => new Date(2026, 9, 25 + day, hh, mm);

  it("handles same-day windows and day filters", () => {
    const cfg = { from: "08:00", to: "17:30", days: [1, 2, 3, 4, 5] };
    expect(inTimeWindow(cfg, local(1, 8, 0))).toBe(true); // Monday 08:00
    expect(inTimeWindow(cfg, local(1, 17, 30))).toBe(false); // end is exclusive
    expect(inTimeWindow(cfg, local(0, 12, 0))).toBe(false); // Sunday
  });

  it("handles windows that run past midnight, by the day they start", () => {
    const cfg = { from: "22:00", to: "06:00", days: [5] }; // Friday night
    expect(inTimeWindow(cfg, local(5, 23, 0))).toBe(true); // Friday 23:00
    expect(inTimeWindow(cfg, local(6, 5, 59))).toBe(true); // Saturday early morning
    expect(inTimeWindow(cfg, local(6, 23, 0))).toBe(false); // Saturday night
    expect(inTimeWindow({ ...cfg, days: [] }, local(2, 12, 0))).toBe(false); // midday
  });
});

describe("evaluateTemperatureTick", () => {
  const now = new Date(2026, 9, 26, 12, 0);

  it("drives the thermostat's relay", () => {
    const compiled = validate(fermentationFlow).compiled!;
    const cold = evaluateTemperatureTick(compiled, { tempC: 18, now, brew: null, relays: new Map() });
    expect(cold.desired.get(3)).toMatchObject({ on: true, nodeId: "th", reason: "heating" });
    expect(cold.nodes.th).toMatchObject({ active: true, relayOn: true });
  });

  it("turns off relays behind a failing condition", () => {
    const g = graph(
      [tempTrigger, { id: "b", type: "condition.brewStatus", config: { statuses: ["fermenting"] } }, thermostat()],
      [["t", "b"], ["b", "th"]],
    );
    const compiled = validate(g).compiled!;
    const result = evaluateTemperatureTick(compiled, { tempC: 18, now, brew: { status: "conditioning", stageStartedAt: null }, relays: new Map([[3, { on: true, since: null }]]) });
    expect(result.desired.get(3)).toMatchObject({ on: false, reason: "conditions not met" });
    expect(result.nodes.b?.active).toBe(false);
    expect(result.nodes.th?.active).toBe(false);
  });

  it("holds a plain relay on while a compare passes, and lists reached notify steps", () => {
    const g = graph(
      [
        tempTrigger,
        { id: "hot", type: "condition.compare", config: { op: "gt", valueC: 24 } },
        { id: "fan", type: "action.relay", config: { outputDeviceId: 5, action: "on" } },
        { id: "n", type: "action.notify", config: { message: "{flow} is at {temp}" } },
      ],
      [["t", "hot"], ["hot", "fan"], ["hot", "n"]],
    );
    const compiled = validate(g).compiled!;
    const hot = evaluateTemperatureTick(compiled, { tempC: 25, now, brew: null, relays: new Map() });
    expect(hot.desired.get(5)?.on).toBe(true);
    expect(hot.notify.map((n) => n.id)).toEqual(["n"]);
    const fine = evaluateTemperatureTick(compiled, { tempC: 20, now, brew: null, relays: new Map() });
    expect(fine.desired.get(5)?.on).toBe(false);
    expect(fine.notify).toEqual([]);
  });
});

describe("renderMessage", () => {
  it("fills placeholders", () => {
    expect(renderMessage("{flow} hit {temp}", { flow: "Keezer", temp: "68.0°F" })).toBe("Keezer hit 68.0°F");
    expect(renderMessage("{temp}", { flow: "x", temp: null })).toBe("—");
  });
});
