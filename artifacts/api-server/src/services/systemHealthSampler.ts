import cron from "node-cron";
import { db, systemHealthSamplesTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { getSystemStats, computeMemoryPressurePercent } from "./systemStats.js";

async function sampleAndStore(): Promise<void> {
  const stats = await getSystemStats();
  await db.insert(systemHealthSamplesTable).values({
    cpuPercent: stats.cpu.usagePercent,
    memoryPercent: computeMemoryPressurePercent(stats),
    diskPercent: stats.disk?.usedPercent ?? null,
    temperatureCelsius: stats.temperatureCelsius,
  });
}

export function startSystemHealthSampler(): void {
  cron.schedule("*/5 * * * *", () => {
    sampleAndStore().catch((e) => logger.error({ e }, "System health sample failed"));
  });
  logger.info("System health sampler started");
}
