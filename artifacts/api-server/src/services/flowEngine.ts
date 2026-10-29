import cron, { type ScheduledTask } from "node-cron";
import {
  db,
  flowsTable,
  flowRunsTable,
  outputDevicesTable,
  sensorDevicesTable,
  flowRecipesTable,
  recipesTable,
  type Flow,
  type OutputDevice,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { validateFlowGraph, type CompiledFlow, type FlowProblem } from "../lib/flows/graph.js";
import { evaluateTemperatureTick, renderMessage, type BrewContext, type NodeState } from "../lib/flows/evaluate.js";
import { inTimeWindow, type FlowNode, type TempSource } from "../lib/flows/nodes.js";
import type { RelayTiming } from "../lib/flows/thermostat.js";
import { setShellyRelay } from "./shelly.js";
import { getLiveState, isReachable, noteRelayState } from "./devicePoller.js";
import { getLatestReading, getActiveAssignment } from "./sensorDevices.js";
import { sendNotification } from "./notifications.js";
import { getConfigValue } from "./appConfig.js";
import { brewSnapshot } from "./brewStage.js";

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
  /** Why a recipe-linked flow is idle (its relays off, no alert), if it is. */
  standby: string | null;
  nodes: Record<string, NodeState>;
  nextRunAt: Date | null;
};

/** `recipes` empty = the flow runs for whatever brew is on its sensor. */
type ActiveFlow = { flow: Flow; compiled: CompiledFlow; recipes: { id: number; name: string }[] };

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

/** Validate a flow's graph, plus the one rule about its recipe links: only temperature flows have a brew to match. */
export function validateFlow(graph: unknown, linkedRecipes = 0) {
  const result = validateFlowGraph(graph, { isValidCron });
  if (result.compiled && linkedRecipes > 0 && result.compiled.kind !== "temperature") {
    return { problems: [{ nodeId: null, message: "Only temperature flows can follow a recipe; unlink its recipes or use a temperature trigger" }], compiled: null };
  }
  return result;
}

