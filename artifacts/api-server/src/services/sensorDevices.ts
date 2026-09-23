import { db, sensorDevicesTable, sensorReadingsTable, sensorDeviceBrewAssignmentsTable, brewSessionsTable } from "@workspace/db";
import { eq, desc, isNull, and } from "drizzle-orm";
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
    connectionStatus,
    alerts,
  };
}
