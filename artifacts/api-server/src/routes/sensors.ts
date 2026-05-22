import { Router } from "express";
import { db, sensorDevicesTable, sensorReadingsTable, sensorDeviceBrewAssignmentsTable, brewSessionsTable, fermentationReadingsTable } from "@workspace/db";
import { eq, desc, isNull, and, gte } from "drizzle-orm";

const router = Router();

// ── Helper: build SensorDeviceWithStatus ───────────────────────────────────

async function buildDeviceStatus(deviceId: number) {
  const [device] = await db
    .select()
    .from(sensorDevicesTable)
    .where(eq(sensorDevicesTable.id, deviceId));

  if (!device) return null;

  const [latestReading] = await db
    .select()
    .from(sensorReadingsTable)
    .where(eq(sensorReadingsTable.deviceId, deviceId))
    .orderBy(desc(sensorReadingsTable.receivedAt))
    .limit(1);

  // Find the active (unassigned) brew assignment
  const [activeAssignment] = await db
    .select({ id: sensorDeviceBrewAssignmentsTable.id, brewSessionId: sensorDeviceBrewAssignmentsTable.brewSessionId })
    .from(sensorDeviceBrewAssignmentsTable)
    .where(
      and(
        eq(sensorDeviceBrewAssignmentsTable.deviceId, deviceId),
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

  // Connection status based on reportedInterval (seconds) or a 30-minute default
  const connectionStatus = calcConnectionStatus(device.lastSeenAt, latestReading?.reportedInterval ?? null);

  // Alerts
  const alerts = buildAlerts(device, latestReading ?? null, connectionStatus);

  return {
    device,
    latestReading: latestReading ?? null,
    assignedBrewSessionId: activeAssignment?.brewSessionId ?? null,
    assignedBrewName,
    connectionStatus,
    alerts,
  };
}

function calcConnectionStatus(
  lastSeenAt: Date | null,
  reportedIntervalSeconds: number | null,
): "connected" | "warning" | "offline" | "unknown" {
  if (!lastSeenAt) return "unknown";
  const intervalMs = (reportedIntervalSeconds ?? 1800) * 1000;
  const elapsed = Date.now() - new Date(lastSeenAt).getTime();
  if (elapsed < intervalMs * 2) return "connected";
  if (elapsed < intervalMs * 4) return "warning";
  return "offline";
}

function buildAlerts(
  device: { lastSeenAt: Date | null },
  reading: { battery?: number | null; gravity?: number | null; receivedAt: Date; reportedInterval?: number | null } | null,
  connectionStatus: string,
): { type: string; message: string; triggeredAt: string }[] {
  const alerts: { type: string; message: string; triggeredAt: string }[] = [];
  const now = new Date();

  if (connectionStatus === "offline") {
    alerts.push({ type: "device_offline", message: "Device has not reported recently", triggeredAt: now.toISOString() });
  }

  if (reading?.battery != null && reading.battery < 20) {
    alerts.push({ type: "battery_low", message: `Battery at ${reading.battery.toFixed(0)}%`, triggeredAt: now.toISOString() });
  }

  return alerts;
}

// ── GET /sensors/devices ───────────────────────────────────────────────────
router.get("/sensors/devices", async (req, res) => {
  const devices = await db.select().from(sensorDevicesTable).orderBy(sensorDevicesTable.deviceName);
  const results = await Promise.all(devices.map((d) => buildDeviceStatus(d.id)));
  return res.json(results.filter(Boolean));
});

// ── POST /sensors/devices ──────────────────────────────────────────────────
router.post("/sensors/devices", async (req, res) => {
  const { deviceName, deviceKey, deviceType = "ispindel", notes } = req.body as Record<string, string>;
  if (!deviceName || !deviceKey) {
    return res.status(400).json({ error: "deviceName and deviceKey are required" });
  }
  const [device] = await db
    .insert(sensorDevicesTable)
    .values({ deviceName, deviceKey, deviceType, notes: notes ?? null })
    .returning();
  return res.status(201).json(device);
});

// ── GET /sensors/devices/:id ───────────────────────────────────────────────
router.get("/sensors/devices/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  const status = await buildDeviceStatus(id);
  if (!status) return res.status(404).json({ error: "Not found" });
  return res.json(status);
});

// ── PUT /sensors/devices/:id ───────────────────────────────────────────────
router.put("/sensors/devices/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  const { deviceName, deviceKey, enabled, notes } = req.body as Record<string, unknown>;
  const [updated] = await db
    .update(sensorDevicesTable)
    .set({
      ...(deviceName !== undefined && { deviceName: String(deviceName) }),
      ...(deviceKey !== undefined && { deviceKey: String(deviceKey) }),
      ...(enabled !== undefined && { enabled: Boolean(enabled) }),
      ...(notes !== undefined && { notes: notes === null ? null : String(notes) }),
      updatedAt: new Date(),
    })
    .where(eq(sensorDevicesTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// ── DELETE /sensors/devices/:id ────────────────────────────────────────────
router.delete("/sensors/devices/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  await db.delete(sensorDevicesTable).where(eq(sensorDevicesTable.id, id));
  return res.status(204).end();
});

// ── POST /sensors/devices/:id/assign ──────────────────────────────────────
router.post("/sensors/devices/:id/assign", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  const brewSessionId = Number(req.body.brewSessionId);
  if (!brewSessionId) return res.status(400).json({ error: "brewSessionId required" });

  // Close any existing active assignment for this device
  await db
    .update(sensorDeviceBrewAssignmentsTable)
    .set({ unassignedAt: new Date() })
    .where(
      and(
        eq(sensorDeviceBrewAssignmentsTable.deviceId, id),
        isNull(sensorDeviceBrewAssignmentsTable.unassignedAt),
      ),
    );

  // Create new assignment
  await db.insert(sensorDeviceBrewAssignmentsTable).values({ deviceId: id, brewSessionId });

  const status = await buildDeviceStatus(id);
  if (!status) return res.status(404).json({ error: "Not found" });
  return res.json(status);
});

// ── DELETE /sensors/devices/:id/assign ────────────────────────────────────
router.delete("/sensors/devices/:id/assign", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  await db
    .update(sensorDeviceBrewAssignmentsTable)
    .set({ unassignedAt: new Date() })
    .where(
      and(
        eq(sensorDeviceBrewAssignmentsTable.deviceId, id),
        isNull(sensorDeviceBrewAssignmentsTable.unassignedAt),
      ),
    );

  const status = await buildDeviceStatus(id);
  if (!status) return res.status(404).json({ error: "Not found" });
  return res.json(status);
});

// ── GET /sensors/devices/:id/readings ─────────────────────────────────────
router.get("/sensors/devices/:id/readings", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const readings = await db
    .select()
    .from(sensorReadingsTable)
    .where(eq(sensorReadingsTable.deviceId, id))
    .orderBy(desc(sensorReadingsTable.receivedAt))
    .limit(limit);
  return res.json(readings.reverse());
});

