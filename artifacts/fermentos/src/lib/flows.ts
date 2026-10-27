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

/** The picker choice a cron came from, or null for a hand-written expression. */
export function cronToSchedule(cron: string): ScheduleChoice | null {
  const every = /^0 \*\/(\d+) \* \* \*$/.exec(cron);
  if (every) return { kind: "everyHours", hours: Number(every[1]) };
  const daily = /^(\d{1,2}) (\d{1,2}) \* \* (\*|[0-6](?:,[0-6])*)$/.exec(cron);
  if (!daily || Number(daily[1]) > 59 || Number(daily[2]) > 23) return null;
  const time = `${daily[2]!.padStart(2, "0")}:${daily[1]!.padStart(2, "0")}`;
  return { kind: "daily", time, days: daily[3] === "*" ? [] : daily[3]!.split(",").map(Number) };
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
  if (id == null) return "(no relay chosen)";
  return l.devices.find((d) => d.id === id)?.name ?? "a removed relay";
}

function sourceName(source: unknown, l: Lookups): string {
  const s = source as { kind?: string; sensorDeviceId?: number; outputDeviceId?: number } | undefined;
  if (s?.kind === "shelly") return `${relayName(s.outputDeviceId, l)} probe`;
  if (s?.kind === "sensor") return l.sensors.find((d) => d.device.id === s.sensorDeviceId)?.device.deviceName ?? "a removed sensor";
  return "(no sensor chosen)";
}

/** Where a thermostat's target comes from; mirrors SETPOINT_SOURCES on the server. */
export type SetpointSource = "fixed" | "fermentIdeal" | "conditionIdeal";
export const SETPOINT_LABELS: Record<SetpointSource, string> = {
  fixed: "A set temperature",
  fermentIdeal: "The brew's fermentation temp",
  conditionIdeal: "The brew's conditioning temp",
};

export const STATUS_LABELS: Record<string, string> = {
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
  "condition.stageAge": "Days in stage",
  "control.thermostat": "Thermostat",
  "action.relay": "Relay",
  "action.notify": "Notify",
  "action.delay": "Delay",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

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
    case "condition.stageAge":
      return `If ${STATUS_LABELS[c.status] ?? c.status} for ${c.op === "lessThan" ? "less than" : "at least"} ${plural(Number(c.days), "day")}`;
    case "control.thermostat": {
      const cool = c.mode === "cool";
      const from = (c.setpointFrom ?? "fixed") as SetpointSource;
      if (from !== "fixed") {
        return `${cool ? "Cool" : "Heat"} to ${SETPOINT_LABELS[from].toLowerCase()} with ${relayName(c.outputDeviceId, l)}`;
      }
      // The band is one-sided: heat comes on below the target and stops at it.
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

/** Horizontal spacing between template branches: a node card plus a gap. */
const NODE_COLUMN = 260;

const node = (id: string, type: FlowGraphNodeType, y: number, config: Record<string, unknown>, x = 0): FlowGraphNode => ({
  id,
  type,
  position: { x, y },
  data: { config },
});
const edge = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });

export type TempSourceChoice = { kind: "sensor"; sensorDeviceId: number } | { kind: "shelly"; outputDeviceId: number };

export const sourceKey = (source: unknown): string => {
  const s = source as Partial<{ kind: string; sensorDeviceId: number; outputDeviceId: number }> | null;
  if (s?.kind === "shelly") return `shelly:${s.outputDeviceId}`;
  if (s?.kind === "sensor") return `sensor:${s.sensorDeviceId}`;
  return "";
};

/**
 * Temperature sources for a picker: every sensor that reports temperature. A
 * Shelly probe reads its relay's live 10-second value rather than the logged
 * five-minute readings, so control is tighter.
 */
export function tempSourceOptions(sensors: SensorDeviceWithStatus[], devices: OutputDevice[]): { key: string; label: string; value: TempSourceChoice }[] {
  return sensors.map((s) => {
    const probe = s.device.deviceType === "shelly_probe";
    const owner = probe ? devices.find((d) => d.probeSensorDeviceId === s.device.id) : undefined;
    const value: TempSourceChoice = owner ? { kind: "shelly", outputDeviceId: owner.id } : { kind: "sensor", sensorDeviceId: s.device.id };
    return { key: sourceKey(value), label: `${s.device.deviceName} (${probe ? "Shelly probe" : "iSpindel"})`, value };
  });
}

