import cron, { type ScheduledTask } from "node-cron";
import {
  db,
  flowsTable,
  flowRunsTable,
  outputDevicesTable,
  sensorDevicesTable,
  brewSessionsTable,
  type Flow,
  type OutputDevice,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { validateFlowGraph, type CompiledFlow, type FlowProblem } from "../lib/flows/graph.js";
import { evaluateTemperatureTick, renderMessage, type NodeState } from "../lib/flows/evaluate.js";
import { inTimeWindow, type FlowNode, type TempSource } from "../lib/flows/nodes.js";
import type { RelayTiming } from "../lib/flows/thermostat.js";
import { setShellyRelay } from "./shelly.js";
import { getLiveState, isReachable, noteRelayState } from "./devicePoller.js";
import { getLatestReading, getActiveAssignment } from "./sensorDevices.js";
import { sendNotification } from "./notifications.js";
import { getConfigValue } from "./appConfig.js";

/**
 * Brew Flow runtime.
 *
 * Temperature flows are evaluated on a fixed tick. Every relay they hold on is
 * re-sent "on" with a device-side timer each tick — the Shelly turns itself
 * off when the timer runs out, so if FermentOS, the Pi or the network stops,
 * the relay goes off within RELAY_HEARTBEAT_SEC. Schedule flows run once per
 * cron firing, and may only turn a relay on for a fixed time, which the
 * device also enforces.
 *
 * Anything that leaves a flow unable to know what it should do — stale or
 * missing temperature, an unreachable relay, an error — switches its relays
 * off, logs a fail-safe run and sends a notification.
 */

const TICK_SCHEDULE = "*/30 * * * * *";
const TICK_SEC = 30;
export const RELAY_HEARTBEAT_SEC = TICK_SEC * 3;
/** A Shelly probe value older than this is stale; the poller refreshes it every 10 s. */
const SHELLY_TEMP_MAX_AGE_MS = 60_000;
/** Sensor readings count as stale after this many missed report intervals. */
const SENSOR_STALE_INTERVALS = 3;
const SENSOR_STALE_MIN_MS = 10 * 60_000;
const SENSOR_STALE_DEFAULT_MS = 45 * 60_000;
/** After boot the device poller needs a moment; don't page anyone about it. */
const STARTUP_GRACE_MS = 60_000;

export type FlowLiveStatus = {
  flowId: number;
  kind: "temperature" | "schedule";
  lastTickAt: Date | null;
  tempC: number | null;
  /** Why the flow is holding its relays off, if it is. */
  failsafe: string | null;
  /** True during the startup grace period while the first readings arrive. */
  waiting: boolean;
  nodes: Record<string, NodeState>;
  nextRunAt: Date | null;
};

type ActiveFlow = { flow: Flow; compiled: CompiledFlow };

const active = new Map<number, ActiveFlow>();
const status = new Map<number, FlowLiveStatus>();
const scheduleTasks = new Map<number, ScheduledTask>();
const notifyActive = new Map<number, Set<string>>();
/** Relay state as FermentOS last set it, shared by every flow. */
const relayTiming = new Map<number, RelayTiming>();
/** Bumped on every reload so a schedule run sleeping in a delay can tell it was superseded. */
let generation = 0;
let startedAt = Date.now();
let ticking = false;

export function isValidCron(expr: string): boolean {
  return cron.validate(expr);
}

export function validateFlow(graph: unknown) {
  return validateFlowGraph(graph, { isValidCron });
}

/** Which enabled flow owns each relay. */
export function relayOwners(): Map<number, { flowId: number; name: string }> {
  const owners = new Map<number, { flowId: number; name: string }>();
  for (const { flow, compiled } of active.values()) {
    for (const relay of compiled.relays) owners.set(relay, { flowId: flow.id, name: flow.name });
  }
  return owners;
}

export function getFlowStatus(flowId: number): FlowLiveStatus | null {
  const s = status.get(flowId);
  if (!s) return null;
  return { ...s, nextRunAt: scheduleTasks.get(flowId)?.getNextRun() ?? null };
}

// ── Logging and notification ────────────────────────────────────────────────

async function logRun(
  flowId: number,
  trigger: string,
  runStatus: "ok" | "skipped" | "error" | "failsafe",
  message: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(flowRunsTable).values({ flowId, trigger, status: runStatus, message, detail: detail ?? null });
  } catch (err) {
    logger.error({ err, flowId }, "Failed to record flow run");
  }
}