// ── GET /brew-sessions/:id/sensor-telemetry ───────────────────────────────
router.get("/brew-sessions/:id/sensor-telemetry", async (req, res) => {
  const brewId = Number(req.params.id);
  if (!brewId) return res.status(400).json({ error: "Invalid id" });

  // Find the device currently (or most recently) assigned to this brew
  const [assignment] = await db
    .select()
    .from(sensorDeviceBrewAssignmentsTable)
    .where(eq(sensorDeviceBrewAssignmentsTable.brewSessionId, brewId))
    .orderBy(desc(sensorDeviceBrewAssignmentsTable.assignedAt))
    .limit(1);

  if (!assignment) {
    return res.json({ brewSessionId: brewId, device: null, latestReading: null, readings: [], insights: null, alerts: [] });
  }

  const [device] = await db.select().from(sensorDevicesTable).where(eq(sensorDevicesTable.id, assignment.deviceId));

  const readings = await db
    .select()
    .from(sensorReadingsTable)
    .where(eq(sensorReadingsTable.brewSessionId, brewId))
    .orderBy(sensorReadingsTable.receivedAt);

  const latestReading = readings[readings.length - 1] ?? null;
  const insights = calcInsights(readings);

  const connectionStatus = calcConnectionStatus(device?.lastSeenAt ?? null, latestReading?.reportedInterval ?? null);
  const alerts = buildAlerts(device ?? { lastSeenAt: null }, latestReading, connectionStatus);

  // Gravity stall alert — gravity unchanged for 24h
  if (readings.length >= 2) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentReadings = readings.filter((r) => r.gravity != null && new Date(r.receivedAt) >= cutoff);
    if (recentReadings.length >= 2) {
      const gravityValues = recentReadings.map((r) => r.gravity!);
      const range = Math.max(...gravityValues) - Math.min(...gravityValues);
      if (range < 0.001) {
        alerts.push({ type: "gravity_stalled", message: "Gravity unchanged for 24+ hours", triggeredAt: new Date().toISOString() });
      }
    }
  }

  return res.json({ brewSessionId: brewId, device: device ?? null, latestReading, readings, insights, alerts });
});

