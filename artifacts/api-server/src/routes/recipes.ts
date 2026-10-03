import { Router } from "express";
import { eq, ilike, or, and, avg, count, sql, asc, inArray } from "drizzle-orm";
import { db, recipesTable, recipeIngredientsTable, recipeStepsTable, brewSessionsTable } from "@workspace/db";
import {
  CreateRecipeBody,
  UpdateRecipeBody,
  ListRecipesQueryParams,
  AddRecipeIngredientBody,
  UpdateRecipeIngredientBody,
  AddRecipeStepBody,
  UpdateRecipeStepBody,
  ReorderRecipeStepsBody,
} from "@workspace/api-zod";
import { parseIdParam } from "../lib/http";

const router = Router();

/** SQL avg() comes back as a numeric string; round it to one decimal. */
function roundScore(avgScore: string | null | undefined): number | null {
  return avgScore != null ? Math.round(Number(avgScore) * 10) / 10 : null;
}

function recipeIngredients(recipeId: number) {
  return db
    .select()
    .from(recipeIngredientsTable)
    .where(eq(recipeIngredientsTable.recipeId, recipeId));
}

function orderedRecipeSteps(recipeId: number) {
  return db
    .select()
    .from(recipeStepsTable)
    .where(eq(recipeStepsTable.recipeId, recipeId))
    .orderBy(asc(recipeStepsTable.position), asc(recipeStepsTable.id));
}

router.get("/recipes", async (req, res) => {
  const query = ListRecipesQueryParams.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ error: "Invalid query parameters" });
  }
  const { style, search } = query.data;

  const stats = await db
    .select({
      recipeId: brewSessionsTable.recipeId,
      avgScore: avg(brewSessionsTable.overallScore),
      // count() over a column skips nulls, so this is the number of *rated*
      // batches while batchCount below stays the total.
      ratedBatchCount: count(brewSessionsTable.overallScore),
      batchCount: count(brewSessionsTable.id),
    })
    .from(brewSessionsTable)
    .where(sql`${brewSessionsTable.recipeId} is not null`)
    .groupBy(brewSessionsTable.recipeId);

  const statsMap = new Map(stats.map((s) => [s.recipeId, s]));

  const conditions = [
    ...(search
      ? [or(ilike(recipesTable.name, `%${search}%`), ilike(recipesTable.style, `%${search}%`))]
      : []),
    ...(style ? [eq(recipesTable.style, style)] : []),
  ];

  const rows = await db
    .select()
    .from(recipesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(recipesTable.createdAt);

  return res.json(
    rows.map((r) => {
      const s = statsMap.get(r.id);
      return {
        ...r,
        avgScore: roundScore(s?.avgScore),
        ratedBatchCount: s?.ratedBatchCount ?? 0,
        batchCount: s?.batchCount ?? 0,
      };
    })
  );
});

router.post("/recipes", async (req, res) => {
  const body = CreateRecipeBody.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  const [recipe] = await db
    .insert(recipesTable)
    .values({ ...body.data })
    .returning();
  return res.status(201).json(recipe);
});

router.get("/recipes/styles", async (req, res) => {
  const rows = await db.select().from(recipesTable);
  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.style] = (counts[r.style] ?? 0) + 1;
  }
  return res.json(Object.entries(counts).map(([style, count]) => ({ style, count })));
});

router.get("/recipes/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const [recipe] = await db
    .select()
    .from(recipesTable)
    .where(eq(recipesTable.id, id));
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });

  const [ingredients, steps, ratedBatches, [stats]] = await Promise.all([
    recipeIngredients(id),
    orderedRecipeSteps(id),
    // Track record: every scored batch brewed from this recipe, oldest first.
    db
      .select({
        id: brewSessionsTable.id,
        brewDate: brewSessionsTable.brewDate,
        recipeName: brewSessionsTable.recipeName,
        overallScore: brewSessionsTable.overallScore,
      })
      .from(brewSessionsTable)
      .where(
        and(
          eq(brewSessionsTable.recipeId, id),
          sql`${brewSessionsTable.overallScore} is not null`,
        ),
      )
      .orderBy(asc(brewSessionsTable.brewDate), asc(brewSessionsTable.id)),
    db
      .select({
        avgScore: avg(brewSessionsTable.overallScore),
        ratedBatchCount: count(brewSessionsTable.overallScore),
        batchCount: count(brewSessionsTable.id),
      })
      .from(brewSessionsTable)
      .where(eq(brewSessionsTable.recipeId, id)),
  ]);

  return res.json({
    ...recipe,
    ingredients,
    steps,
    ratedBatches,
    avgScore: roundScore(stats?.avgScore),
    ratedBatchCount: stats?.ratedBatchCount ?? 0,
    batchCount: stats?.batchCount ?? 0,
  });
});

