import cron from "node-cron";
import { db, outputDevicesTable, sensorDevicesTable, type OutputDevice } from "@workspace/db";
import { eq, like, or } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getShellyStatus, getPillMode } from "./shelly.js";
import type { ShellyProbe } from "../lib/shellyParse.js";
import {
  controlProbe,
  defaultProbeId,
  legacyProbeDeviceKey,
  probeDeviceKey,
  probeSensorName,
} from "../lib/shellyProbes.js";
import { ingestReading } from "./sensorIngest.js";

/**
 * Polls every enabled output device on a short interval and keeps its latest
 * state in memory. Request handlers and the flow engine read that live state
 * instead of hitting the device themselves.
 *
 * Writes to the database are throttled — a Pi's SD card doesn't need a row
 * update every ten seconds per relay — and each probe's temperature is logged
 * as a reading on its own sensor device every PROBE_LOG_INTERVAL_MS.
 */

const POLL_SCHEDULE = "*/10 * * * * *";
const STATE_WRITE_INTERVAL_MS = 60_000;
const PROBE_LOG_INTERVAL_MS = 5 * 60_000;
/** Consecutive failed polls before a device counts as unreachable. */
export const UNREACHABLE_AFTER_FAILURES = 3;

/** A probe as last read, with the sensor device it logs to (null until it has read once). */
export type LiveProbe = ShellyProbe & { sensorDeviceId: number | null };

export type LiveDeviceState = {
  ison: boolean | null;
  /** Null until the device has answered once. */
  hasRelay: boolean | null;
  /** The control probe's reading. */
  tempC: number | null;
  probes: LiveProbe[];
  /** Which probe tempC is from; null when the control probe isn't there. */
  controlProbeId: number | null;
  rssi: number | null;
  uptimeSec: number | null;
  isPill: boolean;
  /** The Pill's mode ("onewire", "ssr", …); read when first seen and when its relay comes or goes. */
  pillMode: string | null;
  /** When the device last answered. */
  at: Date | null;
  failures: number;
  lastError: string | null;
};

const live = new Map<number, LiveDeviceState>();
const lastStateWrite = new Map<number, number>();
/** Keyed by probe sensor deviceKey. */
const lastProbeLog = new Map<string, number>();
/** Sensor device id per probe sensor deviceKey, so a poll doesn't look each one up. */
const probeSensorIds = new Map<string, number>();
let running: Promise<void> | null = null;

export function getLiveState(deviceId: number): LiveDeviceState | null {
  return live.get(deviceId) ?? null;
}

export function isReachable(state: LiveDeviceState | null): boolean {
  return state != null && state.at != null && state.failures < UNREACHABLE_AFTER_FAILURES;
}

/** Record a relay state we just set, so the UI doesn't wait for the next poll. */
export function noteRelayState(deviceId: number, ison: boolean): void {
  const s = live.get(deviceId);
  if (s) s.ison = ison;
}

/**
 * Apply a newly chosen control probe to the live state, so flows follow it
 * from their next tick rather than the next poll. Returns the probe, if seen.
 */
export function noteControlProbe(deviceId: number, controlProbeId: number | null): LiveProbe | null {
  const s = live.get(deviceId);
  if (!s) return null;
  const control = controlProbe(s.probes, controlProbeId);
  s.controlProbeId = control?.id ?? null;
  s.tempC = control?.tempC ?? null;
  return control;
}

/**
 * Drop a device's cached state after it's disabled, deleted or re-addressed.
 * The probe-log throttle is kept, so editing a device doesn't log an extra reading.
 */
export function forgetDevice(deviceId: number): void {
  live.delete(deviceId);
  lastStateWrite.delete(deviceId);
}

/** Where a device's probe sensors are: its per-probe keys, and the one from before them. */
const probeSensorsWhere = (deviceId: number) =>
  or(eq(sensorDevicesTable.deviceKey, legacyProbeDeviceKey(deviceId)), like(sensorDevicesTable.deviceKey, `${legacyProbeDeviceKey(deviceId)}:%`));

