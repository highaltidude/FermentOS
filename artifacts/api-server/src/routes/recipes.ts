import { Router } from "express";
import { eq, ilike, or, avg, count, sql, asc, inArray } from "drizzle-orm";
import { db, recipesTable, recipeIngredientsTable, recipeStepsTable, brewSessionsTable } from "@workspace/db";
import {
  CreateRecipeBody,
  UpdateRecipeBody,
  ListRecipesQueryParams,
  GetRecipeParams,
  UpdateRecipeParams,
  DeleteRecipeParams,
  ListRecipeIngredientsParams,
  AddRecipeIngredientParams,
  AddRecipeIngredientBody,
  UpdateRecipeIngredientParams,
  UpdateRecipeIngredientBody,
  DeleteRecipeIngredientParams,
  ListRecipeStepsParams,
  AddRecipeStepParams,
  AddRecipeStepBody,
  UpdateRecipeStepParams,
  UpdateRecipeStepBody,
  DeleteRecipeStepParams,
  ReorderRecipeStepsParams,
  ReorderRecipeStepsBody,
} from "@workspace/api-zod";

const router = Router();

router.get("/recipes", async (req, res) => {
  const query = ListRecipesQueryParams.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ error: "Invalid query parameters" });
  }
  const { style, search } = query.data;

  const stats = await db
    .select({
      recipeId: brewSessionsTable.recipeId,
      avgRating: avg(brewSessionsTable.rating),
      batchCount: count(brewSessionsTable.id),
    })
    .from(brewSessionsTable)
    .where(sql`${brewSessionsTable.recipeId} is not null`)
    .groupBy(brewSessionsTable.recipeId);

  const statsMap = new Map(stats.map((s) => [s.recipeId, s]));

  let rows = await db.select().from(recipesTable).orderBy(recipesTable.createdAt);

  if (search) {
    const lower = search.toLowerCase();
    rows = rows.filter(
      (r) => r.name.toLowerCase().includes(lower) || r.style.toLowerCase().includes(lower)
    );
  }
  if (style) {
    rows = rows.filter((r) => r.style === style);
  }

  return res.json(
    rows.map((r) => {
      const s = statsMap.get(r.id);
      return {
        ...r,
        avgRating: s?.avgRating != null ? Math.round(Number(s.avgRating) * 10) / 10 : null,
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
  const params = GetRecipeParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const [recipe] = await db
    .select()
    .from(recipesTable)
    .where(eq(recipesTable.id, params.data.id));
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });

  const ingredients = await db
    .select()
    .from(recipeIngredientsTable)
    .where(eq(recipeIngredientsTable.recipeId, params.data.id));

  const steps = await db
    .select()
    .from(recipeStepsTable)
    .where(eq(recipeStepsTable.recipeId, params.data.id))
    .orderBy(asc(recipeStepsTable.position), asc(recipeStepsTable.id));

  return res.json({ ...recipe, ingredients, steps });
});

router.put("/recipes/:id", async (req, res) => {
  const params = UpdateRecipeParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const body = UpdateRecipeBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [recipe] = await db
    .update(recipesTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(recipesTable.id, params.data.id))
    .returning();
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });
  return res.json(recipe);
});

router.delete("/recipes/:id", async (req, res) => {
  const params = DeleteRecipeParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  await db.delete(recipesTable).where(eq(recipesTable.id, params.data.id));
  return res.status(204).send();
});

router.get("/recipes/:id/ingredients", async (req, res) => {
  const params = ListRecipeIngredientsParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const ingredients = await db
    .select()
    .from(recipeIngredientsTable)
    .where(eq(recipeIngredientsTable.recipeId, params.data.id));
  return res.json(ingredients);
});

router.post("/recipes/:id/ingredients", async (req, res) => {
  const params = AddRecipeIngredientParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const body = AddRecipeIngredientBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [ingredient] = await db
    .insert(recipeIngredientsTable)
    .values({ ...body.data, recipeId: params.data.id })
    .returning();
  return res.status(201).json(ingredient);
});

router.put("/ingredients/:id", async (req, res) => {
  const params = UpdateRecipeIngredientParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const body = UpdateRecipeIngredientBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [ingredient] = await db
    .update(recipeIngredientsTable)
    .set(body.data)
    .where(eq(recipeIngredientsTable.id, params.data.id))
    .returning();
  if (!ingredient) return res.status(404).json({ error: "Ingredient not found" });
  return res.json(ingredient);
});

router.delete("/ingredients/:id", async (req, res) => {
  const params = DeleteRecipeIngredientParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  await db.delete(recipeIngredientsTable).where(eq(recipeIngredientsTable.id, params.data.id));
  return res.status(204).send();
});

// ── Recipe steps ──────────────────────────────────────────────────────────

router.get("/recipes/:id/steps", async (req, res) => {
  const params = ListRecipeStepsParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const steps = await db
    .select()
    .from(recipeStepsTable)
    .where(eq(recipeStepsTable.recipeId, params.data.id))
    .orderBy(asc(recipeStepsTable.position), asc(recipeStepsTable.id));
  return res.json(steps);
});

router.post("/recipes/:id/steps", async (req, res) => {
  const params = AddRecipeStepParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const body = AddRecipeStepBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  // Default the position to "end of list" so callers can simply append.
  let position = body.data.position ?? null;
  if (position == null) {
    const [maxRow] = await db
      .select({ max: sql<number>`coalesce(max(${recipeStepsTable.position}), 0)` })
      .from(recipeStepsTable)
      .where(eq(recipeStepsTable.recipeId, params.data.id));
    position = (maxRow?.max ?? 0) + 1;
  }

  const [step] = await db
    .insert(recipeStepsTable)
    .values({
      recipeId: params.data.id,
      position,
      body: body.data.body,
      phase: body.data.phase ?? null,
      durationMinutes: body.data.durationMinutes ?? null,
    })
    .returning();
  return res.status(201).json(step);
});

router.put("/steps/:id", async (req, res) => {
  const params = UpdateRecipeStepParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const body = UpdateRecipeStepBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [step] = await db
    .update(recipeStepsTable)
    .set(body.data)
    .where(eq(recipeStepsTable.id, params.data.id))
    .returning();
  if (!step) return res.status(404).json({ error: "Step not found" });
  return res.json(step);
});

router.delete("/steps/:id", async (req, res) => {
  const params = DeleteRecipeStepParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  await db.delete(recipeStepsTable).where(eq(recipeStepsTable.id, params.data.id));
  return res.status(204).send();
});

router.put("/recipes/:id/steps/reorder", async (req, res) => {
  const params = ReorderRecipeStepsParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) return res.status(400).json({ error: "Invalid id" });

  const body = ReorderRecipeStepsBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  // Verify the supplied IDs exactly match the recipe's current step set, so a
  // bad reorder request can't silently leave gaps or move other recipes' steps.
  const existing = await db
    .select({ id: recipeStepsTable.id })
    .from(recipeStepsTable)
    .where(eq(recipeStepsTable.recipeId, params.data.id));
  const existingIds = new Set(existing.map((s) => s.id));
  const submitted = new Set(body.data.stepIds);
  if (existingIds.size !== submitted.size || [...existingIds].some((id) => !submitted.has(id))) {
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
