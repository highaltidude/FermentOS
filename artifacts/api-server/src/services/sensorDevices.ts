import {
  db, sensorDevicesTable, sensorReadingsTable, sensorDeviceBrewAssignmentsTable, brewSessionsTable, fermentationReadingsTable,
  type SensorAssignmentRole,
} from "@workspace/db";
import { eq, desc, isNull, and, or } from "drizzle-orm";
import { calcConnectionStatus, buildAlerts } from "./brewAlerts";

/**
 * Per-device lookups shared by the sensor, Home Assistant and iSpindel
 * routes. Each route still shapes its own response; these only cover the
 * queries they all repeat.
 */

type SensorDevice = typeof sensorDevicesTable.$inferSelect;

export async function getLatestReading(deviceId: number) {
  const [latestReading] = await db
    .select()
    .from(sensorReadingsTable)
    .where(eq(sensorReadingsTable.deviceId, deviceId))
    .orderBy(desc(sensorReadingsTable.receivedAt))
    .limit(1);
  return latestReading ?? null;
}

/** The device's open brew assignment (unassignedAt is null), if any. */
export async function getActiveAssignment(deviceId: number) {
  const [activeAssignment] = await db
    .select()
    .from(sensorDeviceBrewAssignmentsTable)
    .where(
      and(
        eq(sensorDeviceBrewAssignmentsTable.deviceId, deviceId),
        isNull(sensorDeviceBrewAssignmentsTable.unassignedAt),
      ),
    )
    .limit(1);
  return activeAssignment ?? null;
}

export async function closeActiveAssignment(deviceId: number): Promise<void> {
  await db
    .update(sensorDeviceBrewAssignmentsTable)
    .set({ unassignedAt: new Date() })
    .where(
      and(
        eq(sensorDeviceBrewAssignmentsTable.deviceId, deviceId),
        isNull(sensorDeviceBrewAssignmentsTable.unassignedAt),
      ),
    );
}

/**
 * Put `toId` on the brew `fromId` is on, taking `fromId` off it. Does nothing
 * when `fromId` isn't on a brew or `toId` already is.
 */
export async function moveActiveAssignment(fromId: number, toId: number): Promise<void> {
  const from = await getActiveAssignment(fromId);
  if (!from || (await getActiveAssignment(toId))) return;
  await closeActiveAssignment(fromId);
  await db.insert(sensorDeviceBrewAssignmentsTable).values({ deviceId: toId, brewSessionId: from.brewSessionId, role: from.role });
}

/**
 * Change a sensor's role on the brew it's assigned to. Every assignment of the
 * device to that brew takes the role, so an earlier window can't keep feeding
 * fermentation data. Moving to "reference" also takes the sensor's mirrored
 * rows out of the brew's fermentation readings; its own sensor_readings stay,
 * so its reference chart still has the full history. Returns false when the
 * device isn't on a brew.
 */
export async function setAssignmentRole(deviceId: number, role: SensorAssignmentRole): Promise<boolean> {
  const active = await getActiveAssignment(deviceId);
  if (!active) return false;
  const brewSessionId = active.brewSessionId;

  await db
    .update(sensorDeviceBrewAssignmentsTable)
    .set({ role })
    .where(and(eq(sensorDeviceBrewAssignmentsTable.deviceId, deviceId), eq(sensorDeviceBrewAssignmentsTable.brewSessionId, brewSessionId)));

  if (role === "reference") {
    const [device] = await db.select().from(sensorDevicesTable).where(eq(sensorDevicesTable.id, deviceId));
    const source = device?.deviceType === "shelly_probe" ? "shelly" : "ispindel";
    // Rows mirrored before sensor_device_id existed are matched by the device
    // name and source the mirror wrote.
    const legacy = device
      ? and(
          isNull(fermentationReadingsTable.sensorDeviceId),
          eq(fermentationReadingsTable.source, source),
          eq(fermentationReadingsTable.notes, device.deviceName),
        )
      : undefined;
    await db
      .delete(fermentationReadingsTable)
      .where(
        and(
          eq(fermentationReadingsTable.brewSessionId, brewSessionId),
          legacy ? or(eq(fermentationReadingsTable.sensorDeviceId, deviceId), legacy) : eq(fermentationReadingsTable.sensorDeviceId, deviceId),
        ),
      );
  }
  return true;
}

export async function getBrewName(brewSessionId: number): Promise<string | null> {
  const [session] = await db
    .select({ recipeName: brewSessionsTable.recipeName })
    .from(brewSessionsTable)
    .where(eq(brewSessionsTable.id, brewSessionId));
  return session?.recipeName ?? null;
}

/**
 * A device with its latest reading, assignment, connection status and alerts —
 * the SensorDeviceWithStatus shape. withBrewName: false skips the brew name
 * lookup and reports it as null.
 */
export async function buildDeviceSnapshot(device: SensorDevice, { withBrewName = true } = {}) {
  const latestReading = await getLatestReading(device.id);
  const activeAssignment = await getActiveAssignment(device.id);
  const assignedBrewName = withBrewName && activeAssignment ? await getBrewName(activeAssignment.brewSessionId) : null;

  // Connection status based on reportedInterval (seconds) or a 30-minute default
  const connectionStatus = calcConnectionStatus(device.lastSeenAt, latestReading?.reportedInterval ?? null);
  const alerts = buildAlerts(device, latestReading, connectionStatus);

  return {
    device,
    latestReading,
    assignedBrewSessionId: activeAssignment?.brewSessionId ?? null,
    assignedBrewName,
    assignedRole: activeAssignment?.role ?? null,
    connectionStatus,
    alerts,
  };
}