/** Every sensor device standing in for one of this device's probes, unplugged ones included. */
export async function probeSensorsOf(deviceId: number) {
  return db.select().from(sensorDevicesTable).where(probeSensorsWhere(deviceId));
}

/** Forget cached probe sensor ids for a device, e.g. once it's deleted. */
export function forgetProbeSensors(deviceId: number): void {
  const prefix = `${legacyProbeDeviceKey(deviceId)}:`;
  for (const key of [...probeSensorIds.keys()]) if (key.startsWith(prefix)) probeSensorIds.delete(key);
}

/**
 * The sensor_devices row standing in for one probe, created on first sight.
 * The default probe adopts the device's sensor from before each probe had its
 * own, keeping its history and brew.
 */
async function ensureProbeSensor(device: OutputDevice, probeId: number, isDefault: boolean): Promise<number> {
  const deviceKey = probeDeviceKey(device.id, probeId);
  const cached = probeSensorIds.get(deviceKey);
  if (cached != null) return cached;

  let [sensor] = await db.select().from(sensorDevicesTable).where(eq(sensorDevicesTable.deviceKey, deviceKey));
  if (!sensor && isDefault) {
    [sensor] = await db
      .update(sensorDevicesTable)
      .set({ deviceKey, updatedAt: new Date() })
      .where(eq(sensorDevicesTable.deviceKey, legacyProbeDeviceKey(device.id)))
      .returning();
  }
  if (!sensor) {
    const existing = await probeSensorsOf(device.id);
    [sensor] = await db
      .insert(sensorDevicesTable)
      .values({ deviceType: "shelly_probe", deviceName: probeSensorName(device.name, existing.length + 1), deviceKey, enabled: true })
      .returning();
  }
  probeSensorIds.set(deviceKey, sensor!.id);
  return sensor!.id;
}

/** Log one probe's reading to its sensor device. */
async function logProbe(device: OutputDevice, probe: { id: number; tempC: number }, sensorId: number, rssi: number | null): Promise<void> {
  const [sensor] = await db.select().from(sensorDevicesTable).where(eq(sensorDevicesTable.id, sensorId));
  if (!sensor) {
    // Deleted under us; the next poll registers the probe afresh.
    probeSensorIds.delete(probeDeviceKey(device.id, probe.id));
    return;
  }
  if (!sensor.enabled) return;
  await ingestReading({
    deviceName: sensor.deviceName,
    deviceKey: sensor.deviceKey,
    deviceType: "shelly_probe",
    source: "shelly",
    temperature: probe.tempC,
    temperatureUnit: "C",
    rssi,
    interval: PROBE_LOG_INTERVAL_MS / 1000,
    rawPayload: { shellyDeviceId: device.id, probeId: probe.id, tempC: probe.tempC },
  });
}

