import { Router } from "express";
import { and, eq, ilike } from "drizzle-orm";
import { db, inventoryTable } from "@workspace/db";
import {
  ListInventoryQueryParams,
  CreateInventoryItemBody,
  UpdateInventoryItemParams,
  UpdateInventoryItemBody,
  DeleteInventoryItemParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/inventory", async (req, res) => {
  const query = ListInventoryQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "Invalid query parameters" });

  const conditions = [
    ...(query.data.type ? [eq(inventoryTable.type, query.data.type)] : []),
    ...(query.data.search ? [ilike(inventoryTable.name, `%${query.data.search}%`)] : []),
  ];

  const rows = await db
    .select()
    .from(inventoryTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(inventoryTable.name);

  return res.json(rows);
});

router.post("/inventory", async (req, res) => {
  const body = CreateInventoryItemBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [item] = await db
    .insert(inventoryTable)
    .values({ ...body.data })
    .returning();
  return res.status(201).json(item);
});

router.put("/inventory/:id", async (req, res) => {
  const params = UpdateInventoryItemParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const body = UpdateInventoryItemBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [item] = await db
    .update(inventoryTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(inventoryTable.id, params.data.id))
    .returning();
  if (!item) return res.status(404).json({ error: "Inventory item not found" });
  return res.json(item);
});

router.delete("/inventory/:id", async (req, res) => {
  const params = DeleteInventoryItemParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  await db.delete(inventoryTable).where(eq(inventoryTable.id, params.data.id));
  return res.status(204).send();
});

export default router;
