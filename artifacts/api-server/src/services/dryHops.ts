import {
  db,
  brewSessionsTable,
  brewSessionStatusLogTable,
  brewAlertStateTable,
  recipeIngredientsTable,
  recipesTable,
  ACTIVE_BREW_STATUSES,
  type BrewSession,
} from "@workspace/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  dryHopSchedule,
  dueDryHopGroups,
  dryHopAlertMessage,
  isDryHopAlertType,
  type DryHopIngredient,
  type DryHopItem,
} from "../lib/dryHopSchedule.js";
import { ingredientsForVariant, resolveSessionVariant } from "../lib/recipeVariants.js";
import { getNotifyConfig } from "./notifications.js";
import { recordFiringAlert, resolveAlert } from "./alertState.js";

/**
 * Dry hop reminders. Sessions do not copy their recipe, so the dry hops are
 * read live from the recipe (for the version being brewed), the same way the
 * boil scheduler reads its additions.
 *
 * Day counting starts from the most recent time the batch entered
 * conditioning, the same status-log entry the dashboard uses for "days in
 * stage". A batch with no such entry has nothing scheduled yet.
 */

async function loadDryHopIngredients(recipeId: number | null, sessionVariant: string | null): Promise<DryHopIngredient[]> {
  if (recipeId == null) return [];
  const [recipe] = await db
    .select({ variants: recipesTable.variants })
    .from(recipesTable)
    .where(eq(recipesTable.id, recipeId));
  const ingredients = await db
    .select({
      id: recipeIngredientsTable.id,
      name: recipeIngredientsTable.name,
      amount: recipeIngredientsTable.amount,
      unit: recipeIngredientsTable.unit,
      use: recipeIngredientsTable.use,
      dryHopDay: recipeIngredientsTable.dryHopDay,
      variants: recipeIngredientsTable.variants,
    })
    .from(recipeIngredientsTable)
    .where(and(eq(recipeIngredientsTable.recipeId, recipeId), eq(recipeIngredientsTable.use, "dry_hop")))
    .orderBy(asc(recipeIngredientsTable.id));
  return ingredientsForVariant(ingredients, resolveSessionVariant(recipe?.variants, sessionVariant));
}

async function conditioningStartedAt(brewSessionId: number): Promise<Date | null> {
  const [entry] = await db
    .select({ changedAt: brewSessionStatusLogTable.changedAt })
    .from(brewSessionStatusLogTable)
    .where(and(
      eq(brewSessionStatusLogTable.brewSessionId, brewSessionId),
      eq(brewSessionStatusLogTable.status, "conditioning"),
    ))
    .orderBy(desc(brewSessionStatusLogTable.changedAt))
    .limit(1);
  return entry?.changedAt ?? null;
}

type SessionFields = Pick<BrewSession, "id" | "recipeId" | "recipeVariant" | "status" | "dryHopAddedIds">;

export async function scheduleForSession(session: SessionFields, now = Date.now()): Promise<DryHopItem[]> {
  const ingredients = await loadDryHopIngredients(session.recipeId, session.recipeVariant);
  if (ingredients.length === 0) return [];
  return dryHopSchedule(ingredients, {
    conditioningStartedAt: await conditioningStartedAt(session.id),
    inConditioning: session.status === "conditioning",
    addedIds: session.dryHopAddedIds,
  }, now);
}

/** Null when the session does not exist. */
export async function loadDryHopSchedule(brewSessionId: number): Promise<DryHopItem[] | null> {
  const [session] = await db.select().from(brewSessionsTable).where(eq(brewSessionsTable.id, brewSessionId));
  return session ? scheduleForSession(session) : null;
}

/**
 * Run from the alert monitor's 5-minute tick. Each due day notifies at once and
 * then every dryHopRepeatHours until all of that day's additions are marked
 * added — or the batch leaves conditioning — at which point its row resolves.
 */
export async function runDryHopCheck(): Promise<void> {
  const config = await getNotifyConfig();
  if (config.channel === "none" || !config.dryHopAlerts) return;

  const now = new Date();
  const repeatMs = config.dryHopRepeatHours * 60 * 60 * 1000;

  const sessions = await db
    .select({
      id: brewSessionsTable.id,
      recipeId: brewSessionsTable.recipeId,
      recipeName: brewSessionsTable.recipeName,
      recipeVariant: brewSessionsTable.recipeVariant,
      status: brewSessionsTable.status,
      dryHopAddedIds: brewSessionsTable.dryHopAddedIds,
    })
    .from(brewSessionsTable)
    .where(inArray(brewSessionsTable.status, [...ACTIVE_BREW_STATUSES]));

  for (const session of sessions) {
    try {
      const groups = session.status === "conditioning"
        ? dueDryHopGroups(await scheduleForSession(session, now.getTime()))
        : [];

      const existing = (await db
        .select()
        .from(brewAlertStateTable)
        .where(eq(brewAlertStateTable.brewSessionId, session.id)))
        .filter((r) => isDryHopAlertType(r.alertType));
      const byType = new Map(existing.map((r) => [r.alertType, r]));

      for (const group of groups) {
        await recordFiringAlert({
          brewSessionId: session.id,
          alertType: group.alertType,
          prior: byType.get(group.alertType),
          now,
          repeatMs,
          oncePerBrew: false,
          debounced: true,
          payload: {
            title: `${session.recipeName}: Time to dry hop`,
            body: dryHopAlertMessage(group),
            priority: "high",
            meta: {
              brewSessionId: session.id,
              recipeName: session.recipeName,
              alertType: group.alertType,
              event: "dry_hop_due",
              day: group.day,
            },
          },
          config,
        });
      }

      const firing = new Set(groups.map((g) => g.alertType));
      for (const row of existing) {
        if (!firing.has(row.alertType)) await resolveAlert(row, now);
      }
    } catch (e) {
      // One bad brew must not stop the others being checked.
      logger.error({ e, brewSessionId: session.id }, "Dry hop check failed for brew session");
    }
  }
}