// ── Fermentation insights calculation ─────────────────────────────────────
function calcInsights(
  readings: { gravity?: number | null; receivedAt: Date }[],
): {
  startingGravity: number | null;
  currentGravity: number | null;
  gravityDrop: number | null;
  attenuationPercent: number | null;
  fermentationStatus: string;
  velocityLast24h: number | null;
} | null {
  const gravityReadings = readings.filter((r) => r.gravity != null);
  if (gravityReadings.length < 2) {
    return {
      startingGravity: gravityReadings[0]?.gravity ?? null,
      currentGravity: gravityReadings[0]?.gravity ?? null,
      gravityDrop: null,
      attenuationPercent: null,
      fermentationStatus: "insufficient_data",
      velocityLast24h: null,
    };
  }

  const first = gravityReadings[0]!;
  const last = gravityReadings[gravityReadings.length - 1]!;
  const startingGravity = first.gravity!;
  const currentGravity = last.gravity!;
  const gravityDrop = startingGravity - currentGravity;
  const attenuationPercent = startingGravity > 1 ? (gravityDrop / (startingGravity - 1)) * 100 : null;

  // Velocity over last 24 hours (SG points / day)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = gravityReadings.filter((r) => new Date(r.receivedAt) >= cutoff);
  let velocityLast24h: number | null = null;
  if (recent.length >= 2) {
    const oldest = recent[0]!;
    const newest = recent[recent.length - 1]!;
    const hours = (new Date(newest.receivedAt).getTime() - new Date(oldest.receivedAt).getTime()) / 3_600_000;
    if (hours > 0) {
      velocityLast24h = ((oldest.gravity! - newest.gravity!) / hours) * 24;
    }
  }

  let fermentationStatus: string;
  if (velocityLast24h == null) {
    fermentationStatus = "insufficient_data";
  } else if (velocityLast24h > 0.003) {
    fermentationStatus = "likely_active";
  } else if (velocityLast24h > 0.001) {
    fermentationStatus = "slowing";
  } else {
    const hoursSinceStart =
      (new Date(last.receivedAt).getTime() - new Date(first.receivedAt).getTime()) / 3_600_000;
    fermentationStatus = hoursSinceStart > 48 ? "possibly_complete" : "stable";
  }

  return { startingGravity, currentGravity, gravityDrop, attenuationPercent, fermentationStatus, velocityLast24h };
}

export { calcConnectionStatus, buildAlerts };
export default router;
