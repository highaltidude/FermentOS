import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, beerStylesTable } from "@workspace/db";
import {
  CreateBeerStyleBody,
  SetNotificationSettingsBody,
  SetUnitSystemBody,
  SetFermentTempUnitBody,
  SetBreweryNameBody,
} from "@workspace/api-zod";
import { parseIdParam } from "../lib/http";
import {
  isInventoryEnforcementEnabled,
  setInventoryEnforcementEnabled,
} from "../services/inventoryEnforcement";
import { getUnitSystem, setUnitSystem } from "../services/unitSystem";
import { getRetentionDays, setRetentionDays } from "../services/readingRetention.js";
import { getConfigValue, setConfigValue } from "../services/appConfig";
import { getBreweryName, setBreweryName } from "../services/breweryName";
import {
  getTempAlertReadings,
  setTempAlertReadings,
  MIN_TEMP_ALERT_READINGS,
  MAX_TEMP_ALERT_READINGS,
} from "../services/tempAlertReadings";
import {
  getNotifyConfig,
  setNotifyConfig,
  sendNotification,
  ALERT_TYPES,
  type AlertType,
  type NotifyChannel,
} from "../services/notifications.js";

const router = Router();

router.get("/settings/inventory-enforcement", async (_req, res) => {
  const enabled = await isInventoryEnforcementEnabled();
  return res.json({ enabled });
});

router.put("/settings/inventory-enforcement", async (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "Body must be { enabled: boolean }" });
  }
  await setInventoryEnforcementEnabled(enabled);
  return res.json({ enabled });
});

router.get("/settings/unit-system", async (_req, res) => {
  const system = await getUnitSystem();
  return res.json({ system });
});

router.put("/settings/unit-system", async (req, res) => {
  const { system } = req.body as { system: unknown };
  const parsed = SetUnitSystemBody.shape.system.safeParse(system);
  if (!parsed.success) {
    return res.status(400).json({ error: "system must be 'imperial', 'metric', or 'both'" });
  }
  await setUnitSystem(parsed.data);
  return res.json({ system: parsed.data });
});

router.get("/settings/styles", async (_req, res) => {
  const styles = await db
    .select()
    .from(beerStylesTable)
    .orderBy(asc(beerStylesTable.sortOrder), asc(beerStylesTable.name));
  return res.json(styles);
});

router.post("/settings/styles", async (req, res) => {
  const body = CreateBeerStyleBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [style] = await db
    .insert(beerStylesTable)
    .values(body.data)
    .returning();
  return res.status(201).json(style);
});

router.delete("/settings/styles/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  await db.delete(beerStylesTable).where(eq(beerStylesTable.id, id));
  return res.status(204).send();
});

const VALID_RETENTION_DAYS = new Set([0, 90, 180, 365, 730]);

router.get("/settings/reading-retention", async (_req, res) => {
  const days = await getRetentionDays();
  return res.json({ days });
});

router.put("/settings/reading-retention", async (req, res) => {
  const { days } = req.body as { days: unknown };
  if (days !== null && (typeof days !== "number" || !VALID_RETENTION_DAYS.has(days))) {
    return res.status(400).json({ error: "days must be null, 0, 90, 180, 365, or 730" });
  }
  await setRetentionDays(days as number | null);
  const saved = await getRetentionDays();
  return res.json({ days: saved });
});

router.get("/settings/brewery-name", async (_req, res) => {
  return res.json({ name: await getBreweryName() });
});

router.put("/settings/brewery-name", async (req, res) => {
  const { name } = req.body as { name: unknown };
  const parsed = SetBreweryNameBody.shape.name.safeParse(name);
  if (!parsed.success) {
    return res.status(400).json({ error: "name must be a string or null" });
  }
  const trimmed = typeof parsed.data === "string" ? parsed.data.trim() : null;
  await setBreweryName(trimmed || null);
  return res.json({ name: trimmed || null });
});

const VALID_DEFAULT_READINGS = new Set([5, 10, 25, 50, 100]);
const DEFAULT_READINGS_KEY = "default_readings_shown";

