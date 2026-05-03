import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { db, beerStylesTable } from "@workspace/db";
import { CreateBeerStyleBody, DeleteBeerStyleParams } from "@workspace/api-zod";
import {
  isInventoryEnforcementEnabled,
  setInventoryEnforcementEnabled,
} from "../services/inventoryEnforcement";

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

export default router;