export function fermentationTemplate(opts: {
  source: TempSourceChoice;
  relayId: number;
  mode: "heat" | "cool";
  setpointC: number;
  hysteresisC: number;
  onlyWhileFermenting: boolean;
  /** Cool to `crashC` once the brew has been conditioning for `afterDays`. Needs a cooling relay. */
  coldCrash?: { afterDays: number; crashC: number; notify: boolean } | null;
  /** Aim for the brew's own ideal temperatures (per stage) instead of `setpointC`. */
  followBrew?: boolean;
}): FlowGraph {
  const thermostat = (mode: "heat" | "cool", setpointC: number, setpointFrom: SetpointSource = "fixed") => ({
    outputDeviceId: opts.relayId,
    mode,
    setpointFrom,
    setpointC: Math.round(setpointC * 100) / 100,
    hysteresisC: Math.round(opts.hysteresisC * 100) / 100,
    minOnSec: mode === "cool" ? 60 : 0,
    minOffSec: mode === "cool" ? 300 : 0,
  });
  const fermentFrom: SetpointSource = opts.followBrew ? "fermentIdeal" : "fixed";
  const conditionFrom: SetpointSource = opts.followBrew ? "conditionIdeal" : "fixed";
  const nodes = [node("trigger", "trigger.temperature", 0, { source: opts.source })];
  const edges = [];

  if (opts.followBrew && !opts.coldCrash) {
    // One thermostat per stage, each following that stage's ideal temperature.
    nodes.push(
      node("fermenting", "condition.brewStatus", 150, { statuses: ["fermenting"] }, -NODE_COLUMN / 2),
      node("thermostat", "control.thermostat", 300, thermostat(opts.mode, opts.setpointC, fermentFrom), -NODE_COLUMN / 2),
      node("conditioning", "condition.brewStatus", 150, { statuses: ["conditioning"] }, NODE_COLUMN / 2),
      node("hold", "control.thermostat", 300, thermostat(opts.mode, opts.setpointC, conditionFrom), NODE_COLUMN / 2),
    );
    edges.push(edge("trigger", "fermenting"), edge("fermenting", "thermostat"), edge("trigger", "conditioning"), edge("conditioning", "hold"));
    return { version: 1, nodes, edges };
  }

  if (opts.coldCrash) {
    // Three branches share the relay and take turns: hold the target while
    // fermenting and early in conditioning, then crash. Exactly one passes at
    // a time; the engine fails off if that's ever not so.
    const { afterDays, crashC, notify } = opts.coldCrash;
    const col = (i: number) => (i - 1) * NODE_COLUMN;
    nodes.push(
      node("fermenting", "condition.brewStatus", 150, { statuses: ["fermenting"] }, col(0)),
      node("thermostat", "control.thermostat", 300, thermostat(opts.mode, opts.setpointC, fermentFrom), col(0)),
      node("before-crash", "condition.stageAge", 150, { status: "conditioning", op: "lessThan", days: afterDays }, col(1)),
      node("hold", "control.thermostat", 300, thermostat(opts.mode, opts.setpointC, conditionFrom), col(1)),
      node("crash-time", "condition.stageAge", 150, { status: "conditioning", op: "atLeast", days: afterDays }, col(2)),
      node("crash", "control.thermostat", 300, thermostat("cool", crashC), col(2)),
    );
    edges.push(
      edge("trigger", "fermenting"), edge("fermenting", "thermostat"),
      edge("trigger", "before-crash"), edge("before-crash", "hold"),
      edge("trigger", "crash-time"), edge("crash-time", "crash"),
    );
    if (notify) {
      nodes.push(node("crash-notify", "action.notify", 300, { message: "{flow}: cold crash started at {temp}" }, col(3)));
      edges.push(edge("crash-time", "crash-notify"));
    }
    return { version: 1, nodes, edges };
  }

  let last = "trigger";
  if (opts.onlyWhileFermenting) {
    nodes.push(node("status", "condition.brewStatus", 150, { statuses: ["fermenting", "conditioning"] }));
    edges.push(edge(last, "status"));
    last = "status";
  }
  nodes.push(node("thermostat", "control.thermostat", nodes.length * 150, thermostat(opts.mode, opts.setpointC)));
  edges.push(edge(last, "thermostat"));
  return { version: 1, nodes, edges };
}

export function timedRelayTemplate(opts: { schedule: ScheduleChoice; relayId: number; minutes: number; notify: string | null }): FlowGraph {
  const nodes = [
    node("trigger", "trigger.schedule", 0, { cron: scheduleToCron(opts.schedule) }),
    node("relay", "action.relay", 150, { outputDeviceId: opts.relayId, action: "onFor", minutes: opts.minutes }),
  ];
  const edges = [edge("trigger", "relay")];
  if (opts.notify) {
    nodes.push(node("notify", "action.notify", 300, { message: opts.notify }));
    edges.push(edge("relay", "notify"));
  }
  return { version: 1, nodes, edges };
}

// ── Editor ─────────────────────────────────────────────────────────────────

export type NodeCategory = "trigger" | "condition" | "control" | "action";
export type GraphKind = "temperature" | "schedule";

