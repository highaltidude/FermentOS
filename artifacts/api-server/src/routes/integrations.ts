import { Router } from "express";
import { db, sensorDevicesTable, sensorReadingsTable, sensorDeviceBrewAssignmentsTable, appConfigTable, fermentationReadingsTable, brewSessionsTable } from "@workspace/db";
import { eq, desc, isNull, and, count, gte, lte } from "drizzle-orm";
import { calcConnectionStatus, buildAlerts } from "./sensors";
import { estimateBatteryPercent } from "../lib/batteryUtil";

const router = Router();

const CONFIG_ISPINDEL_ENABLED = "ispindel_enabled";
const CONFIG_ISPINDEL_TOKEN = "ispindel_token";

// ── Config helpers ─────────────────────────────────────────────────────────

async function getConfig(key: string): Promise<string | null> {
  const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, key));
  return row?.value ?? null;
}

async function setConfig(key: string, value: string): Promise<void> {
  await db
    .insert(appConfigTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfigTable.key, set: { value, updatedAt: new Date() } });
}

// ── Core ingest logic (reused by both POST /integrations/ispindel and simulate) ──

async function ingestReading(opts: {
  deviceName: string;
  deviceKey: string;
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
        deviceType: "ispindel",
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
    const [activeAssignment] = await db
      .select()
      .from(sensorDeviceBrewAssignmentsTable)
      .where(
        and(
          eq(sensorDeviceBrewAssignmentsTable.deviceId, device!.id),
          isNull(sensorDeviceBrewAssignmentsTable.unassignedAt),
        ),
      )
      .limit(1);
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
      source: "ispindel",
    });
  }

  return reading!.id;
}

// ── POST /integrations/ispindel ────────────────────────────────────────────
// Whitelisted from apiAuth so real devices can POST without a Bearer token.
router.post("/ispindel", async (req, res) => {
  // Check if integration is enabled
  const enabled = await getConfig(CONFIG_ISPINDEL_ENABLED);
  if (enabled === "false") {
    return res.status(403).json({ error: "iSpindel integration is disabled" });
  }

  // Optional token validation
  const storedToken = await getConfig(CONFIG_ISPINDEL_TOKEN);
  if (storedToken) {
    const payloadToken = req.body?.token ?? req.body?.Token;
    if (payloadToken !== storedToken) {
      req.log.warn({ deviceName: req.body?.name }, "iSpindel token mismatch");
      return res.status(403).json({ error: "Invalid token" });
    }
  }

  const payload = req.body as Record<string, unknown>;
  const deviceName = String(payload.name ?? payload.Name ?? "Unknown iSpindel");
  const deviceKey = deviceName; // iSpindel name is the unique key

  try {
    await ingestReading({
      deviceName,
      deviceKey,
      gravity: typeof payload.gravity === "number" ? payload.gravity : null,
      temperature: typeof payload.temperature === "number" ? payload.temperature : null,
      temperatureUnit: typeof payload.temp_units === "string" ? payload.temp_units : "C",
      angle: typeof payload.angle === "number" ? payload.angle : null,
      battery: typeof payload.battery === "number" ? payload.battery : null,
      rssi: typeof payload.RSSI === "number" ? payload.RSSI : null,
      interval: typeof payload.interval === "number" ? payload.interval : null,
      rawPayload: payload,
    });

    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err, deviceName }, "iSpindel ingest failed");
    return res.status(500).json({ error: "Failed to store reading" });
  }
});

// ── GET /integrations/ispindel/settings ───────────────────────────────────
router.get("/ispindel/settings", async (_req, res) => {
  const [enabled, token] = await Promise.all([
    getConfig(CONFIG_ISPINDEL_ENABLED),
    getConfig(CONFIG_ISPINDEL_TOKEN),
  ]);
  return res.json({
    enabled: enabled !== "false",
    token: token ?? null,
  });
});

