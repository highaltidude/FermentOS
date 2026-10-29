import express, { Router, type RequestHandler, type Response } from "express";
import { eq, ilike, or, and, avg, count, sql, asc, inArray, ne } from "drizzle-orm";
import { db, recipesTable, recipeIngredientsTable, recipeStepsTable, brewSessionsTable, flowRecipesTable, flowsTable } from "@workspace/db";
import {
  CreateRecipeBody,
  UpdateRecipeBody,
  ListRecipesQueryParams,
  AddRecipeIngredientBody,
  UpdateRecipeIngredientBody,
  AddRecipeStepBody,
  UpdateRecipeStepBody,
  ReorderRecipeStepsBody,
  ImportRecipeBody,
  ForkRecipeBody,
} from "@workspace/api-zod";
import { parseIdParam } from "../lib/http";
import { parseMorebeerKitSheet } from "../lib/morebeerKitSheet";
import { normalizeIngredientVariants, normalizeRecipeVariants } from "../lib/recipeVariants";
import { extractPdfTextItems } from "../services/pdfText";
import { reloadFlows } from "../services/flowEngine";
import { buildRecipeSnapshot, diffRecipeSnapshots, nextVersionName, recipeBrewHistory, recipeFamily } from "../lib/recipeHistory";

const router = Router();

/** SQL avg() comes back as a numeric string; round it to one decimal. */
function roundScore(avgScore: string | null | undefined): number | null {
  return avgScore != null ? Math.round(Number(avgScore) * 10) / 10 : null;
}

function recipeIngredients(recipeId: number) {
  return db
    .select()
    .from(recipeIngredientsTable)
    .where(eq(recipeIngredientsTable.recipeId, recipeId))
    // Insertion order, so a list stays in the order it was written or imported.
    .orderBy(asc(recipeIngredientsTable.id));
}

/**
 * An ingredient's version list, checked against its recipe. Sends the error
 * response itself and returns undefined when it does not fit.
 */
async function ingredientVariantsFor(res: Response, recipeId: number, variants: readonly string[]) {
  const [recipe] = await db
    .select({ variants: recipesTable.variants })
    .from(recipesTable)
    .where(eq(recipesTable.id, recipeId));
  if (!recipe) {
    res.status(404).json({ error: "Recipe not found" });
    return undefined;
  }
  const checked = normalizeIngredientVariants(recipe.variants, variants);
  if (!checked.ok) {
    res.status(400).json({ error: "That version is not one this recipe has" });
    return undefined;
  }
  return checked;
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

// ── Import ────────────────────────────────────────────────────────────────

router.post("/recipes/import", async (req, res) => {
  const body = ImportRecipeBody.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const variants = normalizeRecipeVariants(body.data.variants);
  const ingredients: (typeof body.data.ingredients)[number][] = [];
  for (const ingredient of body.data.ingredients) {
    const checked = normalizeIngredientVariants(variants, ingredient.variants);
    if (!checked.ok) {
      return res.status(400).json({ error: `"${ingredient.name}" is listed for a version this recipe does not have` });
    }
    ingredients.push({ ...ingredient, variants: checked.variants });
  }

  // One transaction: a recipe either arrives whole or not at all.
  const recipe = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(recipesTable)
      .values({ ...body.data.recipe, variants })
      .returning();
    if (ingredients.length > 0) {
      await tx.insert(recipeIngredientsTable).values(ingredients.map((i) => ({ ...i, recipeId: created!.id })));
    }
    const steps = body.data.steps ?? [];
    if (steps.length > 0) {
      await tx.insert(recipeStepsTable).values(
        steps.map((step, index) => ({
          recipeId: created!.id,
          position: step.position ?? index + 1,
          body: step.body,
          phase: step.phase ?? null,
          durationMinutes: step.durationMinutes ?? null,
        })),
      );
    }
    return created!;
  });

  return res.status(201).json({ ...recipe, avgScore: null, ratedBatchCount: 0, batchCount: 0 });
});

// ── Fork ──────────────────────────────────────────────────────────────────

