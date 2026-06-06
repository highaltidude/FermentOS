import { Router } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, brewSessionsTable, fermentationReadingsTable, brewSessionStatusLogTable } from "@workspace/db";
import {
  ListBrewSessionsQueryParams,
  CreateBrewSessionBody,
  GetBrewSessionParams,
  UpdateBrewSessionParams,
  UpdateBrewSessionBody,
  DeleteBrewSessionParams,
  ListFermentationReadingsParams,
  AddFermentationReadingParams,
  AddFermentationReadingBody,
  DeleteFermentationReadingParams,
} from "@workspace/api-zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  isInventoryEnforcementEnabled,
  consumeRecipeIngredientsTx,
  type InventoryShortage,
} from "../services/inventoryEnforcement";

function calcAbv(og: number | null | undefined, fg: number | null | undefined): number | null {
  if (og == null || fg == null) return null;
  return Math.round((og - fg) * 131.25 * 100) / 100;
}

const uploadsDir = path.resolve(process.cwd(), "data/uploads/sessions");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `session-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();

router.get("/brew-sessions", async (req, res) => {
  const query = ListBrewSessionsQueryParams.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: "Invalid query parameters" });

  const conditions = [
    query.data.status ? eq(brewSessionsTable.status, query.data.status) : undefined,
    query.data.recipeId ? eq(brewSessionsTable.recipeId, query.data.recipeId) : undefined,
  ].filter((c) => c !== undefined);

  const rows = await db
    .select()
    .from(brewSessionsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(brewSessionsTable.brewDate));

  return res.json(rows);
});

router.post("/brew-sessions", async (req, res) => {
  const body = CreateBrewSessionBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const { brewDate: brewDateRaw, ...restInsert } = body.data;
  const brewDateStr = String(brewDateRaw);

  const enforce = body.data.recipeId && (await isInventoryEnforcementEnabled());

  // When enforcement is on, run inventory check + deduction + session insert
  // in a single transaction. Inventory rows are SELECT FOR UPDATE locked
  // inside consumeRecipeIngredientsTx so two concurrent brews can't both
  // pass the check on the same stock.
  type Outcome =
    | { kind: "created"; session: typeof brewSessionsTable.$inferSelect }
    | { kind: "shortage"; shortages: InventoryShortage[] };

  // Sentinel error used only to abort the transaction with a typed payload.
  class ShortageAbort extends Error {
    constructor(public shortages: InventoryShortage[]) { super("inventory shortage"); }
  }

  let outcome: Outcome;
  if (enforce && body.data.recipeId) {
    outcome = await db.transaction(async (tx) => {
      const result = await consumeRecipeIngredientsTx(tx, body.data.recipeId!);
      if (!result.ok) {
        // Rolling back is required so the FOR UPDATE locks release without
        // half-applying any deductions. Throwing aborts the transaction.
        throw new ShortageAbort(result.shortages);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [session] = await tx.insert(brewSessionsTable).values({ ...restInsert, brewDate: brewDateStr } as any).returning();
      return { kind: "created" as const, session };
    }).catch((err: unknown) => {
      if (err instanceof ShortageAbort) {
        return { kind: "shortage" as const, shortages: err.shortages };
      }
      throw err;
    });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [session] = await db.insert(brewSessionsTable).values({ ...restInsert, brewDate: brewDateStr } as any).returning();
    outcome = { kind: "created", session };
  }

  if (outcome.kind === "shortage") {
    return res.status(409).json({ error: "Insufficient inventory", shortages: outcome.shortages });
  }
  return res.status(201).json(outcome.session);
});

router.get("/brew-sessions/:id", async (req, res) => {
  const params = GetBrewSessionParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const [session] = await db
    .select()
    .from(brewSessionsTable)
    .where(eq(brewSessionsTable.id, params.data.id));
  if (!session) return res.status(404).json({ error: "Brew session not found" });

  const readings = await db
    .select()
    .from(fermentationReadingsTable)
    .where(eq(fermentationReadingsTable.brewSessionId, params.data.id))
    .orderBy(fermentationReadingsTable.readingAt);

  const statusLog = await db
    .select()
    .from(brewSessionStatusLogTable)
    .where(eq(brewSessionStatusLogTable.brewSessionId, params.data.id))
    .orderBy(brewSessionStatusLogTable.changedAt);

  return res.json({ ...session, readings, statusLog });
});

router.put("/brew-sessions/:id", async (req, res) => {
  const params = UpdateBrewSessionParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const body = UpdateBrewSessionBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const existing = await db.select().from(brewSessionsTable).where(eq(brewSessionsTable.id, params.data.id));
  if (!existing[0]) return res.status(404).json({ error: "Brew session not found" });

  const { brewDate: brewDateRawUpd, plannedDate: plannedDateRawUpd, ...restUpdate } = body.data;
  const brewDateUpd = brewDateRawUpd;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePayload: any = { ...restUpdate, updatedAt: new Date() };
  if (brewDateUpd !== undefined) updatePayload.brewDate = brewDateUpd;
  // plannedDate is nullable — explicit null clears it, undefined leaves untouched.
  if (plannedDateRawUpd !== undefined) updatePayload.plannedDate = plannedDateRawUpd;

  // Auto-calculate ABV when session is packaged or when OG/FG change on a packaged session
  const resultingStatus = updatePayload.status ?? existing[0].status;
  const resultingOg = updatePayload.originalGravityActual ?? existing[0].originalGravityActual;
  const resultingFg = updatePayload.finalGravityActual ?? existing[0].finalGravityActual;

  if (resultingStatus === "packaged" && updatePayload.abvActual === undefined) {
    const existingAbv = existing[0].abvActual;
    if (existingAbv == null) {
      const calculated = calcAbv(resultingOg, resultingFg);
      if (calculated != null) updatePayload.abvActual = calculated;
    } else if (
      updatePayload.originalGravityActual !== undefined ||
      updatePayload.finalGravityActual !== undefined
    ) {
      const calculated = calcAbv(resultingOg, resultingFg);
      if (calculated != null) updatePayload.abvActual = calculated;
    }
  }

  const [session] = await db.update(brewSessionsTable).set(updatePayload).where(eq(brewSessionsTable.id, params.data.id)).returning();
  if (!session) return res.status(404).json({ error: "Brew session not found" });

  if (body.data.status && body.data.status !== existing[0].status) {
    await db.insert(brewSessionStatusLogTable).values({
      brewSessionId: params.data.id,
      status: body.data.status,
      changedAt: new Date(),
    });
  }

  return res.json(session);
});

router.delete("/brew-sessions/:id", async (req, res) => {
  const params = DeleteBrewSessionParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  await db.delete(brewSessionsTable).where(eq(brewSessionsTable.id, params.data.id));
  return res.status(204).send();
});

router.get("/brew-sessions/:id/readings", async (req, res) => {
  const params = ListFermentationReadingsParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const readings = await db
    .select()
    .from(fermentationReadingsTable)
    .where(eq(fermentationReadingsTable.brewSessionId, params.data.id))
    .orderBy(fermentationReadingsTable.readingAt);

  return res.json(readings);
});

router.post("/brew-sessions/:id/readings", async (req, res) => {
  const params = AddFermentationReadingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const body = AddFermentationReadingBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [reading] = await db
    .insert(fermentationReadingsTable)
    .values({ ...body.data, brewSessionId: params.data.id, readingAt: new Date(body.data.readingAt), source: "manual" })
    .returning();
  return res.status(201).json(reading);
});

router.delete("/readings/:id", async (req, res) => {
  const params = DeleteFermentationReadingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  await db.delete(fermentationReadingsTable).where(eq(fermentationReadingsTable.id, params.data.id));
  return res.status(204).send();
});

router.delete("/status-log/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  await db.delete(brewSessionStatusLogTable).where(eq(brewSessionStatusLogTable.id, id));
  return res.status(204).send();
});

router.post("/brew-sessions/:id/photo", upload.single("photo"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const [existing] = await db.select().from(brewSessionsTable).where(eq(brewSessionsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Brew session not found" });

  if (existing.photoPath) {
    const old = path.join(uploadsDir, existing.photoPath);
    try {
      if (fs.existsSync(old)) fs.unlinkSync(old);
    } catch (err) {
      req.log.warn({ err, path: old }, "Failed to delete previous photo");
    }
  }

  const filename = req.file.filename;
  await db.update(brewSessionsTable).set({ photoPath: filename, updatedAt: new Date() }).where(eq(brewSessionsTable.id, id));
  return res.json({ photoPath: filename });
});

router.delete("/brew-sessions/:id/photo", async (req, res) => {
  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [existing] = await db.select().from(brewSessionsTable).where(eq(brewSessionsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Brew session not found" });

  if (existing.photoPath) {
    const filePath = path.join(uploadsDir, existing.photoPath);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      req.log.warn({ err, path: filePath }, "Failed to delete photo file");
    }
  }

  await db.update(brewSessionsTable).set({ photoPath: null, updatedAt: new Date() }).where(eq(brewSessionsTable.id, id));
  return res.status(204).send();
});

export default router;