async function setLastError(flowId: number, error: string | null): Promise<void> {
  const entry = active.get(flowId);
  if (entry && entry.flow.lastError === error) return;
  if (entry) entry.flow.lastError = error;
  await db.update(flowsTable).set({ lastError: error }).where(eq(flowsTable.id, flowId));
}

async function notify(flow: Flow, title: string, body: string, event: "flow_action" | "flow_failsafe"): Promise<void> {
  const result = await sendNotification({
    title: `${flow.name}: ${title}`,
    body,
    priority: event === "flow_failsafe" ? "high" : "default",
    meta: { event, flowId: flow.id, flowName: flow.name },
  });
  if (!result.ok && result.error !== "No notification channel configured") {
    logger.warn({ flowId: flow.id, error: result.error }, "Flow notification not delivered");
  }
}

async function formatTemp(tempC: number | null): Promise<string | null> {
  if (tempC == null) return null;
  const unit = (await getConfigValue("ferment_temp_unit")) === "C" ? "C" : "F";
  return unit === "C" ? `${tempC.toFixed(1)}°C` : `${(tempC * 9 / 5 + 32).toFixed(1)}°F`;
}

// ── Relays ──────────────────────────────────────────────────────────────────

async function loadDevices(ids: number[]): Promise<Map<number, OutputDevice>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(outputDevicesTable).where(inArray(outputDevicesTable.id, ids));
  return new Map(rows.map((d) => [d.id, d]));
}

/**
 * Drive a relay. "On" always carries the heartbeat timer and is re-sent every
 * tick; "off" is sent whenever we think it's on or the device says it is.
 * Returns whether the state changed from FermentOS's point of view.
 */
async function driveRelay(device: OutputDevice, on: boolean, timerSec = RELAY_HEARTBEAT_SEC): Promise<{ changed: boolean; ok: boolean }> {
  const prev = relayTiming.get(device.id);
  const live = getLiveState(device.id);
  if (!on && prev?.on === false && live?.ison !== true) return { changed: false, ok: true };

  const result = await setShellyRelay(device, on, on ? timerSec : undefined);
  if (!result.ok) {
    logger.warn({ deviceId: device.id, on, reason: result.reason }, "Flow could not switch relay");
    return { changed: false, ok: false };
  }
  noteRelayState(device.id, on);
  const changed = prev?.on !== on;
  if (changed) relayTiming.set(device.id, { on, since: Date.now() });
  return { changed, ok: true };
}

async function allOff(deviceIds: number[]): Promise<void> {
  const devices = await loadDevices(deviceIds);
  await Promise.all([...devices.values()].map((d) => driveRelay(d, false)));
}

// ── Temperature flows ───────────────────────────────────────────────────────

type SourceReading = { tempC: number | null; stale: string | null; brewStatus: string | null };

async function brewStatusFor(sensorDeviceId: number | null): Promise<string | null> {
  if (sensorDeviceId == null) return null;
  const assignment = await getActiveAssignment(sensorDeviceId);
  if (!assignment) return null;
  const [session] = await db
    .select({ status: brewSessionsTable.status })
    .from(brewSessionsTable)
    .where(eq(brewSessionsTable.id, assignment.brewSessionId));
  return session?.status ?? null;
}

