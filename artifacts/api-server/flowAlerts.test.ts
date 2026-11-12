import { describe, expect, it } from "vitest";
import { compareTemp, parseNodeConfig, type CompareConfig, type FlowNode } from "./src/lib/flows/nodes.js";
import { evaluateTemperatureTick, notifyDue } from "./src/lib/flows/evaluate.js";
import type { CompiledFlow } from "./src/lib/flows/graph.js";

const anyCron = () => true;
const cmp = (op: CompareConfig["op"], valueC: number, rearmC = 0, value2C: number | null = null): CompareConfig => ({
  op,
  valueC,
  value2C,
  rearmC,
});

describe("compareTemp", () => {
  it("is a plain threshold until it has passed", () => {
    expect(compareTemp(cmp("gt", 4, 1), 4.5)).toBe(true);
    expect(compareTemp(cmp("gt", 4, 1), 3.5)).toBe(false);
    expect(compareTemp(cmp("lt", 4, 1), 4.5)).toBe(false);
  });

  it("holds a passing gt until the temperature falls back past the margin", () => {
    expect(compareTemp(cmp("gt", 4, 1), 3.5, true)).toBe(true);
    expect(compareTemp(cmp("gt", 4, 1), 3.0, true)).toBe(false);
  });

  it("holds a passing lt until the temperature rises back past the margin", () => {
    expect(compareTemp(cmp("lt", 4, 1), 4.5, true)).toBe(true);
    expect(compareTemp(cmp("lt", 4, 1), 5.0, true)).toBe(false);
  });

  it("widens both ends of a passing between", () => {
    const c = cmp("between", 2, 0.5, 6);
    expect(compareTemp(c, 1.6, true)).toBe(true);
    expect(compareTemp(c, 6.4, true)).toBe(true);
    expect(compareTemp(c, 1.6, false)).toBe(false);
    expect(compareTemp(c, 1.4, true)).toBe(false);
  });

  it("ignores wasActive with no margin", () => {
    expect(compareTemp(cmp("gt", 4), 4, true)).toBe(false);
  });
});

describe("parseNodeConfig", () => {
  it("defaults a missing re-arm margin to 0, so existing flows are unchanged", () => {
    const r = parseNodeConfig("condition.compare", { op: "gt", valueC: 4 }, anyCron);
    expect(r).toEqual({ ok: true, value: { op: "gt", valueC: 4, value2C: null, rearmC: 0 } });
  });

  it("accepts a margin in range and rejects one outside it", () => {
    expect(parseNodeConfig("condition.compare", { op: "gt", valueC: 4, rearmC: 1.5 }, anyCron)).toMatchObject({
      ok: true,
      value: { rearmC: 1.5 },
    });
    expect(parseNodeConfig("condition.compare", { op: "gt", valueC: 4, rearmC: -1 }, anyCron).ok).toBe(false);
    expect(parseNodeConfig("condition.compare", { op: "gt", valueC: 4, rearmC: 11 }, anyCron).ok).toBe(false);
  });

  it("defaults a notify step to sending once", () => {
    expect(parseNodeConfig("action.notify", { message: "hi" }, anyCron)).toEqual({
      ok: true,
      value: { message: "hi", repeatMinutes: null },
    });
  });

  it("accepts a reminder interval in range and rejects one outside it", () => {
    expect(parseNodeConfig("action.notify", { message: "hi", repeatMinutes: 30 }, anyCron)).toMatchObject({
      ok: true,
      value: { repeatMinutes: 30 },
    });
    expect(parseNodeConfig("action.notify", { message: "hi", repeatMinutes: 1 }, anyCron).ok).toBe(false);
    expect(parseNodeConfig("action.notify", { message: "hi", repeatMinutes: 2000 }, anyCron).ok).toBe(false);
  });
});

describe("notifyDue", () => {
  const MIN = 60_000;
  it("sends the first time a step is reached", () => {
    expect(notifyDue(undefined, null, 0)).toBe("first");
  });
  it("stays quiet without a reminder interval", () => {
    expect(notifyDue(0, null, 999 * MIN)).toBeNull();
  });
  it("reminds once the interval has passed", () => {
    expect(notifyDue(0, 30, 29 * MIN)).toBeNull();
    expect(notifyDue(0, 30, 30 * MIN)).toBe("reminder");
  });
});

describe("evaluateTemperatureTick with a re-arm margin", () => {
  const trigger: FlowNode = { id: "t", type: "trigger.temperature", config: { source: { kind: "shelly", outputDeviceId: 1, probeId: 1 } } };
  const compare: FlowNode = { id: "c", type: "condition.compare", config: cmp("gt", 4, 1) };
  const notify: FlowNode = { id: "n", type: "action.notify", config: { message: "{flow}: {temp}", repeatMinutes: 30 } };
  const flow: CompiledFlow = {
    kind: "temperature",
    trigger,
    source: { kind: "shelly", outputDeviceId: 1, probeId: 1 },
    nodes: new Map<string, FlowNode>([["t", trigger], ["c", compare], ["n", notify]]),
    children: new Map<string, FlowNode[]>([["t", [compare]], ["c", [notify]]]),
    relays: [],
  };
  const tick = (tempC: number, prevActive?: Set<string>) =>
    evaluateTemperatureTick(flow, { tempC, now: new Date(0), brew: null, relays: new Map(), prevActive });

  it("reaches the notify step above the threshold", () => {
    expect(tick(4.5).notify.map((n) => n.id)).toEqual(["n"]);
  });

  it("keeps it reached inside the band once it has fired", () => {
    expect(tick(3.5).notify).toEqual([]);
    expect(tick(3.5, new Set(["t", "c", "n"])).notify.map((n) => n.id)).toEqual(["n"]);
  });

  it("lets go below the band", () => {
    expect(tick(2.9, new Set(["t", "c", "n"])).notify).toEqual([]);
  });
});
