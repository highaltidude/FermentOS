import { Router } from "express";
import { db, sensorDevicesTable, sensorReadingsTable } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { calcConnectionStatus, buildAlerts } from "../services/brewAlerts";
import { getLatestReading, getActiveAssignment, getBrewName } from "../services/sensorDevices";
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
      const latestReading = await getLatestReading(device.id);
      const activeAssignment = await getActiveAssignment(device.id);
      const assignedBrewName = activeAssignment ? await getBrewName(activeAssignment.brewSessionId) : null;

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
      const alerts = buildAlerts(device, latestReading, connectionStatus);

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
