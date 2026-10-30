import { compareTemp, inTimeWindow, stageAgePasses, type FlowNode, type ThermostatConfig } from "./nodes.js";
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
  /** The brew's name, for messages. */
  name: string;
  recipeId: number | null;
  status: string;
  /** When the brew last entered its current stage. */
  stageStartedAt: Date | null;
  /** Ideal temperatures for the brew (its own, else its recipe's), in °C. */
  fermentIdealC: number | null;
  conditionIdealC: number | null;
};

export type NodeState = { active: boolean; relayOn?: boolean; reason?: ThermostatReason; targetC?: number };

const TARGET_LABELS = { fermentIdeal: "fermentation", conditionIdeal: "conditioning" } as const;

/**
 * Bounds on a target followed from a brew. Brew temperatures are stored in the
 * unit of the day, so flipping the unit setting reinterprets them (68 °F read
 * as 68 °C); a target outside these is treated as missing, not obeyed.
 */
export const FOLLOWED_TARGET_MIN_C = -5;
export const FOLLOWED_TARGET_MAX_C = 40;

/** A thermostat's target this tick, or why there isn't one. */
export function thermostatTarget(
  cfg: Pick<ThermostatConfig, "setpointFrom" | "setpointC">,
  brew: BrewContext | null,
): { ok: true; targetC: number } | { ok: false; message: string } {
  if (cfg.setpointFrom === "fixed") return { ok: true, targetC: cfg.setpointC };
  if (!brew) return { ok: false, message: "No brew is assigned to the temperature sensor, so there's no target to follow" };
  const targetC = cfg.setpointFrom === "fermentIdeal" ? brew.fermentIdealC : brew.conditionIdealC;
  if (targetC == null) return { ok: false, message: `${brew.name} has no ideal ${TARGET_LABELS[cfg.setpointFrom]} temperature set` };
  if (targetC < FOLLOWED_TARGET_MIN_C || targetC > FOLLOWED_TARGET_MAX_C) {
    return {
      ok: false,
      message: `${brew.name}'s ideal ${TARGET_LABELS[cfg.setpointFrom]} temperature (${targetC.toFixed(1)}°C) is out of range; check it and the temperature unit setting`,
    };
  }
  return { ok: true, targetC };
}

export type TickResult = {
  /** Desired relay state for every relay the flow owns. */
  desired: Map<number, { on: boolean; nodeId: string; reason: string }>;
  nodes: Record<string, NodeState>;
  /** Notify nodes reached this tick (the engine sends only on the inactive → active edge). */
  notify: Extract<FlowNode, { type: "action.notify" }>[];
  /** Relays wanted by more than one reached step; the engine fails safe on these. */
  conflicts: { relayId: number; nodeIds: string[] }[];
  /** Reached thermostats that should follow the brew but have no target; the engine fails safe. */
  missingTargets: { nodeId: string; message: string }[];
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
  const result: TickResult = { desired: new Map(), nodes: {}, notify: [], conflicts: [], missingTargets: [] };
  for (const n of flow.nodes.values()) result.nodes[n.id] = { active: false };
  const now = input.now.getTime();
  const claimedBy = new Map<number, string[]>();
  const claim = (relayId: number, nodeId: string) => claimedBy.set(relayId, [...(claimedBy.get(relayId) ?? []), nodeId]);

  const visit = (node: FlowNode) => {
    if (!conditionPasses(node, input)) return;
    const state: NodeState = { active: true };
    result.nodes[node.id] = state;

    if (node.type === "control.thermostat") {
      const target = thermostatTarget(node.config, input.brew);
      if (!target.ok) {
        result.missingTargets.push({ nodeId: node.id, message: target.message });
        return;
      }
      const relay = input.relays.get(node.config.outputDeviceId) ?? { on: false, since: null };
      const step = thermostatStep({ ...node.config, setpointC: target.targetC }, input.tempC, relay, now);
      state.targetC = target.targetC;
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
