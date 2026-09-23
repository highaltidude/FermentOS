import cron from "node-cron";
import { eq, lt, and, isNull, or, inArray } from "drizzle-orm";
import {
  db,
  sensorReadingsTable,
  fermentationReadingsTable,
  brewSessionsTable,
  systemHealthSamplesTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import { getConfigValue, setConfigValue } from "./appConfig.js";

// Fixed retention window for system health history samples, independent of
// the user-configurable reading_retention_days setting above.
const SYSTEM_HEALTH_RETENTION_DAYS = 14;

const CONFIG_KEY = "reading_retention_days";

export async function getRetentionDays(): Promise<number | null> {
  const value = await getConfigValue(CONFIG_KEY);
  if (!value) return null;
  const days = parseInt(value, 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  return days;
}

export async function setRetentionDays(days: number | null): Promise<void> {
  const value = days == null || days <= 0 ? "0" : String(days);
  await setConfigValue(CONFIG_KEY, value);
}

async function runRetentionCleanup(): Promise<{ deletedFermentation: number; deletedSensor: number }> {
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

async function pruneSystemHealthSamples(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - SYSTEM_HEALTH_RETENTION_DAYS * 86_400_000);
  const result = await db
    .delete(systemHealthSamplesTable)
    .where(lt(systemHealthSamplesTable.sampledAt, cutoff))
    .returning({ id: systemHealthSamplesTable.id });

  logger.info({ cutoff, deleted: result.length }, "System health sample retention cleanup complete");
  return { deleted: result.length };
}

/** Nightly 3am cleanup of old readings and system health samples. */
export function startRetentionCleanup(): void {
  cron.schedule("0 3 * * *", () => {
    runRetentionCleanup()
      .then((result) => logger.info(result, "Nightly reading retention cleanup"))
      .catch((e) => logger.error({ e }, "Reading retention cleanup error"));
    pruneSystemHealthSamples()
      .then((result) => logger.info(result, "Nightly system health sample cleanup"))
      .catch((e) => logger.error({ e }, "System health sample cleanup error"));
  });
}
