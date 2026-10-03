import { Router } from "express";
import { db, sensorDevicesTable, sensorReadingsTable, sensorDeviceBrewAssignmentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { computeBrewAlerts } from "../services/brewAlerts";
import { buildDeviceSnapshot, closeActiveAssignment } from "../services/sensorDevices";

const router = Router();

// ── Helper: build SensorDeviceWithStatus ───────────────────────────────────

async function buildDeviceStatus(deviceId: number) {
  const [device] = await db
    .select()
    .from(sensorDevicesTable)
    .where(eq(sensorDevicesTable.id, deviceId));

  if (!device) return null;
  return buildDeviceSnapshot(device);
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
  await closeActiveAssignment(id);

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

  await closeActiveAssignment(id);

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

  const t = await computeBrewAlerts(brewId);
  if (!t.hasAssignments) {
    return res.json({ brewSessionId: t.brewSessionId, device: null, latestReading: null, readings: [], insights: null, alerts: [] });
  }
  return res.json({
    brewSessionId: t.brewSessionId,
    device: t.device,
    latestReading: t.latestReading,
    readings: t.readings,
    insights: t.insights,
    alerts: t.alerts,
    tempRange: t.tempRange,
    isDeviceActive: t.isDeviceActive,
  });
});

export default router;