router.get("/settings/default-readings-shown", async (_req, res) => {
  const value = await getConfigValue(DEFAULT_READINGS_KEY);
  const parsed = value ? parseInt(value, 10) : 5;
  const count = Number.isFinite(parsed) && VALID_DEFAULT_READINGS.has(parsed) ? parsed : 5;
  return res.json({ count });
});

router.put("/settings/default-readings-shown", async (req, res) => {
  const { count } = req.body as { count: unknown };
  if (typeof count !== "number" || !VALID_DEFAULT_READINGS.has(count)) {
    return res.status(400).json({ error: "count must be 5, 10, 25, 50, or 100" });
  }
  await setConfigValue(DEFAULT_READINGS_KEY, String(count));
  return res.json({ count });
});

const FERMENT_TEMP_UNIT_KEY = "ferment_temp_unit";

router.get("/settings/ferment-temp-unit", async (_req, res) => {
  return res.json({ unit: (await getConfigValue(FERMENT_TEMP_UNIT_KEY)) ?? "F" });
});

router.put("/settings/ferment-temp-unit", async (req, res) => {
  const { unit } = req.body as { unit: unknown };
  const parsed = SetFermentTempUnitBody.shape.unit.safeParse(unit);
  if (!parsed.success) {
    return res.status(400).json({ error: "unit must be 'F' or 'C'" });
  }
  await setConfigValue(FERMENT_TEMP_UNIT_KEY, parsed.data);
  return res.json({ unit: parsed.data });
});

router.get("/settings/temp-alert-readings", async (_req, res) => {
  const count = await getTempAlertReadings();
  return res.json({ count });
});

router.put("/settings/temp-alert-readings", async (req, res) => {
  const { count } = req.body as { count: unknown };
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < MIN_TEMP_ALERT_READINGS ||
    count > MAX_TEMP_ALERT_READINGS
  ) {
    return res.status(400).json({ error: "count must be an integer between 2 and 10" });
  }
  await setTempAlertReadings(count);
  return res.json({ count });
});

const AUTO_CONDITIONING_KEY = "auto_advance_to_conditioning";

router.get("/settings/auto-conditioning", async (_req, res) => {
  return res.json({ enabled: (await getConfigValue(AUTO_CONDITIONING_KEY)) === "true" });
});

router.put("/settings/auto-conditioning", async (req, res) => {
  const { enabled } = req.body as { enabled: unknown };
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "Body must be { enabled: boolean }" });
  await setConfigValue(AUTO_CONDITIONING_KEY, String(enabled));
  return res.json({ enabled });
});

// ── Outbound notifications ─────────────────────────────────────────────────

router.get("/settings/notifications", async (_req, res) => {
  return res.json(await getNotifyConfig());
});

router.put("/settings/notifications", async (req, res) => {
  const body = SetNotificationSettingsBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const d = body.data;
  // The generated schema already constrains these, but narrow explicitly so
  // the service receives exactly the union types it declares.
  const types = (d.types ?? []).filter((t): t is AlertType =>
    (ALERT_TYPES as readonly string[]).includes(t));

  await setNotifyConfig({
    channel: d.channel as NotifyChannel,
    ntfyServer: d.ntfyServer,
    ntfyTopic: d.ntfyTopic,
    webhookUrl: d.webhookUrl,
    types,
    repeatHours: d.repeatHours,
    // undefined (field omitted) and null both mean "inherit repeatHours".
    tempRepeatHours: d.tempRepeatHours ?? null,
    // Optional in the body; an older client that omits it leaves it as is.
    boilAlerts: d.boilAlerts ?? (await getNotifyConfig()).boilAlerts,
  });
  return res.json(await getNotifyConfig());
});

// Returns 200 with ok:false rather than an error status — a failed delivery is
// a normal, expected outcome the UI needs to display, not a request error.
router.post("/settings/notifications/test", async (_req, res) => {
  const result = await sendNotification({
    title: "FermentOS test notification",
    body: "If you can read this, alerts are configured correctly.",
    meta: { event: "test" },
  });
  return res.json({ ok: result.ok, error: result.error ?? null });
});

export default router;
