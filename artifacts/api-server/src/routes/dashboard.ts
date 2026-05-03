import { Router } from "express";
import { db, brewSessionsTable, recipesTable, inventoryTable, fermentationReadingsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const router = Router();

router.get("/dashboard/summary", async (req, res) => {
  const recipes = await db.select().from(recipesTable);
  const sessions = await db.select().from(brewSessionsTable).orderBy(brewSessionsTable.createdAt);
  const inventory = await db.select().from(inventoryTable);

  const activeStatuses = ["brewing", "fermenting", "conditioning"];
  const activeSessions = sessions.filter((s) => activeStatuses.includes(s.status));
  const recentSessions = sessions.slice().reverse().slice(0, 5);

  return res.json({
    totalRecipes: recipes.length,
    totalBrewSessions: sessions.length,
    activeBrewCount: activeSessions.length,
    inventoryItemCount: inventory.length,
    recentSessions,
  });
});

router.get("/dashboard/active-brews", async (req, res) => {
  // "scheduled" sessions are intentionally excluded — they haven't actually
  // started yet, so they shouldn't show up in the active brews widget.
  const activeStatuses = ["brewing", "fermenting", "conditioning"];
  const sessions = await db.select().from(brewSessionsTable);
  const activeSessions = sessions.filter((s) => activeStatuses.includes(s.status));

  const now = new Date();

  const activeBrews = await Promise.all(
    activeSessions.map(async (session) => {
      const readings = await db
        .select()
        .from(fermentationReadingsTable)
        .where(eq(fermentationReadingsTable.brewSessionId, session.id))
        .orderBy(fermentationReadingsTable.readingAt);

      const latestReading = readings[readings.length - 1];
      // session.brewDate is a YYYY-MM-DD date string. Compare both sides as
      // local-midnight to avoid timezone-induced off-by-one day counts.
      const [by, bm, bd] = String(session.brewDate).slice(0, 10).split("-").map(Number);
      const brewLocalMidnight = new Date(by, (bm ?? 1) - 1, bd ?? 1).getTime();
      const todayLocalMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const daysSinceBrew = Math.max(
        0,
        Math.floor((todayLocalMidnight - brewLocalMidnight) / (1000 * 60 * 60 * 24)),
      );

      let targetFinalGravity: number | null = null;
      if (session.recipeId) {
        const [recipe] = await db
          .select()
          .from(recipesTable)
          .where(eq(recipesTable.id, session.recipeId));
        targetFinalGravity = recipe?.finalGravity ?? null;
      }

      return {
        id: session.id,
        recipeName: session.recipeName,
        status: session.status,
        brewDate: session.brewDate,
        daysSinceBrew,
        latestTemperature: latestReading?.temperatureFahrenheit ?? null,
        latestGravity: latestReading?.gravity ?? null,
        targetFinalGravity,
      };
    })
  );

  return res.json(activeBrews);
});

router.get("/dashboard/upcoming-brews", async (req, res) => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : 5;

  const sessions = await db.select().from(brewSessionsTable);
  const scheduled = sessions.filter((s) => s.status === "scheduled");

  const now = new Date();
  const todayLocalMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const upcoming = scheduled
    .map((session) => {
      const [by, bm, bd] = String(session.brewDate).slice(0, 10).split("-").map(Number);
      const brewLocalMidnight = new Date(by, (bm ?? 1) - 1, bd ?? 1).getTime();
      const daysUntilBrew = Math.round((brewLocalMidnight - todayLocalMidnight) / (1000 * 60 * 60 * 24));
      return {
        id: session.id,
        recipeId: session.recipeId ?? null,
        recipeName: session.recipeName,
        brewDate: session.brewDate,
        daysUntilBrew,
        batchSizeGallons: session.batchSizeGallons,
      };
    })
    .sort((a, b) => String(a.brewDate).localeCompare(String(b.brewDate)))
    .slice(0, limit);

  return res.json(upcoming);
});

export default router;