/** Recipes each flow is linked to, by flow id. */
export async function flowRecipeLinks(flowIds: number[]): Promise<Map<number, { id: number; name: string }[]>> {
  const links = new Map<number, { id: number; name: string }[]>();
  if (flowIds.length === 0) return links;
  const rows = await db
    .select({ flowId: flowRecipesTable.flowId, id: recipesTable.id, name: recipesTable.name })
    .from(flowRecipesTable)
    .innerJoin(recipesTable, eq(recipesTable.id, flowRecipesTable.recipeId))
    .where(inArray(flowRecipesTable.flowId, flowIds))
    .orderBy(recipesTable.name);
  for (const r of rows) links.set(r.flowId, [...(links.get(r.flowId) ?? []), { id: r.id, name: r.name }]);
  return links;
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

type SourceReading = { tempC: number | null; stale: string | null; brew: BrewContext | null };

/** The brew a sensor is assigned to: its recipe, stage (and since when) and ideal temperatures. */
async function brewContextFor(sensorDeviceId: number | null): Promise<BrewContext | null> {
  if (sensorDeviceId == null) return null;
  const assignment = await getActiveAssignment(sensorDeviceId);
  if (!assignment) return null;
  return brewSnapshot(assignment.brewSessionId);
}

/** Whether a tick needs to look up the sensor's brew at all. */
function needsBrew({ compiled, recipes }: ActiveFlow): boolean {
  if (recipes.length > 0) return true;
  return [...compiled.nodes.values()].some((n) =>
    n.type === "condition.brewStatus" ||
    n.type === "condition.stageAge" ||
    (n.type === "control.thermostat" && n.config.setpointFrom !== "fixed"));
}

/** Why a recipe-linked flow should sit this one out, or null if it should run. */
function standbyReason({ recipes }: ActiveFlow, brew: BrewContext | null): string | null {
  if (recipes.length === 0) return null;
  const names = recipes.map((r) => r.name).join(" or ");
  if (!brew) return `Standing by: no brew is assigned to the temperature sensor (waiting for ${names})`;
  if (brew.recipeId == null || !recipes.some((r) => r.id === brew.recipeId)) {
    return `Standing by: the sensor's brew (${brew.name}) isn't ${names}`;
  }
  return null;
}

async function readSource(source: TempSource, wantsBrew: boolean): Promise<SourceReading> {
  if (source.kind === "shelly") {
    const [device] = await db.select().from(outputDevicesTable).where(eq(outputDevicesTable.id, source.outputDeviceId));
    if (!device) return { tempC: null, stale: "The temperature source relay has been removed", brew: null };
    const brew = wantsBrew ? await brewContextFor(device.probeSensorDeviceId) : null;
    const live = getLiveState(device.id);
    if (!live || !isReachable(live)) return { tempC: null, stale: `Can't reach ${device.name} to read its probe`, brew };
    if (live.tempC == null) return { tempC: null, stale: `${device.name} has no temperature probe reading`, brew };
    if (!live.at || Date.now() - live.at.getTime() > SHELLY_TEMP_MAX_AGE_MS) {
      return { tempC: null, stale: `${device.name}'s probe reading is out of date`, brew };
    }
    return { tempC: live.tempC, stale: null, brew };
  }

  const [sensor] = await db.select().from(sensorDevicesTable).where(eq(sensorDevicesTable.id, source.sensorDeviceId));
  if (!sensor) return { tempC: null, stale: "The temperature sensor has been removed", brew: null };
  const brew = wantsBrew ? await brewContextFor(sensor.id) : null;
  const reading = await getLatestReading(sensor.id);
  if (!reading || reading.temperature == null) return { tempC: null, stale: `${sensor.deviceName} hasn't reported a temperature`, brew };
  const maxAge = reading.reportedInterval
    ? Math.max(SENSOR_STALE_MIN_MS, reading.reportedInterval * 1000 * SENSOR_STALE_INTERVALS)
    : SENSOR_STALE_DEFAULT_MS;
  if (Date.now() - reading.receivedAt.getTime() > maxAge) {
    return { tempC: null, stale: `${sensor.deviceName} hasn't reported for ${Math.round((Date.now() - reading.receivedAt.getTime()) / 60_000)} minutes`, brew };
  }
  const tempC = (reading.temperatureUnit ?? "C").toUpperCase() === "F" ? (reading.temperature - 32) * 5 / 9 : reading.temperature;
  return { tempC, stale: null, brew };
}

async function tickTemperatureFlow(entry: ActiveFlow): Promise<void> {
  const { flow, compiled } = entry;
  const prev = status.get(flow.id);
  const now = new Date();
  const reading = await readSource(compiled.source!, needsBrew(entry));
  const devices = await loadDevices(compiled.relays);
  // A reload while we were reading has already switched off what this flow no
  // longer owns; acting on the old graph now would switch it back on.
  if (superseded(entry)) return;

  // A recipe-linked flow with someone else's brew (or none) on its sensor is
  // idle, not broken: relays off, a note in the log, no alert. It takes
  // precedence over the fail-safes so an unused fermenter's stale probe
  // doesn't page anyone.
  const standby = standbyReason(entry, reading.brew);
  if (standby) {
    await Promise.all([...devices.values()].map((d) => driveRelay(d, false)));
    if (superseded(entry)) return;
    notifyActive.set(flow.id, new Set());
    status.set(flow.id, {
      flowId: flow.id,
      kind: "temperature",
      lastTickAt: now,
      tempC: reading.tempC,
      failsafe: null,
      waiting: false,
      standby,
      nodes: Object.fromEntries([...compiled.nodes.keys()].map((id) => [id, { active: false }])),
      nextRunAt: null,
    });
    if (prev?.standby !== standby) await logRun(flow.id, "tick", "skipped", standby);
    return;
  }
  // No brew means the recipe links were removed while standing by.
  if (prev?.standby) {
    await logRun(flow.id, "tick", "ok", reading.brew ? `Running: ${reading.brew.name} is on the sensor` : "Running: no longer linked to a recipe");
  }

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
    standby: null,
    nodes: Object.fromEntries([...compiled.nodes.keys()].map((id) => [id, { active: false }])),
    nextRunAt: null,
  };

  const holdOff = async (reason: string, quiet: boolean) => {
    await Promise.all([...devices.values()].map((d) => driveRelay(d, false)));
    if (superseded(entry)) return;
    notifyActive.set(flow.id, new Set());
    status.set(flow.id, next);
    if (!quiet && prev?.failsafe !== reason) {
      await logRun(flow.id, "tick", "failsafe", `Relays off: ${reason}`);
      await notify(flow, "relays switched off", `${reason}. Its relays have been switched off until this is fixed.`, "flow_failsafe");
    }
  };

  if (failsafe) {
    await holdOff(failsafe, waiting);
    return;
  }

  const result = evaluateTemperatureTick(compiled, {
    tempC: reading.tempC!,
    now,
    brew: reading.brew,
    relays: relayTiming,
  });
  next.nodes = result.nodes;

  // Branches that share a relay are meant to take turns (fermenting, then the
  // cold crash). If two pass at once there's no right answer, so fail off.
  if (result.conflicts.length > 0) {
    const names = result.conflicts.map((c) => devices.get(c.relayId)?.name ?? "a relay").join(", ");
    next.failsafe = `More than one step wants ${names} at the same time`;
    await holdOff(next.failsafe, false);
    return;
  }
  // A thermostat told to follow the brew's temperature has nothing to aim at.
  if (result.missingTargets.length > 0) {
    next.failsafe = result.missingTargets[0]!.message;
    await holdOff(next.failsafe, false);
    return;
  }
  status.set(flow.id, next);

  const temp = await formatTemp(reading.tempC);
  if (prev?.failsafe) await logRun(flow.id, "tick", "ok", `Recovered: temperature ${temp}`);

  const refused: string[] = [];
  for (const [deviceId, want] of result.desired) {
    const device = devices.get(deviceId)!;
    if (superseded(entry)) return;
    const { changed, ok } = await driveRelay(device, want.on);
    if (want.on && superseded(entry) && !relayOwners().has(deviceId)) {
      await driveRelay(device, false);
      return;
    }
    if (!ok) {
      // An unreachable relay fails safe on the next tick once the poller
      // notices; one that answers polls but refuses commands never would, so
      // it's reported here. The device's own timer bounds the damage.
      refused.push(device.name);
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

  const refusal = refused.length > 0 ? `${refused.join(", ")} didn't accept the command to switch` : null;
  if (refusal && flow.lastError !== refusal) {
    await logRun(flow.id, "tick", "error", refusal);
    await notify(flow, "relay not switching", `${refusal}. Check the device is set up as a relay and reachable.`, "flow_failsafe");
  }
  await setLastError(flow.id, refusal);
}

/** Whether a reload has replaced or removed this flow since the tick began. */
function superseded(entry: ActiveFlow): boolean {
  return active.get(entry.flow.id) !== entry;
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
      if (superseded(entry)) continue;
      const prev = status.get(entry.flow.id);
      if (prev?.failsafe !== "error") {
        await logRun(entry.flow.id, "tick", "error", `Relays off after an error: ${message}`);
        await notify(entry.flow, "relays switched off", `The flow hit an error (${message}) and its relays were switched off.`, "flow_failsafe").catch(() => {});
      }
      status.set(entry.flow.id, { ...(prev ?? emptyStatus(entry)), failsafe: "error", standby: null, lastTickAt: new Date() });
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
    standby: null,
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
  let devices = new Map<number, OutputDevice>();
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
        // Edited or disabled while the command was in flight: the reload's
        // "off" may have landed first, so don't leave the relay on behind it.
        if (on && gen !== generation && !relayOwners().has(device.id)) {
          await driveRelay(device, false);
          return;
        }
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
    devices = await loadDevices(compiled.relays);
    await visit(compiled.trigger);
    const message = done.length > 0 ? done.join("; ") : "Nothing to do";
    await logRun(flow.id, trigger, done.length > 0 ? "ok" : "skipped", message);
    await setLastError(flow.id, null);
    return { ok: true, message };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, flowId }, "Schedule flow run failed");
    await logRun(flow.id, trigger, "error", message);
    await setLastError(flow.id, message).catch(() => {});
    await notify(flow, "run failed", message, "flow_failsafe").catch(() => {});
    return { ok: false, message };
  }
}

