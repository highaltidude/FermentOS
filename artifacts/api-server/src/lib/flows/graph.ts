import { NODE_TYPES, parseNodeConfig, controlledRelay, type FlowNode, type NodeType, type TempSource } from "./nodes.js";

/**
 * Flow graph validation and compilation.
 *
 * A flow is a tree: one trigger at the root, every other node fed by exactly
 * one edge. That rules out cycles and joins, which keeps the run semantics
 * obvious ("everything downstream of a passing condition runs").
 *
 * There are two kinds of flow, decided by the trigger:
 *   - temperature flows are re-evaluated on every engine tick. Relays they
 *     control are level-driven: on while the path to them is active, off
 *     otherwise. They can't use delays or timed relay runs.
 *   - schedule flows run once per cron firing, top to bottom. Their relay
 *     actions must be "off" or "on for N minutes" so nothing a schedule turns
 *     on can stay on if FermentOS goes away.
 */

export type FlowProblem = { nodeId: string | null; message: string };

export type CompiledFlow = {
  kind: "temperature" | "schedule";
  trigger: FlowNode;
  /** Temperature flows only. */
  source: TempSource | null;
  nodes: Map<string, FlowNode>;
  children: Map<string, FlowNode[]>;
  /** Output devices this flow switches. */
  relays: number[];
};

export type ValidateResult = { problems: FlowProblem[]; compiled: CompiledFlow | null };

type RawNode = { id?: unknown; type?: unknown; data?: unknown };
type RawEdge = { source?: unknown; target?: unknown };

