import { db, brewSessionStatusLogTable, type brewStatusEnum } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

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
