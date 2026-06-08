import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, beerStylesTable, appConfigTable } from "@workspace/db";
import { CreateBeerStyleBody, DeleteBeerStyleParams } from "@workspace/api-zod";
import {
  isInventoryEnforcementEnabled,
  setInventoryEnforcementEnabled,
} from "../services/inventoryEnforcement";
import { getUnitSystem, setUnitSystem, isUnitSystem } from "../services/unitSystem";
import { getRetentionDays, setRetentionDays } from "../services/readingRetention.js";

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
  if (!isUnitSystem(system)) {
    return res.status(400).json({ error: "system must be 'imperial', 'metric', or 'both'" });
  }
  await setUnitSystem(system);
  return res.json({ system });
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
  const params = DeleteBeerStyleParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  await db.delete(beerStylesTable).where(eq(beerStylesTable.id, params.data.id));
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

const BREWERY_NAME_KEY = "brewery_name";

router.get("/settings/brewery-name", async (_req, res) => {
  const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, BREWERY_NAME_KEY));
  return res.json({ name: row?.value ?? null });
});

router.put("/settings/brewery-name", async (req, res) => {
  const { name } = req.body as { name: unknown };
  if (name !== null && name !== undefined && typeof name !== "string") {
    return res.status(400).json({ error: "name must be a string or null" });
  }
  const trimmed = typeof name === "string" ? name.trim() : null;
  if (trimmed) {
    await db
      .insert(appConfigTable)
      .values({ key: BREWERY_NAME_KEY, value: trimmed })
      .onConflictDoUpdate({ target: appConfigTable.key, set: { value: trimmed, updatedAt: new Date() } });
  } else {
    await db.delete(appConfigTable).where(eq(appConfigTable.key, BREWERY_NAME_KEY));
  }
  return res.json({ name: trimmed || null });
});

const VALID_DEFAULT_READINGS = new Set([5, 10, 25, 50, 100]);
const DEFAULT_READINGS_KEY = "default_readings_shown";

router.get("/settings/default-readings-shown", async (_req, res) => {
  const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, DEFAULT_READINGS_KEY));
  const parsed = row?.value ? parseInt(row.value, 10) : 5;
  const count = Number.isFinite(parsed) && VALID_DEFAULT_READINGS.has(parsed) ? parsed : 5;
  return res.json({ count });
});

router.put("/settings/default-readings-shown", async (req, res) => {
  const { count } = req.body as { count: unknown };
  if (typeof count !== "number" || !VALID_DEFAULT_READINGS.has(count)) {
    return res.status(400).json({ error: "count must be 5, 10, 25, 50, or 100" });
  }
  await db
    .insert(appConfigTable)
    .values({ key: DEFAULT_READINGS_KEY, value: String(count) })
    .onConflictDoUpdate({ target: appConfigTable.key, set: { value: String(count), updatedAt: new Date() } });
  return res.json({ count });
});

const VALID_FERMENT_TEMP_UNITS = new Set(["F", "C"]);
const FERMENT_TEMP_UNIT_KEY = "ferment_temp_unit";
const TEMP_ALERT_READINGS_KEY = "temp_alert_consecutive_readings";

router.get("/settings/ferment-temp-unit", async (_req, res) => {
  const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, FERMENT_TEMP_UNIT_KEY));
  return res.json({ unit: row?.value ?? "F" });
});

router.put("/settings/ferment-temp-unit", async (req, res) => {
  const { unit } = req.body as { unit: unknown };
  if (typeof unit !== "string" || !VALID_FERMENT_TEMP_UNITS.has(unit)) {
    return res.status(400).json({ error: "unit must be 'F' or 'C'" });
  }
  await db
    .insert(appConfigTable)
    .values({ key: FERMENT_TEMP_UNIT_KEY, value: unit })
    .onConflictDoUpdate({ target: appConfigTable.key, set: { value: unit, updatedAt: new Date() } });
  return res.json({ unit });
});

router.get("/settings/temp-alert-readings", async (_req, res) => {
  const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, TEMP_ALERT_READINGS_KEY));
  const parsed = row?.value ? parseInt(row.value, 10) : 2;
  const count = Number.isFinite(parsed) && parsed >= 2 && parsed <= 10 ? parsed : 2;
  return res.json({ count });
});

router.put("/settings/temp-alert-readings", async (req, res) => {
  const { count } = req.body as { count: unknown };
  if (typeof count !== "number" || !Number.isInteger(count) || count < 2 || count > 10) {
    return res.status(400).json({ error: "count must be an integer between 2 and 10" });
  }
  await db
    .insert(appConfigTable)
    .values({ key: TEMP_ALERT_READINGS_KEY, value: String(count) })
    .onConflictDoUpdate({ target: appConfigTable.key, set: { value: String(count), updatedAt: new Date() } });
  return res.json({ count });
});

export default router;