router.post("/recipes/:id/fork", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;
  const body = ForkRecipeBody.safeParse(req.body ?? {});
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const [parent] = await db.select().from(recipesTable).where(eq(recipesTable.id, id));
  if (!parent) return res.status(404).json({ error: "Recipe not found" });

  const { id: _id, createdAt: _created, updatedAt: _updated, ...fields } = parent;
  const name = body.data.name?.trim() || nextVersionName(parent.name);

  // One transaction, like import: the fork arrives whole or not at all.
  const { fork, linkedFlows } = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(recipesTable)
      .values({ ...fields, name, parentRecipeId: id })
      .returning();
    const forkId = created!.id;
    const [ingredients, steps, links] = await Promise.all([
      tx.select().from(recipeIngredientsTable).where(eq(recipeIngredientsTable.recipeId, id)).orderBy(asc(recipeIngredientsTable.id)),
      tx.select().from(recipeStepsTable).where(eq(recipeStepsTable.recipeId, id)),
      tx.select().from(flowRecipesTable).where(eq(flowRecipesTable.recipeId, id)),
    ]);
    if (ingredients.length > 0) {
      await tx.insert(recipeIngredientsTable).values(ingredients.map(({ id: _i, ...i }) => ({ ...i, recipeId: forkId })));
    }
    if (steps.length > 0) {
      await tx.insert(recipeStepsTable).values(steps.map(({ id: _s, ...s }) => ({ ...s, recipeId: forkId })));
    }
    // A fork is the same beer, so it keeps the parent's automation.
    if (links.length > 0) {
      await tx.insert(flowRecipesTable).values(links.map((l) => ({ flowId: l.flowId, recipeId: forkId })));
    }
    return { fork: created!, linkedFlows: links.length };
  });

  if (linkedFlows > 0) {
    await reloadFlows().catch((err) => req.log.error({ err }, "Failed to reload flows after fork"));
  }
  req.log.info({ recipeId: id, forkId: fork.id }, "Recipe forked");
  return res.status(201).json({ ...fork, avgScore: null, ratedBatchCount: 0, batchCount: 0 });
});

// ── Version history ───────────────────────────────────────────────────────

router.get("/recipes/:id/history", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const [recipe] = await db.select().from(recipesTable).where(eq(recipesTable.id, id));
  if (!recipe) return res.status(404).json({ error: "Recipe not found" });

  const [brews, ingredients, steps] = await Promise.all([
    db
      .select({
        id: brewSessionsTable.id,
        brewDate: brewSessionsTable.brewDate,
        recipeVariant: brewSessionsTable.recipeVariant,
        overallScore: brewSessionsTable.overallScore,
        recipeSnapshot: brewSessionsTable.recipeSnapshot,
      })
      .from(brewSessionsTable)
      .where(eq(brewSessionsTable.recipeId, id)),
    recipeIngredients(id),
    orderedRecipeSteps(id),
  ]);

  const { entries, latestSnapshot } = recipeBrewHistory(brews.map((b) => ({ ...b, brewDate: String(b.brewDate) })));
  const sinceLastBrew = latestSnapshot
    ? diffRecipeSnapshots(latestSnapshot, buildRecipeSnapshot(recipe, ingredients, steps, latestSnapshot.variant))
    : null;
  return res.json({ brews: entries, sinceLastBrew });
});

const KIT_SHEET_ERRORS = {
  no_text: "This PDF has no readable text — it looks like a scan. Download the kit sheet from MoreBeer rather than scanning the printed one.",
  unrecognized_sheet: "This does not look like a MoreBeer kit sheet: no ingredient lists were found in it.",
  unreadable_pdf: "This PDF could not be opened. It may be damaged or password-protected.",
} as const;

const KIT_SHEET_MAX_MB = 10;
const pdfBody = express.raw({ type: "application/pdf", limit: `${KIT_SHEET_MAX_MB}mb` });

// The error handler hides every message in production, so an oversized upload
// would otherwise come back as "Internal server error".
const readPdfBody: RequestHandler = (req, res, next) => {
  pdfBody(req, res, (err?: unknown) => {
    if (!err) return next();
    if ((err as { type?: string }).type === "entity.too.large") {
      res.status(400).json({ error: `That file is too large. Kit sheets are a few megabytes; the limit is ${KIT_SHEET_MAX_MB} MB.` });
      return;
    }
    next(err);
  });
};

// Reads the sheet and returns a draft. Nothing is saved: the draft is reviewed
// in the browser and comes back through POST /recipes/import.
router.post("/recipes/import/morebeer/parse", readPdfBody, async (req, res) => {
  const pdf: unknown = req.body;
  if (!Buffer.isBuffer(pdf) || !pdf.subarray(0, 1024).includes("%PDF-")) {
    return res.status(400).json({ error: "Upload a PDF file." });
  }

  let pages;
  try {
    pages = await extractPdfTextItems(pdf);
  } catch (err) {
    req.log.warn({ err }, "Kit sheet PDF could not be read");
    return res.status(422).json({ error: KIT_SHEET_ERRORS.unreadable_pdf, code: "unreadable_pdf" });
  }

  const result = parseMorebeerKitSheet(pages);
  if (!result.ok) {
    return res.status(422).json({ error: KIT_SHEET_ERRORS[result.code], code: result.code });
  }
  return res.json(result.draft);
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
    ...(await recipeLineage(recipe.id, recipe.parentRecipeId)),
  });
});