async function readSource(source: TempSource, wantsBrewStatus: boolean): Promise<SourceReading> {
  if (source.kind === "shelly") {
    const [device] = await db.select().from(outputDevicesTable).where(eq(outputDevicesTable.id, source.outputDeviceId));
    if (!device) return { tempC: null, stale: "The temperature source relay has been removed", brewStatus: null };
    const brewStatus = wantsBrewStatus ? await brewStatusFor(device.probeSensorDeviceId) : null;
    const live = getLiveState(device.id);
    if (!live || !isReachable(live)) return { tempC: null, stale: `Can't reach ${device.name} to read its probe`, brewStatus };
    if (live.tempC == null) return { tempC: null, stale: `${device.name} has no temperature probe reading`, brewStatus };
    if (!live.at || Date.now() - live.at.getTime() > SHELLY_TEMP_MAX_AGE_MS) {
      return { tempC: null, stale: `${device.name}'s probe reading is out of date`, brewStatus };
    }
    return { tempC: live.tempC, stale: null, brewStatus };
  }

  const [sensor] = await db.select().from(sensorDevicesTable).where(eq(sensorDevicesTable.id, source.sensorDeviceId));
  if (!sensor) return { tempC: null, stale: "The temperature sensor has been removed", brewStatus: null };
  const brewStatus = wantsBrewStatus ? await brewStatusFor(sensor.id) : null;
  const reading = await getLatestReading(sensor.id);
  if (!reading || reading.temperature == null) return { tempC: null, stale: `${sensor.deviceName} hasn't reported a temperature`, brewStatus };
  const maxAge = reading.reportedInterval
    ? Math.max(SENSOR_STALE_MIN_MS, reading.reportedInterval * 1000 * SENSOR_STALE_INTERVALS)
    : SENSOR_STALE_DEFAULT_MS;
  if (Date.now() - reading.receivedAt.getTime() > maxAge) {
    return { tempC: null, stale: `${sensor.deviceName} hasn't reported for ${Math.round((Date.now() - reading.receivedAt.getTime()) / 60_000)} minutes`, brewStatus };
  }
  const tempC = (reading.temperatureUnit ?? "C").toUpperCase() === "F" ? (reading.temperature - 32) * 5 / 9 : reading.temperature;
  return { tempC, stale: null, brewStatus };
}

async function tickTemperatureFlow({ flow, compiled }: ActiveFlow): Promise<void> {
  const prev = status.get(flow.id);
  const now = new Date();
  const wantsBrewStatus = [...compiled.nodes.values()].some((n) => n.type === "condition.brewStatus");
  const reading = await readSource(compiled.source!, wantsBrewStatus);
  const devices = await loadDevices(compiled.relays);

  let failsafe = reading.stale;
  const missing = compiled.relays.filter((id) => !devices.has(id));
  if (!failsafe && missing.length > 0) failsafe = "A relay this flow switches has been removed";
  const unreachable = [...devices.values()].filter((d) => !isReachable(getLiveState(d.id)));
  if (!failsafe && unreachable.length > 0) failsafe = `Can't reach ${unreachable.map((d) => d.name).join(", ")}`;

  const waiting = !!failsafe && Date.now() - startedAt < STARTUP_GRACE_MS;
  const next: FlowLiveStatus = {
    flowId: flow.id,
    kind: "temperature",
    lastTickAt: now,
    tempC: reading.tempC,
    failsafe: waiting ? null : failsafe,
    waiting,
    nodes: Object.fromEntries([...compiled.nodes.keys()].map((id) => [id, { active: false }])),
    nextRunAt: null,
  };

  if (failsafe) {
    await Promise.all([...devices.values()].map((d) => driveRelay(d, false)));
    notifyActive.set(flow.id, new Set());
    status.set(flow.id, next);
    if (!waiting && prev?.failsafe !== failsafe) {
      await logRun(flow.id, "tick", "failsafe", `Relays off: ${failsafe}`);
      await notify(flow, "relays switched off", `${failsafe}. Its relays have been switched off until this is fixed.`, "flow_failsafe");
    }
    return;
  }

  const result = evaluateTemperatureTick(compiled, {
    tempC: reading.tempC!,
    now,
    brewStatus: reading.brewStatus,
    relays: relayTiming,
  });
  next.nodes = result.nodes;
  status.set(flow.id, next);

  const temp = await formatTemp(reading.tempC);
  if (prev?.failsafe) await logRun(flow.id, "tick", "ok", `Recovered: temperature ${temp}`);

  for (const [deviceId, want] of result.desired) {
    const device = devices.get(deviceId)!;
    const { changed, ok } = await driveRelay(device, want.on);
    if (!ok) {
      // The poller will mark it unreachable after a few misses and the next
      // tick fails safe; until then the device's own timer bounds the damage.
      continue;
    }
    if (changed) {
      await logRun(flow.id, "tick", "ok", `${device.name} ${want.on ? "on" : "off"} at ${temp} (${want.reason.replace(/_/g, " ")})`, {
        deviceId,
        nodeId: want.nodeId,
        tempC: reading.tempC,
      });
    }
  }

  // Notify on the edge only: the step being newly reached.
  const was = notifyActive.get(flow.id) ?? new Set<string>();
  for (const node of result.notify) {
    if (!was.has(node.id)) {
      const message = renderMessage(node.config.message, { flow: flow.name, temp });
      await notify(flow, "notification", message, "flow_action");
      await logRun(flow.id, "tick", "ok", `Sent notification: ${message}`, { nodeId: node.id });
    }
  }
  notifyActive.set(flow.id, new Set(result.notify.map((n) => n.id)));
  await setLastError(flow.id, null);
}

