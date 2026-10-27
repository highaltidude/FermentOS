import { compareTemp, inTimeWindow, stageAgePasses, type FlowNode } from "./nodes.js";
import { thermostatStep, type RelayTiming, type ThermostatReason } from "./thermostat.js";
import type { CompiledFlow } from "./graph.js";

/**
 * One tick of a temperature flow: walk the tree from the trigger, see which
 * nodes the current reading reaches, and work out the state every relay the
 * flow owns should be in. Anything not reached is driven off.
 */

export type TickInput = {
  tempC: number;
  now: Date;
  /** The brew the temperature source is assigned to, if any. */
  brew: BrewContext | null;
  /** Current relay state per output device, as the engine last left it. */
  relays: Map<number, RelayTiming>;
};

export type BrewContext = {
  status: string;
  /** When the brew last entered its current stage. */
  stageStartedAt: Date | null;
};

export type NodeState ={ active: boolean; relayOn?: boolean; reason?: ThermostatReason };

export type TickResult = {
  /** Desired relay state for every relay the flow owns. */
  desired: Map<number, { on: boolean; nodeId: string; reason: string }>;
  nodes: Record<string, NodeState>;
  /** Notify nodes reached this tick (the engine sends only on the inactive → active edge). */
  notify: Extract<FlowNode, { type: "action.notify" }>[];
  /** Relays wanted by more than one reached step; the engine fails safe on these. */
  conflicts: { relayId: number; nodeIds: string[] }[];
};

function conditionPasses(node: FlowNode, input: TickInput): boolean {
  switch (node.type) {
    case "condition.compare":
      return compareTemp(node.config, input.tempC);
    case "condition.timeWindow":
      return inTimeWindow(node.config, input.now);
    case "condition.brewStatus":
      return input.brew != null && (node.config.statuses as string[]).includes(input.brew.status);
    case "condition.stageAge":
      return stageAgePasses(node.config, input.brew, input.now);
    default:
      return true;
  }
}

export function evaluateTemperatureTick(flow: CompiledFlow, input: TickInput): TickResult {
  const result: TickResult = { desired: new Map(), nodes: {}, notify: [], conflicts: [] };
  for (const n of flow.nodes.values()) result.nodes[n.id] = { active: false };
  const now = input.now.getTime();
  const claimedBy = new Map<number, string[]>();
  const claim = (relayId: number, nodeId: string) => claimedBy.set(relayId, [...(claimedBy.get(relayId) ?? []), nodeId]);

  const visit = (node: FlowNode) => {
    if (!conditionPasses(node, input)) return;
    const state: NodeState = { active: true };
    result.nodes[node.id] = state;

    if (node.type === "control.thermostat") {
      const relay = input.relays.get(node.config.outputDeviceId) ?? { on: false, since: null };
      const step = thermostatStep(node.config, input.tempC, relay, now);
      state.relayOn = step.on;
      state.reason = step.reason;
      result.desired.set(node.config.outputDeviceId, { on: step.on, nodeId: node.id, reason: step.reason });
      claim(node.config.outputDeviceId, node.id);
    } else if (node.type === "action.relay") {
      state.relayOn = true;
      result.desired.set(node.config.outputDeviceId, { on: true, nodeId: node.id, reason: "conditions met" });
      claim(node.config.outputDeviceId, node.id);
    } else if (node.type === "action.notify") {
      result.notify.push(node);
    }
    for (const child of flow.children.get(node.id) ?? []) visit(child);
  };
  visit(flow.trigger);

  for (const [relayId, nodeIds] of claimedBy) {
    if (nodeIds.length > 1) result.conflicts.push({ relayId, nodeIds });
  }

  for (const relay of flow.relays) {
    if (!result.desired.has(relay)) {
      const nodeId = [...flow.nodes.values()].find(
        (n) => (n.type === "control.thermostat" || n.type === "action.relay") && n.config.outputDeviceId === relay,
      )!.id;
      result.desired.set(relay, { on: false, nodeId, reason: "conditions not met" });
    }
  }
  return result;
}

/** Fill {temp} and {flow} placeholders in a notify message. */
export function renderMessage(template: string, vars: { flow: string; temp: string | null }): string {
  return template.replace(/\{flow\}/g, vars.flow).replace(/\{temp\}/g, vars.temp ?? "—");
}