router.put("/recipes/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const body = UpdateRecipeBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [recipe] = await db
    .update(recipesTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(recipesTable.id, id))
    .returning();
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });
  return res.json(recipe);
});

router.delete("/recipes/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  await db.delete(recipesTable).where(eq(recipesTable.id, id));
  return res.status(204).send();
});

router.get("/recipes/:id/ingredients", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const ingredients = await recipeIngredients(id);
  return res.json(ingredients);
});

router.post("/recipes/:id/ingredients", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const body = AddRecipeIngredientBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [ingredient] = await db
    .insert(recipeIngredientsTable)
    .values({ ...body.data, recipeId: id })
    .returning();
  return res.status(201).json(ingredient);
});

router.put("/ingredients/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const body = UpdateRecipeIngredientBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [ingredient] = await db
    .update(recipeIngredientsTable)
    .set(body.data)
    .where(eq(recipeIngredientsTable.id, id))
    .returning();
  if (!ingredient) return res.status(404).json({ error: "Ingredient not found" });
  return res.json(ingredient);
});

router.delete("/ingredients/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  await db.delete(recipeIngredientsTable).where(eq(recipeIngredientsTable.id, id));
  return res.status(204).send();
});

// ── Recipe steps ──────────────────────────────────────────────────────────

router.get("/recipes/:id/steps", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const steps = await orderedRecipeSteps(id);
  return res.json(steps);
});

router.post("/recipes/:id/steps", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const body = AddRecipeStepBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  // Default the position to "end of list" so callers can simply append.
  let position = body.data.position ?? null;
  if (position == null) {
    const [maxRow] = await db
      .select({ max: sql<number>`coalesce(max(${recipeStepsTable.position}), 0)` })
      .from(recipeStepsTable)
      .where(eq(recipeStepsTable.recipeId, id));
    position = (maxRow?.max ?? 0) + 1;
  }

  const [step] = await db
    .insert(recipeStepsTable)
    .values({
      recipeId: id,
      position,
      body: body.data.body,
      phase: body.data.phase ?? null,
      durationMinutes: body.data.durationMinutes ?? null,
    })
    .returning();
  return res.status(201).json(step);
});

router.put("/steps/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const body = UpdateRecipeStepBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [step] = await db
    .update(recipeStepsTable)
    .set(body.data)
    .where(eq(recipeStepsTable.id, id))
    .returning();
  if (!step) return res.status(404).json({ error: "Step not found" });
  return res.json(step);
});

router.delete("/steps/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  await db.delete(recipeStepsTable).where(eq(recipeStepsTable.id, id));
  return res.status(204).send();
});

router.put("/recipes/:id/steps/reorder", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const body = ReorderRecipeStepsBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  // Verify the supplied IDs exactly match the recipe's current step set, so a
  // bad reorder request can't silently leave gaps or move other recipes' steps.
  const existing = await db
    .select({ id: recipeStepsTable.id })
    .from(recipeStepsTable)
    .where(eq(recipeStepsTable.recipeId, id));
  const existingIds = new Set(existing.map((s) => s.id));
  const submitted = new Set(body.data.stepIds);
  if (existingIds.size !== submitted.size || [...existingIds].some((stepId) => !submitted.has(stepId))) {
    return res.status(400).json({ error: "stepIds must list exactly the recipe's current step IDs" });
  }

  const updated = await db.transaction(async (tx) => {
    for (let i = 0; i < body.data.stepIds.length; i++) {
      await tx
        .update(recipeStepsTable)
        .set({ position: i + 1 })
        .where(eq(recipeStepsTable.id, body.data.stepIds[i]!));
    }
    return tx
      .select()
      .from(recipeStepsTable)
      .where(inArray(recipeStepsTable.id, body.data.stepIds))
      .orderBy(asc(recipeStepsTable.position), asc(recipeStepsTable.id));
  });

  return res.json(updated);
});

export default router;