// ── PUT /integrations/ispindel/settings ───────────────────────────────────
router.put("/ispindel/settings", async (req, res) => {
  const { enabled, token } = req.body as { enabled?: boolean; token?: string | null };
  if (enabled !== undefined) {
    await setConfig(CONFIG_ISPINDEL_ENABLED, enabled ? "true" : "false");
  }
  if (token !== undefined) {
    if (token === null || token === "") {
      await db.delete(appConfigTable).where(eq(appConfigTable.key, CONFIG_ISPINDEL_TOKEN));
    } else {
      await setConfig(CONFIG_ISPINDEL_TOKEN, token);
    }
  }
  const [newEnabled, newToken] = await Promise.all([
    getConfig(CONFIG_ISPINDEL_ENABLED),
    getConfig(CONFIG_ISPINDEL_TOKEN),
  ]);
  return res.json({ enabled: newEnabled !== "false", token: newToken ?? null });
});

// ── POST /integrations/ispindel/simulate ──────────────────────────────────
router.post("/ispindel/simulate", async (req, res) => {
  const body = req.body as {
    deviceId?: number | null;
    brewSessionId?: number | null;
    deviceName?: string;
    gravity?: number;
    temperature?: number;
    temperatureUnit?: string;
    battery?: number;
    angle?: number;
    rssi?: number;
  };

  // If a deviceId is given, fetch the device name/key from DB
  let deviceName = body.deviceName ?? "Simulator";
  let deviceKey = deviceName;

  if (body.deviceId) {
    const [dev] = await db.select().from(sensorDevicesTable).where(eq(sensorDevicesTable.id, body.deviceId));
    if (dev) {
      deviceName = dev.deviceName;
      deviceKey = dev.deviceKey;
    }
  }

  try {
    const readingId = await ingestReading({
      deviceName,
      deviceKey,
      gravity: body.gravity ?? null,
      temperature: body.temperature ?? null,
      temperatureUnit: body.temperatureUnit ?? "C",
      angle: body.angle ?? null,
      battery: body.battery ?? null,
      rssi: body.rssi ?? null,
      interval: 900,
      rawPayload: { simulated: true, ...body },
      brewSessionId: body.brewSessionId ?? null,
    });

    return res.json({ ok: true, readingId });
  } catch (err) {
    req.log.error({ err }, "iSpindel simulate failed");
    return res.status(500).json({ error: "Failed to store simulated reading" });
  }
});

// ── GET /integrations/ispindel/status (HA-friendly) ───────────────────────
// Whitelisted from apiAuth — same as /api/ha/status.
router.get("/ispindel/status", async (_req, res) => {
  const devices = await db.select().from(sensorDevicesTable).where(eq(sensorDevicesTable.enabled, true));

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

      const connectionStatus = calcConnectionStatus(device.lastSeenAt, latestReading?.reportedInterval ?? null);
      const alerts = buildAlerts(device, latestReading ?? null, connectionStatus);

      return {
        device,
        latestReading: latestReading ?? null,
        assignedBrewSessionId: activeAssignment?.brewSessionId ?? null,
        assignedBrewName: null,
        connectionStatus,
        alerts,
      };
    }),
  );

  return res.json({ devices: results });
});

// ── GET /ispindel/devices/:deviceId/readings ───────────────────────────────
router.get("/ispindel/devices/:deviceId/readings", async (req, res) => {
  const deviceId = Number(req.params.deviceId);
  if (!deviceId) return res.status(400).json({ error: "Invalid deviceId" });

  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);
  const sort = req.query.sort === "asc" ? "asc" : "desc";
  const startRaw = req.query.start ? new Date(String(req.query.start)) : null;
  const endRaw = req.query.end ? new Date(String(req.query.end)) : null;
  const brewId = req.query.brewId ? Number(req.query.brewId) : null;

  const conditions: ReturnType<typeof eq>[] = [eq(sensorReadingsTable.deviceId, deviceId)];
  if (startRaw && !isNaN(startRaw.getTime())) conditions.push(gte(sensorReadingsTable.receivedAt, startRaw));
  if (endRaw && !isNaN(endRaw.getTime())) conditions.push(lte(sensorReadingsTable.receivedAt, endRaw));
  if (brewId) conditions.push(eq(sensorReadingsTable.brewSessionId, brewId));
  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(sensorReadingsTable)
    .where(where);

  const readings = await db
    .select()
    .from(sensorReadingsTable)
    .where(where)
    .orderBy(sort === "asc" ? sensorReadingsTable.receivedAt : desc(sensorReadingsTable.receivedAt))
    .limit(limit)
    .offset(offset);

  return res.json({ readings, total: Number(total), limit, offset });
});

export default router;
