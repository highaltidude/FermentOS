import type { FlowGraph, FlowGraphNode, FlowGraphNodeType, OutputDevice, SensorDeviceWithStatus } from "@workspace/api-client-react";

// Helpers for Brew Flow graphs on the client: templates, cron building and
// plain-language descriptions. The server (artifacts/api-server/src/lib/flows)
// is the authority on what a valid graph is; configs here mirror its shapes.
// Temperatures in configs are always °C.

export type TempUnit = "C" | "F";

export const toUnit = (c: number, unit: TempUnit) => (unit === "F" ? c * 9 / 5 + 32 : c);
export const fromUnit = (v: number, unit: TempUnit) => (unit === "F" ? (v - 32) * 5 / 9 : v);
/** Temperature differences (hysteresis) convert without the offset. */
export const deltaToUnit = (c: number, unit: TempUnit) => (unit === "F" ? c * 9 / 5 : c);
export const deltaFromUnit = (v: number, unit: TempUnit) => (unit === "F" ? v * 5 / 9 : v);
export const formatTemp = (c: number, unit: TempUnit) => `${toUnit(c, unit).toFixed(1)}°${unit}`;

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type ScheduleChoice =
  | { kind: "daily"; time: string; days: number[] }
  | { kind: "everyHours"; hours: number };

export function scheduleToCron(s: ScheduleChoice): string {
  if (s.kind === "everyHours") return `0 */${s.hours} * * *`;
  const [h, m] = s.time.split(":").map(Number);
  const days = s.days.length === 0 || s.days.length === 7 ? "*" : [...s.days].sort().join(",");
  return `${m} ${h} * * ${days}`;
}

/** Best-effort reading of a cron built by scheduleToCron; anything else is shown raw. */
export function describeCron(cron: string): string {
  const every = /^0 \*\/(\d+) \* \* \*$/.exec(cron);
  if (every) return `every ${every[1]} hours`;
  const daily = /^(\d+) (\d+) \* \* ([\d,*]+)$/.exec(cron);
  if (daily) {
    const time = `${daily[2]!.padStart(2, "0")}:${daily[1]!.padStart(2, "0")}`;
    if (daily[3] === "*") return `every day at ${time}`;
    return `${daily[3]!.split(",").map((d) => DAY_LABELS[Number(d)]).join(", ")} at ${time}`;
  }
  return `on schedule "${cron}"`;
}

type Lookups = { devices: OutputDevice[]; sensors: SensorDeviceWithStatus[]; unit: TempUnit };

function relayName(id: unknown, l: Lookups): string {
  return l.devices.find((d) => d.id === id)?.name ?? "a removed relay";
}

function sourceName(source: unknown, l: Lookups): string {
  const s = source as { kind?: string; sensorDeviceId?: number; outputDeviceId?: number } | undefined;
  if (s?.kind === "shelly") return `${relayName(s.outputDeviceId, l)} probe`;
  if (s?.kind === "sensor") return l.sensors.find((d) => d.device.id === s.sensorDeviceId)?.device.deviceName ?? "a removed sensor";
  return "no source";
}

const STATUS_LABELS: Record<string, string> = {
  brew_day: "Brew day",
  fermenting: "Fermenting",
  conditioning: "Conditioning",
  packaged: "Packaged",
};

export const NODE_LABELS: Record<FlowGraphNodeType, string> = {
  "trigger.schedule": "Schedule",
  "trigger.temperature": "Temperature",
  "condition.compare": "Compare",
  "condition.timeWindow": "Time window",
  "condition.brewStatus": "Brew status",
  "control.thermostat": "Thermostat",
  "action.relay": "Relay",
  "action.notify": "Notify",
  "action.delay": "Delay",
};

