import { eq, lt, and, isNull, or, inArray } from "drizzle-orm";
import { db, appConfigTable, sensorReadingsTable, fermentationReadingsTable, brewSessionsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

export const CONFIG_KEY = "reading_retention_days";

export async function getRetentionDays(): Promise<number | null> {
  const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, CONFIG_KEY));
  if (!row?.value) return null;
  const days = parseInt(row.value, 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  return days;
}

export async function setRetentionDays(days: number | null): Promise<void> {
  const value = days == null || days <= 0 ? "0" : String(days);
  await db
    .insert(appConfigTable)
    .values({ key: CONFIG_KEY, value })
    .onConflictDoUpdate({ target: appConfigTable.key, set: { value, updatedAt: new Date() } });
}

export async function runRetentionCleanup(): Promise<{ deletedFermentation: number; deletedSensor: number }> {
  const days = await getRetentionDays();
  if (!days) return { deletedFermentation: 0, deletedSensor: 0 };

  const cutoff = new Date(Date.now() - days * 86_400_000);

  // Find all packaged brew session IDs
  const packagedSessions = await db
    .select({ id: brewSessionsTable.id })
    .from(brewSessionsTable)
    .where(eq(brewSessionsTable.status, "packaged"));
  const packagedIds = packagedSessions.map((r) => r.id);

  // Delete fermentation readings older than cutoff that belong to packaged sessions
  let deletedFermentation = 0;
  if (packagedIds.length > 0) {
    const fermentResult = await db
      .delete(fermentationReadingsTable)
      .where(
        and(
          lt(fermentationReadingsTable.readingAt, cutoff),
          inArray(fermentationReadingsTable.brewSessionId, packagedIds),
        ),
      )
      .returning({ id: fermentationReadingsTable.id });
    deletedFermentation = fermentResult.length;
  }

  // Delete sensor readings older than cutoff where brewSessionId is null or belongs to a packaged session
  let deletedSensor = 0;
  const sensorResult = await db
    .delete(sensorReadingsTable)
    .where(
      and(
        lt(sensorReadingsTable.receivedAt, cutoff),
        packagedIds.length > 0
          ? or(isNull(sensorReadingsTable.brewSessionId), inArray(sensorReadingsTable.brewSessionId, packagedIds))
          : isNull(sensorReadingsTable.brewSessionId),
      ),
    )
    .returning({ id: sensorReadingsTable.id });
  deletedSensor = sensorResult.length;

  logger.info({ cutoff, deletedFermentation, deletedSensor }, "Reading retention cleanup complete");
  return { deletedFermentation, deletedSensor };
}
