import { db, sensorDevicesTable, sensorReadingsTable, fermentationReadingsTable, brewSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { estimateBatteryPercent } from "../lib/batteryUtil";
import { getActiveAssignment } from "./sensorDevices";

/**
 * Store one reading from a sensor device: the iSpindel webhook, its simulator,
 * and the Shelly temperature add-on all come through here, so they share
 * device auto-registration, brew assignment and the fermentation chart mirror.
 */
export async function ingestReading(opts: {
  deviceName: string;
  deviceKey: string;
  /** sensor_devices.device_type for an auto-created device. */
  deviceType?: string;
  /** fermentation_readings.source for the chart mirror. */
  source?: "ispindel" | "shelly";
  gravity?: number | null;
  temperature?: number | null;
  temperatureUnit?: string | null;
  angle?: number | null;
  battery?: number | null;
  rssi?: number | null;
  interval?: number | null;
  rawPayload?: unknown;
  brewSessionId?: number | null;
}): Promise<number> {
  // Find or auto-create the device
  let [device] = await db
    .select()
    .from(sensorDevicesTable)
    .where(eq(sensorDevicesTable.deviceKey, opts.deviceKey));

  if (!device) {
    [device] = await db
      .insert(sensorDevicesTable)
      .values({
        deviceType: opts.deviceType ?? "ispindel",
        deviceName: opts.deviceName,
        deviceKey: opts.deviceKey,
        enabled: true,
      })
      .returning();
  }

  // Update lastSeenAt
  await db
    .update(sensorDevicesTable)
    .set({ lastSeenAt: new Date(), updatedAt: new Date() })
    .where(eq(sensorDevicesTable.id, device!.id));

  // Resolve active brew assignment
  let brewSessionId = opts.brewSessionId ?? null;
  if (brewSessionId == null) {
    const activeAssignment = await getActiveAssignment(device!.id);
    brewSessionId = activeAssignment?.brewSessionId ?? null;
  }

  // Store sensor reading
  const batteryPct = opts.battery != null ? estimateBatteryPercent(opts.battery) : null;
  const [reading] = await db
    .insert(sensorReadingsTable)
    .values({
      deviceId: device!.id,
      brewSessionId,
      gravity: opts.gravity ?? null,
      temperature: opts.temperature ?? null,
      temperatureUnit: opts.temperatureUnit ?? "C",
      angle: opts.angle ?? null,
      battery: opts.battery ?? null,
      batteryPercentEstimate: batteryPct,
      rssi: opts.rssi != null ? Math.round(opts.rssi) : null,
      reportedInterval: opts.interval != null ? Math.round(opts.interval) : null,
      rawPayload: opts.rawPayload ?? null,
      receivedAt: new Date(),
    })
    .returning();

  // Mirror to fermentation_readings so existing brew charts pick up device data.
  // Skip mirroring if the assigned session is already packaged — raw sensor
  // readings are still stored above for audit purposes, but we don't want to
  // append to the fermentation chart of a finished batch.
  let sessionIsPackaged = false;
  if (brewSessionId) {
    const [assignedSession] = await db
      .select({ status: brewSessionsTable.status })
      .from(brewSessionsTable)
      .where(eq(brewSessionsTable.id, brewSessionId));
    sessionIsPackaged = assignedSession?.status === "packaged";
  }

  if (!sessionIsPackaged && brewSessionId && (opts.gravity != null || opts.temperature != null)) {
    // Convert temperature to °F for the fermentation_readings table (stored in °F)
    let tempF: number | null = null;
    if (opts.temperature != null) {
      if ((opts.temperatureUnit ?? "C").toUpperCase() === "F") {
        tempF = opts.temperature;
      } else {
        tempF = opts.temperature * 9 / 5 + 32;
      }
    }
    await db.insert(fermentationReadingsTable).values({
      brewSessionId,
      readingAt: new Date(),
      temperatureFahrenheit: tempF,
      gravity: opts.gravity ?? null,
      notes: opts.deviceName ?? null,
      source: opts.source ?? "ispindel",
    });
  }

  return reading!.id;
}