async function runTick(): Promise<void> {
  for (const entry of active.values()) {
    if (entry.compiled.kind !== "temperature") continue;
    try {
      await tickTemperatureFlow(entry);
    } catch (err) {
      logger.error({ err, flowId: entry.flow.id }, "Flow tick failed");
      const message = err instanceof Error ? err.message : String(err);
      await allOff(entry.compiled.relays).catch(() => {});
      const prev = status.get(entry.flow.id);
      if (prev?.failsafe !== "error") {
        await logRun(entry.flow.id, "tick", "error", `Relays off after an error: ${message}`);
        await notify(entry.flow, "relays switched off", `The flow hit an error (${message}) and its relays were switched off.`, "flow_failsafe");
      }
      status.set(entry.flow.id, { ...(prev ?? emptyStatus(entry)), failsafe: "error", lastTickAt: new Date() });
      await setLastError(entry.flow.id, message).catch(() => {});
    }
  }
}

function emptyStatus({ flow, compiled }: ActiveFlow): FlowLiveStatus {
  return {
    flowId: flow.id,
    kind: compiled.kind,
    lastTickAt: null,
    tempC: null,
    failsafe: null,
    waiting: false,
    nodes: Object.fromEntries([...compiled.nodes.keys()].map((id) => [id, { active: false }])),
    nextRunAt: null,
  };
}

// ── Schedule flows ──────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run a schedule flow once, top to bottom. Branches run side by side. */
export async function runScheduleFlow(flowId: number, trigger: "schedule" | "manual"): Promise<{ ok: boolean; message: string }> {
  const entry = active.get(flowId);
  if (!entry || entry.compiled.kind !== "schedule") return { ok: false, message: "Flow is not an enabled schedule flow" };
  const { flow, compiled } = entry;
  const gen = generation;
  const devices = await loadDevices(compiled.relays);
  const done: string[] = [];

  const visit = async (node: FlowNode): Promise<void> => {
    if (gen !== generation) return; // flow was edited or disabled mid-run
    switch (node.type) {
      case "condition.timeWindow":
        if (!inTimeWindow(node.config, new Date())) {
          done.push("skipped a branch outside its time window");
          return;
        }
        break;
      case "action.delay":
        await sleep(node.config.minutes * 60_000);
        if (gen !== generation) return;
        break;
      case "action.relay": {
        const device = devices.get(node.config.outputDeviceId);
        if (!device) throw new Error("A relay this flow switches has been removed");
        const on = node.config.action === "onFor";
        const { ok } = await driveRelay(device, on, on ? node.config.minutes! * 60 : undefined);
        if (!ok) throw new Error(`Couldn't reach ${device.name}`);
        done.push(on ? `${device.name} on for ${node.config.minutes} min` : `${device.name} off`);
        break;
      }
      case "action.notify": {
        const message = renderMessage(node.config.message, { flow: flow.name, temp: null });
        await notify(flow, "notification", message, "flow_action");
        done.push(`sent "${message}"`);
        break;
      }
    }
    await Promise.all((compiled.children.get(node.id) ?? []).map(visit));
  };

  try {
    await visit(compiled.trigger);
    const message = done.length > 0 ? done.join("; ") : "Nothing to do";
    await logRun(flow.id, trigger, done.length > 0 ? "ok" : "skipped", message);
    await setLastError(flow.id, null);
    return { ok: true, message };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, flowId }, "Schedule flow run failed");
    await logRun(flow.id, trigger, "error", message);
    await setLastError(flow.id, message);
    await notify(flow, "run failed", message, "flow_failsafe");
    return { ok: false, message };
  }
}

