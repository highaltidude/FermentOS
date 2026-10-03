import { Router } from "express";
import { and, eq, desc, gte, lte, isNull } from "drizzle-orm";
import { db, brewSessionsTable, fermentationReadingsTable, brewSessionStatusLogTable, sensorReadingsTable, sensorDeviceBrewAssignmentsTable } from "@workspace/db";
import {
  ListBrewSessionsQueryParams,
  CreateBrewSessionBody,
  UpdateBrewSessionBody,
  AddFermentationReadingBody,
  UpsertBrewRatingBody,
  ControlBoilBody,
} from "@workspace/api-zod";
import type { Request } from "express";
import { boilPhase } from "../lib/boilTimer";
import { parseIdParam } from "../lib/http";
import { SESSION_UPLOADS_DIR } from "../lib/paths";
import { scheduleBoilAlerts, clearBoilAlerts } from "../services/boilScheduler";
import { createBrewSession } from "../services/brewSessionCreate";
import multer from "multer";
import path from "path";
import fs from "fs";

function calcAbv(og: number | null | undefined, fg: number | null | undefined): number | null {
  if (og == null || fg == null) return null;
  return Math.round((og - fg) * 131.25 * 100) / 100;
}

fs.mkdirSync(SESSION_UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, SESSION_UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `session-${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

/** Best-effort removal of a stored photo; a failure is logged, never thrown. */
function unlinkSessionPhoto(req: Request, photoPath: string, failureMessage: string): void {
  const filePath = path.join(SESSION_UPLOADS_DIR, photoPath);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    req.log.warn({ err, path: filePath }, failureMessage);
  }
}

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

  const outcome = await createBrewSession(body.data);
  if (outcome.kind === "shortage") {
    return res.status(409).json({ error: "Insufficient inventory", shortages: outcome.shortages });
  }
  return res.status(201).json(outcome.session);
});

router.get("/brew-sessions/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const [session] = await db
    .select()
    .from(brewSessionsTable)
    .where(eq(brewSessionsTable.id, id));
  if (!session) return res.status(404).json({ error: "Brew session not found" });

  const [readings, statusLog] = await Promise.all([
    db
      .select()
      .from(fermentationReadingsTable)
      .where(eq(fermentationReadingsTable.brewSessionId, id))
      .orderBy(fermentationReadingsTable.readingAt),
    db
      .select()
      .from(brewSessionStatusLogTable)
      .where(eq(brewSessionStatusLogTable.brewSessionId, id))
      .orderBy(brewSessionStatusLogTable.changedAt),
  ]);

  return res.json({ ...session, readings, statusLog });
});

router.put("/brew-sessions/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const body = UpdateBrewSessionBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const existing = await db.select().from(brewSessionsTable).where(eq(brewSessionsTable.id, id));
  if (!existing[0]) return res.status(404).json({ error: "Brew session not found" });

  const { brewDate: brewDateRawUpd, plannedDate: plannedDateRawUpd, ...restUpdate } = body.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePayload: any = { ...restUpdate, updatedAt: new Date() };
  if (brewDateRawUpd !== undefined) updatePayload.brewDate = brewDateRawUpd;
  // plannedDate is nullable — explicit null clears it, undefined leaves untouched.
  if (plannedDateRawUpd !== undefined) updatePayload.plannedDate = plannedDateRawUpd;

  // Auto-calculate ABV when session is packaged or when OG/FG change on a packaged session
  const resultingStatus = updatePayload.status ?? existing[0].status;
  const resultingOg = updatePayload.originalGravityActual ?? existing[0].originalGravityActual;
  const resultingFg = updatePayload.finalGravityActual ?? existing[0].finalGravityActual;

  if (resultingStatus === "packaged" && updatePayload.abvActual === undefined) {
    const gravityChanged =
      updatePayload.originalGravityActual !== undefined ||
      updatePayload.finalGravityActual !== undefined;
    if (existing[0].abvActual == null || gravityChanged) {
      const calculated = calcAbv(resultingOg, resultingFg);
      if (calculated != null) updatePayload.abvActual = calculated;
    }
  }

  const [session] = await db.update(brewSessionsTable).set(updatePayload).where(eq(brewSessionsTable.id, id)).returning();
  if (!session) return res.status(404).json({ error: "Brew session not found" });

  if (body.data.status && body.data.status !== existing[0].status) {
    await db.insert(brewSessionStatusLogTable).values({
      brewSessionId: id,
      status: body.data.status,
      changedAt: new Date(),
    });
  }

  // Auto-unassign any active sensor devices when a session is marked packaged
  let devicesUnassigned = 0;
  if (body.data.status === "packaged") {
    const result = await db
      .update(sensorDeviceBrewAssignmentsTable)
      .set({ unassignedAt: new Date() })
      .where(
        and(
          eq(sensorDeviceBrewAssignmentsTable.brewSessionId, id),
          isNull(sensorDeviceBrewAssignmentsTable.unassignedAt),
        )
      )
      .returning();
    devicesUnassigned = result.length;
  }

  return res.json({ ...session, devicesUnassigned });
});

router.delete("/brew-sessions/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  await db.delete(brewSessionsTable).where(eq(brewSessionsTable.id, id));
  clearBoilAlerts(id);
  return res.status(204).send();
});

router.get("/brew-sessions/:id/readings", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const readings = await db
    .select()
    .from(fermentationReadingsTable)
    .where(eq(fermentationReadingsTable.brewSessionId, id))
    .orderBy(fermentationReadingsTable.readingAt);

  return res.json(readings);
});

router.post("/brew-sessions/:id/readings", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const body = AddFermentationReadingBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [reading] = await db
    .insert(fermentationReadingsTable)
    .values({ ...body.data, brewSessionId: id, readingAt: new Date(body.data.readingAt), source: "manual" })
    .returning();
  return res.status(201).json(reading);
});

router.delete("/readings/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  // Fetch the reading before deleting so we know the source and readingAt
  const [reading] = await db
    .select()
    .from(fermentationReadingsTable)
    .where(eq(fermentationReadingsTable.id, id));

  if (reading?.source === "ispindel") {
    // Unlink the corresponding sensor reading from this brew session
    // Match by brewSessionId and readingAt timestamp (within 1 minute tolerance)
    const readingTime = new Date(reading.readingAt);
    const windowStart = new Date(readingTime.getTime() - 60_000);
    const windowEnd = new Date(readingTime.getTime() + 60_000);
    await db
      .update(sensorReadingsTable)
      .set({ brewSessionId: null })
      .where(
        and(
          eq(sensorReadingsTable.brewSessionId, reading.brewSessionId),
          gte(sensorReadingsTable.receivedAt, windowStart),
          lte(sensorReadingsTable.receivedAt, windowEnd),
        )
      );
  }

  await db.delete(fermentationReadingsTable).where(eq(fermentationReadingsTable.id, id));
  return res.status(204).send();
});

router.delete("/status-log/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  await db.delete(brewSessionStatusLogTable).where(eq(brewSessionStatusLogTable.id, id));
  return res.status(204).send();
});

router.post("/brew-sessions/:id/photo", upload.single("photo"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const [existing] = await db.select().from(brewSessionsTable).where(eq(brewSessionsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Brew session not found" });

  if (existing.photoPath) unlinkSessionPhoto(req, existing.photoPath, "Failed to delete previous photo");

  const filename = req.file.filename;
  await db.update(brewSessionsTable).set({ photoPath: filename, updatedAt: new Date() }).where(eq(brewSessionsTable.id, id));
  return res.json({ photoPath: filename });
});

router.delete("/brew-sessions/:id/photo", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });

  const [existing] = await db.select().from(brewSessionsTable).where(eq(brewSessionsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Brew session not found" });

  if (existing.photoPath) unlinkSessionPhoto(req, existing.photoPath, "Failed to delete photo file");

  await db.update(brewSessionsTable).set({ photoPath: null, updatedAt: new Date() }).where(eq(brewSessionsTable.id, id));
  return res.status(204).send();
});

// Boil timer. Its own sub-resource for the same reason as the scorecard below:
// the detail page re-sends the whole session on every save, which would stomp
// on a running timer. Every change reschedules the server-side addition alerts.
router.post("/brew-sessions/:id/boil", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const body = ControlBoilBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [existing] = await db.select().from(brewSessionsTable).where(eq(brewSessionsTable.id, id));
  if (!existing) return res.status(404).json({ error: "Brew session not found" });

  const { action, boilMinutes, doneAdditionIds } = body.data;
  const phase = boilPhase(existing);
  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = { updatedAt: now };

  switch (action) {
    case "start":
      if (boilMinutes == null) return res.status(400).json({ error: "boilMinutes is required to start" });
      Object.assign(update, {
        boilMinutes,
        boilStartedAt: now,
        boilPausedAt: null,
        boilPausedMs: 0,
        boilEndedAt: null,
        boilDoneAdditionIds: doneAdditionIds ?? [],
      });
      break;
    case "pause":
      if (phase !== "running") return res.status(400).json({ error: "Boil is not running" });
      update.boilPausedAt = now;
      break;
    case "resume":
      if (phase !== "paused") return res.status(400).json({ error: "Boil is not paused" });
      update.boilPausedMs = (existing.boilPausedMs ?? 0) + (now.getTime() - existing.boilPausedAt!.getTime());
      update.boilPausedAt = null;
      break;
    case "finish":
      if (phase !== "running" && phase !== "paused") return res.status(400).json({ error: "Boil is not in progress" });
      // Fold an open pause in so elapsed time stays correct after the fact.
      if (existing.boilPausedAt) {
        update.boilPausedMs = (existing.boilPausedMs ?? 0) + (now.getTime() - existing.boilPausedAt.getTime());
        update.boilPausedAt = null;
      }
      update.boilEndedAt = now;
      break;
    case "reset":
      Object.assign(update, {
        boilMinutes: null,
        boilStartedAt: null,
        boilPausedAt: null,
        boilPausedMs: null,
        boilEndedAt: null,
        boilDoneAdditionIds: null,
      });
      break;
    case "checklist":
      break;
  }

  if (action !== "start" && action !== "reset") {
    // Lengthening or shortening a boil already under way.
    if (boilMinutes != null) {
      if (phase === "idle") return res.status(400).json({ error: "Boil has not started" });
      update.boilMinutes = boilMinutes;
    }
    if (doneAdditionIds !== undefined) update.boilDoneAdditionIds = doneAdditionIds;
  }

  const [session] = await db.update(brewSessionsTable).set(update).where(eq(brewSessionsTable.id, id)).returning();

  // A failure to schedule must not fail the request — the timer itself is
  // saved and the page still counts down and beeps.
  await scheduleBoilAlerts(id).catch((err) =>
    req.log.error({ err, brewSessionId: id }, "Failed to schedule boil alerts"));

  return res.json(session);
});

// The tasting scorecard lives on its own sub-resource rather than in
// UpdateBrewSessionBody: the detail page re-sends the whole session on every
// mutation, so a scorecard field in that body would be nulled out by an
// unrelated status or gravity save.
router.put("/brew-sessions/:id/rating", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const body = UpsertBrewRatingBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [session] = await db
    .update(brewSessionsTable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set({ ...body.data, ratedAt: new Date(), updatedAt: new Date() } as any)
    .where(eq(brewSessionsTable.id, id))
    .returning();
  if (!session) return res.status(404).json({ error: "Brew session not found" });
  return res.json(session);
});

router.delete("/brew-sessions/:id/rating", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  await db
    .update(brewSessionsTable)
    .set({
      appearanceAromaScore: null,
      flavorBalanceScore: null,
      mouthfeelScore: null,
      overallScore: null,
      offFlavors: null,
      brewAgain: null,
      ratedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(brewSessionsTable.id, id));
  return res.status(204).send();
});

export default router;
