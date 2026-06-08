import { Router } from "express";
import { db, sensorDevicesTable, sensorReadingsTable, sensorDeviceBrewAssignmentsTable, brewSessionsTable, fermentationReadingsTable, recipesTable, appConfigTable } from "@workspace/db";
import { eq, desc, isNull, and, gte, lte } from "drizzle-orm";
import { calcInsights } from "../lib/fermentationInsights";

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
  reading: { battery?: number | null; batteryPercentEstimate?: number | null; gravity?: number | null; receivedAt: Date; reportedInterval?: number | null; temperature?: number | null; temperatureUnit?: string | null } | null,
  connectionStatus: string,
  tempRange?: { min: number | null; max: number | null; unit: "F" | "C" } | null,
): { type: string; message: string; triggeredAt: string }[] {
  const alerts: { type: string; message: string; triggeredAt: string }[] = [];
  const now = new Date();

  if (connectionStatus === "offline") {
    alerts.push({ type: "device_offline", message: "Device has not reported recently", triggeredAt: now.toISOString() });
  }

  const pct = reading?.batteryPercentEstimate ?? null;
  if (pct != null && pct < 20) {
    const level = pct < 10 ? "critical" : "warning";
    alerts.push({
      type: "battery_low",
      message: `Battery ${level}: ${reading!.battery != null ? `${Number(reading!.battery).toFixed(2)}V ` : ""}(~${Math.round(pct)}%)`,
      triggeredAt: now.toISOString(),
    });
  }

  if (tempRange && reading?.temperature != null) {
    let tempForCompare = reading.temperature;
    const readingUnit = (reading.temperatureUnit ?? "C").toUpperCase();
    const rangeUnit = tempRange.unit;
    if (readingUnit === "C" && rangeUnit === "F") {
      tempForCompare = reading.temperature * 9 / 5 + 32;
    } else if (readingUnit === "F" && rangeUnit === "C") {
      tempForCompare = (reading.temperature - 32) * 5 / 9;
    }
    const { min, max } = tempRange;
    const unit = rangeUnit === "F" ? "°F" : "°C";
    if (min != null && tempForCompare < min) {
      alerts.push({ type: "temp_out_of_range", message: `Temperature ${tempForCompare.toFixed(1)}${unit} is below minimum ${min}${unit}`, triggeredAt: now.toISOString() });
    } else if (max != null && tempForCompare > max) {
      alerts.push({ type: "temp_out_of_range", message: `Temperature ${tempForCompare.toFixed(1)}${unit} is above maximum ${max}${unit}`, triggeredAt: now.toISOString() });
    }
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

  // Fetch ALL assignment windows for this brew, oldest first.
  // A brew may have multiple windows if a device was un-assigned and re-assigned,
  // or if different devices were used at different stages.
  const assignments = await db
    .select()
    .from(sensorDeviceBrewAssignmentsTable)
    .where(eq(sensorDeviceBrewAssignmentsTable.brewSessionId, brewId))
    .orderBy(sensorDeviceBrewAssignmentsTable.assignedAt);

  if (assignments.length === 0) {
    return res.json({ brewSessionId: brewId, device: null, latestReading: null, readings: [], insights: null, alerts: [] });
  }

  // For device display / connection status use the most recent assignment's device.
  const latestAssignment = assignments[assignments.length - 1]!;
  const [device] = await db
    .select()
    .from(sensorDevicesTable)
    .where(eq(sensorDevicesTable.id, latestAssignment.deviceId));

  // Collect readings for every assignment window.
  // Filter by (deviceId, receivedAt >= assignedAt [, receivedAt <= unassignedAt]).
  // This means pre-assignment "test" readings are never included, and readings
  // from a prior brew's window are correctly excluded from the current brew.
  type Reading = typeof sensorReadingsTable.$inferSelect;
  const windowResults = await Promise.all(
    assignments.map((a) => {
      const conditions: ReturnType<typeof eq>[] = [
        eq(sensorReadingsTable.deviceId, a.deviceId),
        gte(sensorReadingsTable.receivedAt, a.assignedAt),
      ];
      if (a.unassignedAt != null) {
        conditions.push(lte(sensorReadingsTable.receivedAt, a.unassignedAt));
      }
      return db
        .select()
        .from(sensorReadingsTable)
        .where(and(...conditions))
        .orderBy(sensorReadingsTable.receivedAt);
    }),
  );

  // Merge and sort all windows by time (handles the rare multi-device case).
  const readings: Reading[] = windowResults
    .flat()
    .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());

  const latestReading = readings[readings.length - 1] ?? null;
  const insights = calcInsights(readings);

  const connectionStatus = calcConnectionStatus(device?.lastSeenAt ?? null, latestReading?.reportedInterval ?? null);

  // Fetch temp range from session, falling back to linked recipe
  const [brewSession] = await db
    .select({
      fermentTempMin: brewSessionsTable.fermentTempMin,
      fermentTempMax: brewSessionsTable.fermentTempMax,
      recipeId: brewSessionsTable.recipeId,
    })
    .from(brewSessionsTable)
    .where(eq(brewSessionsTable.id, brewId));

  let tempMin: number | null = brewSession?.fermentTempMin ?? null;
  let tempMax: number | null = brewSession?.fermentTempMax ?? null;

  if ((tempMin == null || tempMax == null) && brewSession?.recipeId) {
    const [recipe] = await db
      .select({ fermentTempMin: recipesTable.fermentTempMin, fermentTempMax: recipesTable.fermentTempMax })
      .from(recipesTable)
      .where(eq(recipesTable.id, brewSession.recipeId));
    if (recipe) {
      tempMin = tempMin ?? recipe.fermentTempMin ?? null;
      tempMax = tempMax ?? recipe.fermentTempMax ?? null;
    }
  }

  const [tempUnitRow] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, "ferment_temp_unit"));
  const tempUnit = (tempUnitRow?.value === "C" ? "C" : "F") as "F" | "C";

  const tempRange = (tempMin != null || tempMax != null) ? { min: tempMin, max: tempMax, unit: tempUnit } : null;

  const alerts = buildAlerts(device ?? { lastSeenAt: null }, latestReading, connectionStatus, tempRange);

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

export { calcConnectionStatus, buildAlerts };
export default router;
