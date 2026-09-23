import { Router } from "express";
import { db, brewSessionsTable, recipesTable, inventoryTable, fermentationReadingsTable, brewSessionStatusLogTable, ACTIVE_BREW_STATUSES } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getBreweryName } from "../services/breweryName";

const router = Router();

router.get("/dashboard/summary", async (req, res) => {
  const [recipes, sessions, inventory, breweryName] = await Promise.all([
    db.select().from(recipesTable),
    db.select().from(brewSessionsTable).orderBy(brewSessionsTable.createdAt),
    db.select().from(inventoryTable),
    getBreweryName(),
  ]);

  // brew_day, fermenting, and conditioning are all active. packaged is terminal.
  const activeSessions = sessions.filter((s) => ACTIVE_BREW_STATUSES.includes(s.status));
  const recentSessions = sessions.slice().reverse().slice(0, 5);

  const topRatedBrews = sessions
    .filter((s) => s.overallScore != null)
    .sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))
    .slice(0, 3)
    .map((s) => ({
      id: s.id,
      recipeName: s.recipeName,
      brewDate: s.brewDate,
      overallScore: s.overallScore,
    }));

  return res.json({
    totalRecipes: recipes.length,
    totalBrewSessions: sessions.length,
    activeBrewCount: activeSessions.length,
    inventoryItemCount: inventory.length,
    breweryName,
    recentSessions,
    topRatedBrews,
  });
});

router.get("/dashboard/active-brews", async (req, res) => {
  const sessions = await db.select().from(brewSessionsTable);
  const activeSessions = sessions.filter((s) => ACTIVE_BREW_STATUSES.includes(s.status));

  const now = new Date();

  const activeBrews = await Promise.all(
    activeSessions.map(async (session) => {
      const readings = await db
        .select()
        .from(fermentationReadingsTable)
        .where(eq(fermentationReadingsTable.brewSessionId, session.id))
        .orderBy(fermentationReadingsTable.readingAt);

      const latestReading = readings[readings.length - 1];
      const [by, bm, bd] = String(session.brewDate).slice(0, 10).split("-").map(Number);
      const brewLocalMidnight = new Date(by, (bm ?? 1) - 1, bd ?? 1).getTime();
      const todayLocalMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const daysSinceBrew = Math.max(
        0,
        Math.floor((todayLocalMidnight - brewLocalMidnight) / (1000 * 60 * 60 * 24)),
      );

      const statusLog = await db
        .select()
        .from(brewSessionStatusLogTable)
        .where(eq(brewSessionStatusLogTable.brewSessionId, session.id))
        .orderBy(desc(brewSessionStatusLogTable.changedAt))
        .limit(1);

      let daysInCurrentStage: number | null = null;
      if (statusLog[0]) {
        const stageStart = new Date(statusLog[0].changedAt).getTime();
        daysInCurrentStage = Math.max(0, Math.floor((now.getTime() - stageStart) / (1000 * 60 * 60 * 24)));
      } else {
        daysInCurrentStage = daysSinceBrew;
      }

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
        daysInCurrentStage,
        latestTemperature: latestReading?.temperatureFahrenheit ?? null,
        latestGravity: latestReading?.gravity ?? null,
        targetFinalGravity,
        originalGravityActual: session.originalGravityActual ?? null,
      };
    })
  );

  return res.json(activeBrews);
});

// Returns an empty array — kept for API compatibility. The "scheduled" status
// no longer exists; all sessions start at brew_day.
router.get("/dashboard/upcoming-brews", async (_req, res) => {
  return res.json([]);
});

export default router;