// ── Loading ─────────────────────────────────────────────────────────────────

/**
 * Re-read enabled flows from the database and reschedule. Called at boot and
 * after any flow is created, changed, enabled, disabled or deleted. Relays an
 * outgoing flow controlled are switched off unless another flow now owns them.
 */
export function reloadFlows(): Promise<void> {
  // One at a time: two interleaved reloads would each schedule every schedule
  // flow, and the task handle the first one set would leak and fire forever.
  const run = reloadQueue.catch(() => {}).then(loadFlows);
  reloadQueue = run;
  return run;
}

let reloadQueue: Promise<void> = Promise.resolve();
/** False until a reload has succeeded; the tick retries until one does. */
let loaded = false;

async function loadFlows(): Promise<void> {
  // Read everything first: if the database is unavailable the flows already
  // running keep running rather than all being dropped.
  const flows = await db.select().from(flowsTable).where(eq(flowsTable.enabled, true));
  const links = await flowRecipeLinks(flows.map((f) => f.id));

  generation++;
  const before = new Set([...active.values()].flatMap((a) => a.compiled.relays));

  for (const task of scheduleTasks.values()) void task.destroy();
  scheduleTasks.clear();
  active.clear();

  for (const flow of flows) {
    const recipes = links.get(flow.id) ?? [];
    const { compiled, problems } = validateFlow(flow.graph, recipes.length);
    if (!compiled) {
      // Shouldn't happen — the API refuses to enable an invalid flow — but a
      // restore or a manual DB edit could get here.
      logger.warn({ flowId: flow.id, problems }, "Enabled flow is invalid; skipping");
      await setLastError(flow.id, problems[0]?.message ?? "Flow is invalid").catch(() => {});
      continue;
    }
    const entry = { flow, compiled, recipes };
    active.set(flow.id, entry);
    if (!status.has(flow.id) || status.get(flow.id)!.kind !== compiled.kind) status.set(flow.id, emptyStatus(entry));

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
  loaded = true;
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
  try {
    const flows = await db.select().from(flowsTable).where(eq(flowsTable.enabled, true));
    const relays = new Set<number>();
    for (const flow of flows) for (const r of validateFlow(flow.graph).compiled?.relays ?? []) relays.add(r);
    await allOff([...relays]);
  } catch (err) {
    logger.error({ err }, "Failed to switch flow relays off at boot");
  }

  await reloadFlows().catch((err) => logger.error({ err }, "Failed to load flows at boot; retrying every tick"));
  cron.schedule(TICK_SCHEDULE, () => {
    if (loaded) void tick();
    else reloadFlows().catch((err) => logger.error({ err }, "Failed to load flows"));
  });
  logger.info("Flow engine started");
}