/** One line saying what a node does, e.g. "Heat to 68.0°F (±0.9°F) with Heat wrap". */
export function describeNode(node: FlowGraphNode, l: Lookups): string {
  const c = node.data.config as Record<string, any>;
  const t = (v: number) => formatTemp(v, l.unit);
  switch (node.type) {
    case "trigger.schedule":
      return `Runs ${describeCron(String(c.cron ?? ""))}`;
    case "trigger.temperature":
      return `Reads ${sourceName(c.source, l)}`;
    case "condition.compare":
      if (c.op === "between") return `If between ${t(c.valueC)} and ${t(c.value2C)}`;
      return `If ${c.op === "lt" ? "below" : "above"} ${t(c.valueC)}`;
    case "condition.timeWindow": {
      const days = Array.isArray(c.days) && c.days.length > 0 && c.days.length < 7
        ? ` on ${c.days.map((d: number) => DAY_LABELS[d]).join(", ")}` : "";
      return `If between ${c.from} and ${c.to}${days}`;
    }
    case "condition.brewStatus":
      return `If the brew is ${(c.statuses ?? []).map((s: string) => STATUS_LABELS[s] ?? s).join(" or ")}`;
    case "control.thermostat": {
      // The band is one-sided: heat comes on below the target and stops at it.
      const cool = c.mode === "cool";
      const start = cool ? c.setpointC + (c.hysteresisC ?? 0.5) : c.setpointC - (c.hysteresisC ?? 0.5);
      return `${cool ? "Cool" : "Heat"} to ${t(c.setpointC)} with ${relayName(c.outputDeviceId, l)}, on ${cool ? "above" : "below"} ${t(start)}`;
    }
    case "action.relay":
      if (c.action === "onFor") return `Turn ${relayName(c.outputDeviceId, l)} on for ${c.minutes} min`;
      return `Turn ${relayName(c.outputDeviceId, l)} ${c.action === "off" ? "off" : "on"}`;
    case "action.notify":
      return `Notify: "${c.message}"`;
    case "action.delay":
      return `Wait ${c.minutes} min`;
  }
}

/** Nodes in walk order from the trigger, with their depth, for a simple outline view. */
export function outline(graph: FlowGraph): { node: FlowGraphNode; depth: number }[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  for (const e of graph.edges) children.set(e.source, [...(children.get(e.source) ?? []), e.target]);
  const targets = new Set(graph.edges.map((e) => e.target));
  const roots = graph.nodes.filter((n) => !targets.has(n.id));
  const out: { node: FlowGraphNode; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    const node = byId.get(id);
    if (!node || seen.has(id)) return;
    seen.add(id);
    out.push({ node, depth });
    for (const c of children.get(id) ?? []) walk(c, depth + 1);
  };
  for (const r of roots) walk(r.id, 0);
  return out;
}

// ── Templates ──────────────────────────────────────────────────────────────

const node = (id: string, type: FlowGraphNodeType, y: number, config: Record<string, unknown>): FlowGraphNode => ({
  id,
  type,
  position: { x: 0, y },
  data: { config },
});
const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });

export type TempSourceChoice = { kind: "sensor"; sensorDeviceId: number } | { kind: "shelly"; outputDeviceId: number };

export function fermentationTemplate(opts: {
  source: TempSourceChoice;
  relayId: number;
  mode: "heat" | "cool";
  setpointC: number;
  hysteresisC: number;
  onlyWhileFermenting: boolean;
}): FlowGraph {
  const nodes = [node("trigger", "trigger.temperature", 0, { source: opts.source })];
  const edges = [];
  let last = "trigger";
  if (opts.onlyWhileFermenting) {
    nodes.push(node("status", "condition.brewStatus", 120, { statuses: ["fermenting", "conditioning"] }));
    edges.push(edge(last, "status"));
    last = "status";
  }
  nodes.push(
    node("thermostat", "control.thermostat", nodes.length * 120, {
      outputDeviceId: opts.relayId,
      mode: opts.mode,
      setpointC: Math.round(opts.setpointC * 100) / 100,
      hysteresisC: Math.round(opts.hysteresisC * 100) / 100,
      minOnSec: opts.mode === "cool" ? 60 : 0,
      minOffSec: opts.mode === "cool" ? 300 : 0,
    }),
  );
  edges.push(edge(last, "thermostat"));
  return { version: 1, nodes, edges };
}

export function timedRelayTemplate(opts: { schedule: ScheduleChoice; relayId: number; minutes: number; notify: string | null }): FlowGraph {
  const nodes = [
    node("trigger", "trigger.schedule", 0, { cron: scheduleToCron(opts.schedule) }),
    node("relay", "action.relay", 120, { outputDeviceId: opts.relayId, action: "onFor", minutes: opts.minutes }),
  ];
  const edges = [edge("trigger", "relay")];
  if (opts.notify) {
    nodes.push(node("notify", "action.notify", 240, { message: opts.notify }));
    edges.push(edge("relay", "notify"));
  }
  return { version: 1, nodes, edges };
}