async function pollDevice(device: OutputDevice, now: number): Promise<void> {
  const prev: LiveDeviceState = live.get(device.id) ?? {
    ison: null, hasRelay: null, tempC: null, probes: [], controlProbeId: null, rssi: null, uptimeSec: null, isPill: false,
    pillMode: null, at: null, failures: 0, lastError: null,
  };
  const result = await getShellyStatus(device);

  if (!result.ok) {
    const next = { ...prev, failures: prev.failures + 1, lastError: result.reason };
    live.set(device.id, next);
    if (next.failures === UNREACHABLE_AFTER_FAILURES) {
      logger.warn({ deviceId: device.id, reason: result.reason }, "Output device unreachable");
    }
    return;
  }

  // hasRelay changes when The Pill is switched between modes in the Shelly app.
  const { ison, hasRelay, rssi, uptimeSec, isPill } = result.value;
  const changed = prev.ison !== ison || prev.hasRelay !== hasRelay || prev.at == null;
  // The mode only explains the card; a failed read keeps the last one known.
  let pillMode = isPill ? prev.pillMode : null;
  if (isPill && (pillMode == null || prev.hasRelay !== hasRelay)) {
    const mode = await getPillMode(device);
    if (mode.ok) pillMode = mode.value;
  }

  // Register each probe as a sensor as soon as it reads, so it can be put on a
  // brew (and drive a flow) without waiting for its first logged reading.
  const defaultId = defaultProbeId(result.value.probes);
  const probes: LiveProbe[] = [];
  for (const p of result.value.probes) {
    const sensorDeviceId = p.tempC != null
      ? await ensureProbeSensor(device, p.id, p.id === defaultId)
      : (probeSensorIds.get(probeDeviceKey(device.id, p.id)) ?? null);
    probes.push({ ...p, sensorDeviceId });
  }
  // Pin the control probe on first sight. Left to "the lowest", a control
  // probe that dropped off the list (an add-on leaves an unplugged slot out)
  // would hand control to another probe, perhaps one in the room, not the brew.
  if (device.controlProbeId == null && defaultId != null) {
    await db.update(outputDevicesTable).set({ controlProbeId: defaultId }).where(eq(outputDevicesTable.id, device.id));
    device.controlProbeId = defaultId;
  }
  const control = controlProbe(probes, device.controlProbeId);
  const tempC = control?.tempC ?? null;
  live.set(device.id, {
    ison, hasRelay, tempC, probes, controlProbeId: control?.id ?? null, rssi, uptimeSec, isPill, pillMode,
    at: new Date(now), failures: 0, lastError: null,
  });

  if (changed || now - (lastStateWrite.get(device.id) ?? 0) >= STATE_WRITE_INTERVAL_MS) {
    lastStateWrite.set(device.id, now);
    await db
      .update(outputDevicesTable)
      .set({ lastSeenAt: new Date(now), lastState: { ison, hasRelay, tempC, probes, rssi, pillMode } })
      .where(eq(outputDevicesTable.id, device.id));
  }

  // probeSensorDeviceId follows the control probe, which is what ties a flow
  // reading this device to the brew it's on.
  const controlSensorId = control?.sensorDeviceId ?? null;
  if (controlSensorId != null && controlSensorId !== device.probeSensorDeviceId) {
    await db.update(outputDevicesTable).set({ probeSensorDeviceId: controlSensorId }).where(eq(outputDevicesTable.id, device.id));
    device.probeSensorDeviceId = controlSensorId;
  }

  for (const p of probes) {
    if (p.tempC == null || p.sensorDeviceId == null) continue;
    const key = probeDeviceKey(device.id, p.id);
    if (now - (lastProbeLog.get(key) ?? 0) < PROBE_LOG_INTERVAL_MS) continue;
    lastProbeLog.set(key, now);
    await logProbe(device, { id: p.id, tempC: p.tempC }, p.sensorDeviceId, rssi);
  }
}

export async function pollAllDevices(): Promise<void> {
  const devices = await db.select().from(outputDevicesTable).where(eq(outputDevicesTable.enabled, true));
  const now = Date.now();
  await Promise.all(
    devices.map((d) =>
      pollDevice(d, now).catch((err) => logger.error({ err, deviceId: d.id }, "Output device poll failed")),
    ),
  );
}

/**
 * Poll every device now, or wait for the pass already under way. Two passes at
 * once could save their device states out of order.
 */
export function pollNow(): Promise<void> {
  if (running) return running;
  running = pollAllDevices()
    .catch((err) => logger.error({ err }, "Device poll pass failed"))
    .finally(() => {
      running = null;
    });
  return running;
}

export function startDevicePoller(): void {
  cron.schedule(POLL_SCHEDULE, () => {
    // A slow device can make one pass outlast the interval; skip rather than pile up.
    if (running) return;
    void pollNow();
  });
  logger.info("Output device poller started");
}
