import cron from "node-cron";
import { db, outputDevicesTable, sensorDevicesTable, type OutputDevice } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { getShellyStatus } from "./shelly.js";
import { ingestReading } from "./sensorIngest.js";

/**
 * Polls every enabled output device on a short interval and keeps its latest
 * state in memory. Request handlers and (later) the flow engine read that
 * live state instead of hitting the device themselves.
 *
 * Writes to the database are throttled — a Pi's SD card doesn't need a row
 * update every ten seconds per relay — and the add-on probe's temperature is
 * logged as a sensor reading every PROBE_LOG_INTERVAL_MS.
 */

const POLL_SCHEDULE = "*/10 * * * * *";
const STATE_WRITE_INTERVAL_MS = 60_000;
const PROBE_LOG_INTERVAL_MS = 5 * 60_000;
/** Consecutive failed polls before a device counts as unreachable. */
export const UNREACHABLE_AFTER_FAILURES = 3;

export type LiveDeviceState = {
  ison: boolean | null;
  /** Null until the device has answered once. */
  hasRelay: boolean | null;
  tempC: number | null;
  rssi: number | null;
  /** When the device last answered. */
  at: Date | null;
  failures: number;
  lastError: string | null;
};

const live = new Map<number, LiveDeviceState>();
const lastStateWrite = new Map<number, number>();
const lastProbeLog = new Map<number, number>();
let running = false;

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
 * Drop a device's cached state after it's disabled, deleted or re-addressed.
 * The probe-log throttle is kept, so editing a device doesn't log an extra reading.
 */
export function forgetDevice(deviceId: number): void {
  live.delete(deviceId);
  lastStateWrite.delete(deviceId);
}

/** The sensor_devices row standing in for this relay's add-on probe. */
async function ensureProbeSensor(device: OutputDevice): Promise<number> {
  if (device.probeSensorDeviceId != null) return device.probeSensorDeviceId;
  const deviceKey = `shelly:${device.id}`;
  let [sensor] = await db.select().from(sensorDevicesTable).where(eq(sensorDevicesTable.deviceKey, deviceKey));
  if (!sensor) {
    [sensor] = await db
      .insert(sensorDevicesTable)
      .values({ deviceType: "shelly_probe", deviceName: `${device.name} probe`, deviceKey, enabled: true })
      .returning();
  }
  await db
    .update(outputDevicesTable)
    .set({ probeSensorDeviceId: sensor!.id })
    .where(eq(outputDevicesTable.id, device.id));
  device.probeSensorDeviceId = sensor!.id;
  return sensor!.id;
}

async function pollDevice(device: OutputDevice, now: number): Promise<void> {
  const prev = live.get(device.id) ?? { ison: null, hasRelay: null, tempC: null, rssi: null, at: null, failures: 0, lastError: null };
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
  const { ison, hasRelay, tempC, rssi } = result.value;
  const changed = prev.ison !== ison || prev.hasRelay !== hasRelay || prev.at == null;
  live.set(device.id, { ison, hasRelay, tempC, rssi, at: new Date(now), failures: 0, lastError: null });

  if (changed || now - (lastStateWrite.get(device.id) ?? 0) >= STATE_WRITE_INTERVAL_MS) {
    lastStateWrite.set(device.id, now);
    await db
      .update(outputDevicesTable)
      .set({ lastSeenAt: new Date(now), lastState: { ison, hasRelay, tempC, rssi } })
      .where(eq(outputDevicesTable.id, device.id));
  }

  if (tempC != null && now - (lastProbeLog.get(device.id) ?? 0) >= PROBE_LOG_INTERVAL_MS) {
    lastProbeLog.set(device.id, now);
    const sensorId = await ensureProbeSensor(device);
    const [sensor] = await db.select().from(sensorDevicesTable).where(eq(sensorDevicesTable.id, sensorId));
    if (sensor?.enabled) {
      await ingestReading({
        deviceName: sensor.deviceName,
        deviceKey: sensor.deviceKey,
        deviceType: "shelly_probe",
        source: "shelly",
        temperature: tempC,
        temperatureUnit: "C",
        rssi,
        interval: PROBE_LOG_INTERVAL_MS / 1000,
        rawPayload: { shellyDeviceId: device.id, tempC },
      });
    }
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

export function startDevicePoller(): void {
  cron.schedule(POLL_SCHEDULE, () => {
    // A slow device can make one pass outlast the interval; skip rather than pile up.
    if (running) return;
    running = true;
    pollAllDevices()
      .catch((err) => logger.error({ err }, "Device poll pass failed"))
      .finally(() => {
        running = false;
      });
  });
  logger.info("Output device poller started");
}
