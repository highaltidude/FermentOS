import { Router } from "express";
import { db } from "@workspace/db";
import { equipmentTable, insertEquipmentSchema } from "@workspace/db";
import { eq, ilike, and } from "drizzle-orm";

const router = Router();

// GET /api/equipment
router.get("/", async (req, res) => {
  try {
    const toStr = (v: unknown): string | undefined => {
      if (typeof v === "string") return v;
      if (Array.isArray(v) && typeof v[0] === "string") return v[0];
      return undefined;
    };
    const category = toStr(req.query.category);
    const search = toStr(req.query.search);

    let items = await db.select().from(equipmentTable).orderBy(equipmentTable.category, equipmentTable.name);

    if (category) {
      items = items.filter((i) => i.category.toLowerCase() === category.toLowerCase());
    }
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(s) ||
          (i.brand ?? "").toLowerCase().includes(s) ||
          (i.model ?? "").toLowerCase().includes(s) ||
          i.category.toLowerCase().includes(s),
      );
    }

    res.json(items);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch equipment" });
  }
});

// POST /api/equipment
router.post("/", async (req, res) => {
  try {
    const parsed = insertEquipmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const [item] = await db.insert(equipmentTable).values(parsed.data).returning();
    return res.status(201).json(item);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to create equipment" });
  }
});

// PUT /api/equipment/:id
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const parsed = insertEquipmentSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }
    const [item] = await db
      .update(equipmentTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(equipmentTable.id, id))
      .returning();
    if (!item) return res.status(404).json({ error: "Equipment not found" });
    return res.json(item);
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to update equipment" });
  }
});

// DELETE /api/equipment/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(equipmentTable).where(eq(equipmentTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to delete equipment" });
  }
});

export default router;
