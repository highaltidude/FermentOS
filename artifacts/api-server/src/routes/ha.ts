import { Router } from "express";
import { db, brewSessionsTable, recipesTable, inventoryTable, fermentationReadingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const ACTIVE_STATUSES = ["brew_day", "fermenting", "conditioning"] as const;

router.get("/status", async (req, res) => {
  const [sessions, recipes, inventory] = await Promise.all([
    db.select().from(brewSessionsTable),
    db.select().from(recipesTable),
    db.select().from(inventoryTable),
  ]);

  const activeSessions = sessions.filter((s) => (ACTIVE_STATUSES as readonly string[]).includes(s.status));

  // Pick the most recently updated active session as the "current brew".
  const candidate = activeSessions.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )[0] ?? null;

  let current_brew: Record<string, unknown> | null = null;

  if (candidate) {
    const readings = await db
      .select()
      .from(fermentationReadingsTable)
      .where(eq(fermentationReadingsTable.brewSessionId, candidate.id))
      .orderBy(fermentationReadingsTable.readingAt);

    const latest = readings[readings.length - 1] ?? null;

    let targetFg: number | null = null;
    if (candidate.recipeId) {
      const [recipe] = await db
        .select()
        .from(recipesTable)
        .where(eq(recipesTable.id, candidate.recipeId));
      targetFg = recipe?.finalGravity ?? null;
    }

    const now = new Date();
    const [by, bm, bd] = String(candidate.brewDate).slice(0, 10).split("-").map(Number);
    const brewMidnight = new Date(by, (bm ?? 1) - 1, bd ?? 1).getTime();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const daysSinceBrew = Math.max(0, Math.floor((todayMidnight - brewMidnight) / 86_400_000));

    current_brew = {
      name: candidate.recipeName,
      status: candidate.status,
      brew_date: String(candidate.brewDate).slice(0, 10),
      days_in_progress: daysSinceBrew,
      og: candidate.originalGravityActual ?? null,
      fg: candidate.finalGravityActual ?? null,
      abv: candidate.abvActual ?? null,
      temperature_f: latest?.temperatureFahrenheit ?? null,
      gravity: latest?.gravity ?? null,
      target_fg: targetFg,
    };
  }

  return res.json({
    fermentos: {
      active: activeSessions.length,
      recipes: recipes.length,
      sessions: sessions.length,
      inventory: inventory.length,
    },
    current_brew,
  });
});

export default router;