export const nodeCategory = (type: FlowGraphNodeType) => type.split(".")[0] as NodeCategory;

/** Triggers start a flow, so nothing feeds them. */
export const hasInput = (type: FlowGraphNodeType) => nodeCategory(type) !== "trigger";
/** A thermostat owns its relay outright, so it must end its branch. */
export const hasOutput = (type: FlowGraphNodeType) => type !== "control.thermostat";

export const PALETTE: { category: NodeCategory; label: string; types: FlowGraphNodeType[] }[] = [
  { category: "trigger", label: "Start with", types: ["trigger.temperature", "trigger.schedule"] },
  { category: "condition", label: "Only if", types: ["condition.compare", "condition.timeWindow", "condition.brewStatus", "condition.stageAge"] },
  { category: "control", label: "Control", types: ["control.thermostat"] },
  { category: "action", label: "Then", types: ["action.relay", "action.notify", "action.delay"] },
];

export const NODE_HINTS: Record<FlowGraphNodeType, string> = {
  "trigger.schedule": "Runs the steps below at set times.",
  "trigger.temperature": "Checks a sensor every 30 seconds and keeps the steps below up to date.",
  "condition.compare": "Continues only while the temperature is above, below or between values.",
  "condition.timeWindow": "Continues only between two times of day.",
  "condition.brewStatus": "Continues only while the sensor's brew is at one of these stages.",
  "condition.stageAge": "Continues only once the sensor's brew has been at a stage for a number of days (or until it has).",
  "control.thermostat": "Switches a relay to hold a target temperature.",
  "action.relay": "Turns a relay on or off.",
  "action.notify": "Sends a notification to your alert channel.",
  "action.delay": "Waits before the next step.",
};

/** Whether a node type can be used in a flow of the given kind (null = no trigger yet). */
export function allowedInKind(type: FlowGraphNodeType, kind: GraphKind | null): boolean {
  if (kind === null || nodeCategory(type) === "trigger") return true;
  if (kind === "schedule") return !["condition.compare", "condition.brewStatus", "condition.stageAge", "control.thermostat"].includes(type);
  return type !== "action.delay";
}

export function flowKindOf(graph: Pick<FlowGraph, "nodes">): GraphKind | null {
  const trigger = graph.nodes.find((n) => nodeCategory(n.type) === "trigger");
  if (!trigger) return null;
  return trigger.type === "trigger.schedule" ? "schedule" : "temperature";
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Starting config for a node added to the canvas, in °C like every stored config. */
export function defaultConfig(type: FlowGraphNodeType, unit: TempUnit, kind: GraphKind | null): Record<string, unknown> {
  const temp = (c: number, f: number) => round2(unit === "F" ? fromUnit(f, "F") : c);
  switch (type) {
    case "trigger.schedule":
      return { cron: "0 6 * * *" };
    case "trigger.temperature":
      return { source: null };
    case "condition.compare":
      return { op: "gt", valueC: temp(22, 72), value2C: null };
    case "condition.timeWindow":
      return { from: "22:00", to: "06:00", days: [] };
    case "condition.brewStatus":
      return { statuses: ["fermenting", "conditioning"] };
    case "condition.stageAge":
      return { status: "conditioning", op: "atLeast", days: 3 };
    case "control.thermostat":
      return { outputDeviceId: null, mode: "heat", setpointFrom: "fixed", setpointC: temp(20, 68), hysteresisC: round2(deltaFromUnit(unit === "F" ? 1 : 0.5, unit)), minOnSec: 0, minOffSec: 0 };
    case "action.relay":
      return kind === "schedule"
        ? { outputDeviceId: null, action: "onFor", minutes: 15 }
        : { outputDeviceId: null, action: "on", minutes: null };
    case "action.notify":
      return { message: kind === "schedule" ? "{flow} ran" : "{flow}: now {temp}" };
    case "action.delay":
      return { minutes: 10 };
  }
}

/**
 * Why an edge from `source` to `target` would break the flow's tree shape, or
 * null if it's fine. The server re-checks everything on save; this only stops
 * the canvas drawing an edge that could never be valid.
 */
export function connectionProblem(graph: Pick<FlowGraph, "nodes" | "edges">, source: string, target: string): string | null {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const from = byId.get(source);
  const to = byId.get(target);
  if (!from || !to) return "Unknown step";
  if (source === target) return "A step can't feed itself";
  if (!hasInput(to.type)) return "Nothing can feed a trigger";
  if (!hasOutput(from.type)) return "A thermostat must be the last step on its branch";
  if (graph.edges.some((e) => e.target === target)) return "Each step can only follow one other step";
  // Does `target` already lead back to `source`?
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === source) return "That would make a loop";
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of graph.edges) if (e.source === id) stack.push(e.target);
  }
  return null;
}