/** Where a recipe sits among its forks, and how the whole family has brewed. */
async function recipeLineage(id: number, parentRecipeId: number | null) {
  const all = await db
    .select({ id: recipesTable.id, name: recipesTable.name, parentRecipeId: recipesTable.parentRecipeId })
    .from(recipesTable);
  const byId = new Map(all.map((r) => [r.id, r]));
  const parentRow = parentRecipeId != null ? byId.get(parentRecipeId) : undefined;
  const forks = all.filter((r) => r.parentRecipeId === id).map(({ id: forkId, name }) => ({ id: forkId, name }));

  const family = recipeFamily(all, id);
  let familyStats = null;
  if (family.length > 1) {
    const [s] = await db
      .select({
        avgScore: avg(brewSessionsTable.overallScore),
        ratedBatchCount: count(brewSessionsTable.overallScore),
        batchCount: count(brewSessionsTable.id),
      })
      .from(brewSessionsTable)
      .where(inArray(brewSessionsTable.recipeId, family));
    familyStats = {
      recipeCount: family.length,
      avgScore: roundScore(s?.avgScore),
      ratedBatchCount: s?.ratedBatchCount ?? 0,
      batchCount: s?.batchCount ?? 0,
    };
  }
  return {
    parent: parentRow ? { id: parentRow.id, name: parentRow.name } : null,
    forks,
    familyStats,
  };
}

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

  // Forks move up to the deleted recipe's own parent, so a family keeps its
  // shape when a middle version goes. Its brews keep their recipe snapshots.
  const linkedFlows = await db.transaction(async (tx) => {
    const [gone] = await tx
      .select({ name: recipesTable.name, parentRecipeId: recipesTable.parentRecipeId })
      .from(recipesTable)
      .where(eq(recipesTable.id, id));
    if (!gone) return 0;
    await tx
      .update(recipesTable)
      .set({ parentRecipeId: gone.parentRecipeId })
      .where(eq(recipesTable.parentRecipeId, id));

    // A flow with no recipe links runs for any brew, so one that loses its
    // only recipe here is switched off rather than left to follow every brew.
    const flowIds = (await tx
      .select({ flowId: flowRecipesTable.flowId })
      .from(flowRecipesTable)
      .where(eq(flowRecipesTable.recipeId, id))).map((l) => l.flowId);
    if (flowIds.length > 0) {
      const stillLinked = new Set((await tx
        .select({ flowId: flowRecipesTable.flowId })
        .from(flowRecipesTable)
        .where(and(inArray(flowRecipesTable.flowId, flowIds), ne(flowRecipesTable.recipeId, id)))).map((l) => l.flowId));
      const orphaned = flowIds.filter((f) => !stillLinked.has(f));
      if (orphaned.length > 0) {
        await tx
          .update(flowsTable)
          .set({ enabled: false, lastError: `Turned off: its only recipe, ${gone.name}, was deleted` })
          .where(inArray(flowsTable.id, orphaned));
      }
    }
    await tx.delete(recipesTable).where(eq(recipesTable.id, id));
    return flowIds.length;
  });
  if (linkedFlows > 0) {
    await reloadFlows().catch((err) => req.log.error({ err }, "Failed to reload flows after recipe delete"));
  }
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

  let variants = null;
  if (body.data.variants?.length) {
    const checked = await ingredientVariantsFor(res, id, body.data.variants);
    if (!checked) return;
    variants = checked.variants;
  }

  const [ingredient] = await db
    .insert(recipeIngredientsTable)
    .values({ ...body.data, variants, recipeId: id })
    .returning();
  return res.status(201).json(ingredient);
});

router.put("/ingredients/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;

  const body = UpdateRecipeIngredientBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const update = { ...body.data };
  if (update.variants?.length) {
    const [existing] = await db
      .select({ recipeId: recipeIngredientsTable.recipeId })
      .from(recipeIngredientsTable)
      .where(eq(recipeIngredientsTable.id, id));
    if (!existing) return res.status(404).json({ error: "Ingredient not found" });
    const checked = await ingredientVariantsFor(res, existing.recipeId, update.variants);
    if (!checked) return;
    update.variants = checked.variants;
  } else if (update.variants) {
    // An empty list means "every version", which is stored as null.
    update.variants = null;
  }

  const [ingredient] = await db
    .update(recipeIngredientsTable)
    .set(update)
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
