import { db, brewSessionStatusLogTable, brewSessionsTable, recipesTable, type brewStatusEnum } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { getConfigValue } from "./appConfig.js";

type BrewStatus = (typeof brewStatusEnum)[number];

/**
 * When a brew most recently entered a stage, from its stage history: the same
 * status-log entry the dashboard counts "days in stage" from, written by both
 * the brew page and auto-advance. Null if the brew never had that stage logged.
 */
export async function stageStartedAt(brewSessionId: number, status: BrewStatus): Promise<Date | null> {
  const [entry] = await db
    .select({ changedAt: brewSessionStatusLogTable.changedAt })
    .from(brewSessionStatusLogTable)
    .where(and(eq(brewSessionStatusLogTable.brewSessionId, brewSessionId), eq(brewSessionStatusLogTable.status, status)))
    .orderBy(desc(brewSessionStatusLogTable.changedAt))
    .limit(1);
  return entry?.changedAt ?? null;
}

export type BrewSnapshot = {
  id: number;
  name: string;
  recipeId: number | null;
  status: BrewStatus;
  stageStartedAt: Date;
  /** Ideal temperatures in °C: the brew's own, else its recipe's. */
  fermentIdealC: number | null;
  conditionIdealC: number | null;
};

/**
 * What the flow engine needs to know about a brew. Ideal temperatures fall
 * back to the recipe the same way temperature alerts do, and are stored in the
 * ferment_temp_unit setting's unit, so they're converted to °C here.
 */
export async function brewSnapshot(brewSessionId: number): Promise<BrewSnapshot | null> {
  const [session] = await db.select().from(brewSessionsTable).where(eq(brewSessionsTable.id, brewSessionId));
  if (!session) return null;
  let fermentIdeal = session.fermentTempIdeal;
  let conditionIdeal = session.conditionTempIdeal;
  if ((fermentIdeal == null || conditionIdeal == null) && session.recipeId) {
    const [recipe] = await db
      .select({ fermentTempIdeal: recipesTable.fermentTempIdeal, conditionTempIdeal: recipesTable.conditionTempIdeal })
      .from(recipesTable)
      .where(eq(recipesTable.id, session.recipeId));
    fermentIdeal = fermentIdeal ?? recipe?.fermentTempIdeal ?? null;
    conditionIdeal = conditionIdeal ?? recipe?.conditionTempIdeal ?? null;
  }
  const fahrenheit = (await getConfigValue("ferment_temp_unit")) !== "C";
  const toC = (v: number | null) => (v == null ? null : fahrenheit ? (v - 32) * 5 / 9 : v);
  return {
    id: session.id,
    name: session.recipeName,
    recipeId: session.recipeId,
    status: session.status,
    // Brews from before stage history was kept have no log entry; their last
    // edit is the best guess at when the stage began.
    stageStartedAt: (await stageStartedAt(session.id, session.status)) ?? session.updatedAt,
    fermentIdealC: toC(fermentIdeal),
    conditionIdealC: toC(conditionIdeal),
  };
}