// ── Loading ─────────────────────────────────────────────────────────────────

/**
 * Re-read enabled flows from the database and reschedule. Called at boot and
 * after any flow is created, changed, enabled, disabled or deleted. Relays an
 * outgoing flow controlled are switched off unless another flow now owns them.
 */
export async function reloadFlows(): Promise<void> {
  generation++;
  const before = new Set([...active.values()].flatMap((a) => a.compiled.relays));

  for (const task of scheduleTasks.values()) void task.destroy();
  scheduleTasks.clear();
  active.clear();

  const flows = await db.select().from(flowsTable).where(eq(flowsTable.enabled, true));
  for (const flow of flows) {
    const { compiled, problems } = validateFlow(flow.graph);
    if (!compiled) {
      // Shouldn't happen — the API refuses to enable an invalid flow — but a
      // restore or a manual DB edit could get here.
      logger.warn({ flowId: flow.id, problems }, "Enabled flow is invalid; skipping");
      await setLastError(flow.id, problems[0]?.message ?? "Flow is invalid");
      continue;
    }
    active.set(flow.id, { flow, compiled });
    if (!status.has(flow.id) || status.get(flow.id)!.kind !== compiled.kind) status.set(flow.id, emptyStatus({ flow, compiled }));

    if (compiled.trigger.type === "trigger.schedule") {
      const flowId = flow.id;
      const task = cron.schedule(compiled.trigger.config.cron, () => {
        runScheduleFlow(flowId, "schedule").catch((err) => logger.error({ err, flowId }, "Schedule flow failed"));
      });
      scheduleTasks.set(flow.id, task);
    }
  }

  for (const id of [...status.keys()]) if (!active.has(id)) status.delete(id);
  for (const id of [...notifyActive.keys()]) if (!active.has(id)) notifyActive.delete(id);

  const after = new Set([...active.values()].flatMap((a) => a.compiled.relays));
  const released = [...before].filter((id) => !after.has(id));
  if (released.length > 0) await allOff(released);

  logger.info({ enabled: active.size }, "Brew flows loaded");
  // Act on the change now rather than up to a tick later.
  void tick();
}

function tick(): Promise<void> {
  if (ticking) return Promise.resolve();
  ticking = true;
  return runTick()
    .catch((err) => logger.error({ err }, "Flow tick pass failed"))
    .finally(() => {
      ticking = false;
    });
}

export function problemsSummary(problems: FlowProblem[]): string {
  return problems.map((p) => p.message).join("; ");
}

/**
 * Boot: switch off every relay an enabled flow controls — nothing is assumed
 * to still be in the state it was before the restart — then start ticking.
 */
export async function startFlowEngine(): Promise<void> {
  startedAt = Date.now();
  const flows = await db.select().from(flowsTable).where(eq(flowsTable.enabled, true));
  const relays = new Set<number>();
  for (const flow of flows) for (const r of validateFlow(flow.graph).compiled?.relays ?? []) relays.add(r);
  await allOff([...relays]).catch((err) => logger.error({ err }, "Failed to switch flow relays off at boot"));

  await reloadFlows();
  cron.schedule(TICK_SCHEDULE, () => void tick());
  logger.info("Flow engine started");
}
