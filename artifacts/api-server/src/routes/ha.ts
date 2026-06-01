import { Router } from "express";
import { db, sensorDevicesTable, sensorReadingsTable, sensorDeviceBrewAssignmentsTable, brewSessionsTable } from "@workspace/db";
import { eq, desc, isNull, and, gte } from "drizzle-orm";
import { calcConnectionStatus, buildAlerts } from "./sensors";
import { calcInsights } from "../lib/fermentationInsights";

const router = Router();

router.get("/status", async (req, res) => {
  const devices = await db
    .select()
    .from(sensorDevicesTable)
    .where(eq(sensorDevicesTable.enabled, true))
    .orderBy(sensorDevicesTable.deviceName);

  const results = await Promise.all(
    devices.map(async (device) => {
      const [latestReading] = await db
        .select()
        .from(sensorReadingsTable)
        .where(eq(sensorReadingsTable.deviceId, device.id))
        .orderBy(desc(sensorReadingsTable.receivedAt))
        .limit(1);

      const [activeAssignment] = await db
        .select()
        .from(sensorDeviceBrewAssignmentsTable)
        .where(
          and(
            eq(sensorDeviceBrewAssignmentsTable.deviceId, device.id),
            isNull(sensorDeviceBrewAssignmentsTable.unassignedAt),
          ),
        )
        .limit(1);

      let assignedBrewName: string | null = null;
      if (activeAssignment) {
        const [session] = await db
          .select({ recipeName: brewSessionsTable.recipeName })
          .from(brewSessionsTable)
          .where(eq(brewSessionsTable.id, activeAssignment.brewSessionId));
        assignedBrewName = session?.recipeName ?? null;
      }

      let insights = null;
      if (activeAssignment) {
        const windowReadings = await db
          .select()
          .from(sensorReadingsTable)
          .where(
            and(
              eq(sensorReadingsTable.deviceId, device.id),
              gte(sensorReadingsTable.receivedAt, activeAssignment.assignedAt),
            ),
          )
          .orderBy(sensorReadingsTable.receivedAt);
        insights = calcInsights(windowReadings);
      }

      const connectionStatus = calcConnectionStatus(device.lastSeenAt, latestReading?.reportedInterval ?? null);
      const alerts = buildAlerts(device, latestReading ?? null, connectionStatus);

      return {
        deviceId: device.id,
        deviceName: device.deviceName,
        deviceKey: device.deviceKey,
        connectionStatus,
        assignedBrewSessionId: activeAssignment?.brewSessionId ?? null,
        assignedBrewName,
        lastSeenAt: device.lastSeenAt ? new Date(device.lastSeenAt).toISOString() : null,
        latestReading: latestReading
          ? {
              gravity: latestReading.gravity ?? null,
              temperature: latestReading.temperature ?? null,
              temperatureUnit: latestReading.temperatureUnit ?? null,
              battery: latestReading.battery ?? null,
              batteryPercentEstimate: latestReading.batteryPercentEstimate ?? null,
              angle: latestReading.angle ?? null,
              rssi: latestReading.rssi ?? null,
              receivedAt: new Date(latestReading.receivedAt).toISOString(),
            }
          : null,
        insights,
        alerts,
      };
    }),
  );

  return res.json(results);
});

export default router;
