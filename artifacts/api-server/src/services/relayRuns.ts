import { db, relayRunsTable, outputDevicesTable } from "@workspace/db";
import { asc, eq, isNull, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { relayRunEnd, relayRunStep, type OpenRelayRun, type RelayRunContext } from "../lib/relayRunStep.js";

/**
 * Records how long each relay was on. Every switch FermentOS makes, and every
 * change the poller sees (the device's own timer running out, someone using
 * the Shelly app), goes through recordRelayState, which opens and closes rows
 * in relay_runs. Open runs are mirrored in memory so the flow engine's "on"
 * heartbeat every tick costs no database work.
 */

/** confirmedAt is refreshed this often while a relay stays on. */
const CONFIRM_INTERVAL_MS = 5 * 60_000;

type OpenRun = OpenRelayRun & { startedMs: number; confirmedMs: number; deadlineMs: number | null };

const open = new Map<number, OpenRun>();
/** Serialises updates per relay, so the poller and the flow engine can't both open a run. */
const queues = new Map<number, Promise<void>>();

/**
 * Note a relay's state. `timerSec` is the device-side timer an "on" was sent
 * with; `ctx` is what it's on for, when the caller knows.
 */
export function recordRelayState(
  deviceId: number,
  on: boolean,
  opts: { at?: Date; timerSec?: number; ctx?: RelayRunContext } = {},
): Promise<void> {
  const run = (queues.get(deviceId) ?? Promise.resolve())
    .then(() => apply(deviceId, on, opts))
    .catch((err) => logger.error({ err, deviceId }, "Failed to record relay run"));
  queues.set(deviceId, run);
  return run;
}

async function apply(deviceId: number, on: boolean, { at = new Date(), timerSec, ctx }: { at?: Date; timerSec?: number; ctx?: RelayRunContext }) {
  const now = at.getTime();
  const current = open.get(deviceId) ?? null;
  const deadlineMs = on && timerSec ? now + timerSec * 1000 : null;

  switch (relayRunStep(current, on, ctx)) {
    case "noop":
      if (current && on) {
        if (timerSec) current.deadlineMs = deadlineMs;
        if (now - current.confirmedMs >= CONFIRM_INTERVAL_MS) {
          current.confirmedMs = now;
          await db.update(relayRunsTable).set({ confirmedAt: at }).where(eq(relayRunsTable.id, current.id));
        }
      }
      return;
    case "close":
      await close(current!, now);
      open.delete(deviceId);
      return;
    case "adopt":
      current!.brewSessionId = ctx!.brewSessionId;
      current!.mode = ctx!.mode;
      current!.deadlineMs = deadlineMs;
      await db.update(relayRunsTable).set({ brewSessionId: ctx!.brewSessionId, mode: ctx!.mode }).where(eq(relayRunsTable.id, current!.id));
      return;
    case "reopen":
      await close(current!, now);
      open.delete(deviceId);
      break;
    case "open":
      break;
  }
  const [row] = await db
    .insert(relayRunsTable)
    .values({ outputDeviceId: deviceId, brewSessionId: ctx?.brewSessionId ?? null, mode: ctx?.mode ?? null, startedAt: at, confirmedAt: at })
    .returning({ id: relayRunsTable.id });
  open.set(deviceId, {
    id: row!.id,
    brewSessionId: ctx?.brewSessionId ?? null,
    mode: ctx?.mode ?? null,
    startedMs: now,
    confirmedMs: now,
    deadlineMs,
  });
}

async function close(run: OpenRun, atMs: number): Promise<void> {
  const end = relayRunEnd(atMs, run.startedMs, run.deadlineMs);
  await db.update(relayRunsTable).set({ endedAt: new Date(end), confirmedAt: new Date(end) }).where(eq(relayRunsTable.id, run.id));
}

/**
 * Boot: whatever was on before the restart is unknown now (the flow engine
 * switches its relays off next), so close every open run where it was last
 * known to be on, plus the device timer that kept it on after that at most.
 */
export async function closeStaleRelayRuns(heartbeatSec: number): Promise<void> {
  try {
    const closed = await db
      .update(relayRunsTable)
      .set({ endedAt: sql`LEAST(now(), ${relayRunsTable.confirmedAt} + make_interval(secs => ${heartbeatSec}))` })
      .where(isNull(relayRunsTable.endedAt))
      .returning({ id: relayRunsTable.id });
    open.clear();
    if (closed.length > 0) logger.info({ count: closed.length }, "Closed relay runs left open by a restart");
  } catch (err) {
    logger.error({ err }, "Failed to close relay runs left open by a restart");
  }
}

/** A brew's relay runs, oldest first, with each relay's name. A few hundred over a whole brew at most. */
export async function brewRelayRuns(brewSessionId: number) {
  return db
    .select({
      outputDeviceId: relayRunsTable.outputDeviceId,
      deviceName: outputDevicesTable.name,
      mode: relayRunsTable.mode,
      startedAt: relayRunsTable.startedAt,
      endedAt: relayRunsTable.endedAt,
    })
    .from(relayRunsTable)
    .innerJoin(outputDevicesTable, eq(outputDevicesTable.id, relayRunsTable.outputDeviceId))
    .where(eq(relayRunsTable.brewSessionId, brewSessionId))
    .orderBy(asc(relayRunsTable.startedAt));
}

/** A deleted relay's runs go with it (on delete cascade); drop the in-memory one too. */
export function forgetRelayRuns(deviceId: number): void {
  open.delete(deviceId);
  queues.delete(deviceId);
}

/** Whether any enabled output device has a relay (a probe-only Pill doesn't). */
export async function anyRelays(): Promise<boolean> {
  const rows = await db
    .select({ state: outputDevicesTable.lastState })
    .from(outputDevicesTable)
    .where(eq(outputDevicesTable.enabled, true));
  return rows.some((r) => r.state?.hasRelay !== false);
}