const NODE_LABELS: Record<NodeType, string> = {
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

export function validateFlowGraph(graph: unknown, opts: { isValidCron: (expr: string) => boolean }): ValidateResult {
  const problems: FlowProblem[] = [];
  const fail = (): ValidateResult => ({ problems, compiled: null });
  const g = graph as { version?: unknown; nodes?: unknown; edges?: unknown } | null;

  if (!g || typeof g !== "object" || g.version !== 1 || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) {
    problems.push({ nodeId: null, message: "Flow graph is not in a format this version understands" });
    return fail();
  }

  // ── Nodes ──
  const nodes = new Map<string, FlowNode>();
  for (const raw of g.nodes as RawNode[]) {
    const id = typeof raw?.id === "string" && raw.id ? raw.id : null;
    if (!id) {
      problems.push({ nodeId: null, message: "A node is missing its id" });
      continue;
    }
    if (nodes.has(id)) {
      problems.push({ nodeId: id, message: "Two nodes share this id" });
      continue;
    }
    if (!(NODE_TYPES as readonly unknown[]).includes(raw.type)) {
      problems.push({ nodeId: id, message: `Unknown node type "${String(raw.type)}"` });
      continue;
    }
    const type = raw.type as NodeType;
    const config = parseNodeConfig(type, (raw.data as { config?: unknown } | undefined)?.config, opts.isValidCron);
    if (!config.ok) {
      problems.push({ nodeId: id, message: `${NODE_LABELS[type]}: ${config.error}` });
      continue;
    }
    nodes.set(id, { id, type, config: config.value } as FlowNode);
  }
  if (problems.length > 0) return fail();

  // ── Edges: build the tree ──
  const parentOf = new Map<string, string>();
  const children = new Map<string, FlowNode[]>();
  for (const e of g.edges as RawEdge[]) {
    const source = typeof e?.source === "string" ? e.source : "";
    const target = typeof e?.target === "string" ? e.target : "";
    if (!nodes.has(source) || !nodes.has(target)) {
      problems.push({ nodeId: null, message: "A connection points at a node that no longer exists" });
      continue;
    }
    if (source === target) {
      problems.push({ nodeId: source, message: "A node can't connect to itself" });
      continue;
    }
    if (parentOf.has(target)) {
      problems.push({ nodeId: target, message: "This node has more than one input; each step can only follow one other" });
      continue;
    }
    parentOf.set(target, source);
    children.set(source, [...(children.get(source) ?? []), nodes.get(target)!]);
  }

  const triggers = [...nodes.values()].filter((n) => n.type.startsWith("trigger."));
  if (triggers.length === 0) problems.push({ nodeId: null, message: "Add a trigger to start the flow" });
  if (triggers.length > 1) {
    for (const t of triggers.slice(1)) problems.push({ nodeId: t.id, message: "A flow can only have one trigger" });
  }
  for (const t of triggers) {
    if (parentOf.has(t.id)) problems.push({ nodeId: t.id, message: "Nothing can feed into a trigger" });
  }
  if (problems.length > 0) return fail();
  const trigger = triggers[0]!;

  // Reachability from the trigger. With one parent per node, anything not
  // reached is either disconnected or part of a cycle.
  const reached = new Set<string>([trigger.id]);
  const queue = [trigger.id];
  while (queue.length > 0) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (!reached.has(child.id)) {
        reached.add(child.id);
        queue.push(child.id);
      }
    }
  }
  for (const n of nodes.values()) {
    if (!reached.has(n.id)) problems.push({ nodeId: n.id, message: "Not connected to the trigger" });
  }
  if (nodes.size === 1) problems.push({ nodeId: trigger.id, message: "Add an action after the trigger" });

  // ── Per-kind rules ──
  const kind = trigger.type === "trigger.temperature" ? "temperature" : "schedule";
  const relayUses = new Map<number, string[]>();
  for (const n of nodes.values()) {
    const relay = controlledRelay(n);
    if (relay != null) relayUses.set(relay, [...(relayUses.get(relay) ?? []), n.id]);

    if (n.type === "control.thermostat" && (children.get(n.id)?.length ?? 0) > 0) {
      problems.push({ nodeId: n.id, message: "A thermostat must be the last step on its branch" });
    }
    if (kind === "temperature") {
      if (n.type === "action.delay") problems.push({ nodeId: n.id, message: "Delays only work in schedule flows" });
      if (n.type === "action.relay" && n.config.action !== "on") {
        problems.push({ nodeId: n.id, message: "In a temperature flow a relay is held on while its conditions pass; choose \"on\"" });
      }
    } else {
      if (n.type === "control.thermostat") problems.push({ nodeId: n.id, message: "A thermostat needs a temperature trigger" });
      if (n.type === "condition.compare") problems.push({ nodeId: n.id, message: "Comparing a temperature needs a temperature trigger" });
      if (n.type === "condition.brewStatus") problems.push({ nodeId: n.id, message: "Brew status needs a temperature trigger with a sensor" });
      if (n.type === "action.relay" && n.config.action === "on") {
        problems.push({ nodeId: n.id, message: "A schedule can't leave a relay on indefinitely; choose \"on for\" a number of minutes" });
      }
    }
  }
  // Two nodes in a level-driven flow fighting over one relay would flap it.
  if (kind === "temperature") {
    for (const ids of relayUses.values()) {
      for (const id of ids.slice(1)) problems.push({ nodeId: id, message: "Another step in this flow already switches this relay" });
    }
  }

  if (problems.length > 0) return fail();
  return {
    problems,
    compiled: {
      kind,
      trigger,
      source: trigger.type === "trigger.temperature" ? trigger.config.source : null,
      nodes,
      children,
      relays: [...relayUses.keys()],
    },
  };
}

/**
 * Relays this flow would switch that another enabled flow already owns.
 * A relay belongs to at most one enabled flow so two flows can't fight over it.
 */
export function relayConflicts(
  compiled: CompiledFlow,
  owners: Map<number, { flowId: number; name: string }>,
  selfId: number | null,
): FlowProblem[] {
  const problems: FlowProblem[] = [];
  for (const relay of compiled.relays) {
    const owner = owners.get(relay);
    if (owner && owner.flowId !== selfId) {
      const nodeId = [...compiled.nodes.values()].find((n) => controlledRelay(n) === relay)?.id ?? null;
      problems.push({ nodeId, message: `This relay is already controlled by the enabled flow "${owner.name}"` });
    }
  }
  return problems;
}
