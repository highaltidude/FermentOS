import { Router } from "express";
import { db, brewSessionsTable, recipesTable, inventoryTable, fermentationReadingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/dashboard/summary", async (req, res) => {
  const recipes = await db.select().from(recipesTable);
  const sessions = await db.select().from(brewSessionsTable).orderBy(brewSessionsTable.createdAt);
  const inventory = await db.select().from(inventoryTable);

  // brew_day, fermenting, and conditioning are all active. packaged is terminal.
  const activeStatuses = ["brew_day", "fermenting", "conditioning"];
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
  const activeStatuses = ["brew_day", "fermenting", "conditioning"];
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
