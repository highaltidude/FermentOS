import { Router } from "express";
import { db, sensorDevicesTable, sensorReadingsTable, ACTIVE_BREW_STATUSES } from "@workspace/db";
import { eq, and, gte } from "drizzle-orm";
import { calcConnectionStatus, buildAlerts, computeBrewAlerts } from "../services/brewAlerts";
import { alertsForBrew } from "../lib/alertPolicy";
import { getLatestReading, getActiveAssignment, getBrewName } from "../services/sensorDevices";
import { calcInsights } from "../lib/fermentationInsights";
import { sharedResult } from "../lib/sharedResult";

const router = Router();

/**
 * Home Assistant polls this on a timer, often from several REST sensors at
 * once, so requests arriving within a few seconds of each other share one
 * build of the response rather than each re-reading every brew's history.
 */
const STATUS_TTL_MS = 10_000;

async function buildStatus() {
  // Several fermenter sensors on one brew share its alert computation.
  const brewAlerts = new Map<number, ReturnType<typeof computeBrewAlerts>>();
  const alertsFor = (brewId: number) => {
    let p = brewAlerts.get(brewId);
    if (!p) {
      p = computeBrewAlerts(brewId);
      brewAlerts.set(brewId, p);
    }
    return p;
  };

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
      // An assigned device reports its brew's alerts too, from the same
      // computation the brew page and the notifications use: the temperature
      // range for the brew's current stage and the 24-hour stall check.
      // Unassigned, there is no range to check, so only offline and battery.
      // A reference sensor (ice bath, room) isn't the brew's temperature, so
      // it gets the same device-only alerts.
      let alerts;
      if (activeAssignment && activeAssignment.role === "fermenter") {
        const telemetry = await alertsFor(activeAssignment.brewSessionId);
        const status = telemetry.status ?? null;
        alerts = alertsForBrew(telemetry.alerts, {
          status,
          active: status != null && (ACTIVE_BREW_STATUSES as readonly string[]).includes(status),
        });
      } else {
        alerts = buildAlerts(device, latestReading, connectionStatus);
      }

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

  return results;
}

const getStatus = sharedResult(STATUS_TTL_MS, buildStatus);

router.get("/status", async (_req, res) => {
  return res.json(await getStatus());
});

export default router;
