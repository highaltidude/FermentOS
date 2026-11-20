import cron from "node-cron";
import { db, systemHealthSamplesTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { cpuPercentBetween, type CpuTimes } from "../lib/cpuUsage.js";
import { getSystemStats, computeMemoryPressurePercent, readProcStat } from "./systemStats.js";

/**
 * CPU counters at the previous sample. The stored CPU figure is the average
 * over the whole interval since then, not the 400 ms snapshot getSystemStats
 * takes: this job fires on the same five-minute boundary as the alert monitor,
 * flow tick and device poll, so a snapshot only ever caught the app's own
 * scheduled burst and charted a near-idle Pi as 30–60% busy.
 */
let previousCpu: CpuTimes | null = readProcStat();

async function sampleAndStore(): Promise<void> {
  const stats = await getSystemStats();
  const nowCpu = readProcStat();
  const intervalCpu = previousCpu && nowCpu ? cpuPercentBetween(previousCpu, nowCpu) : null;
  previousCpu = nowCpu;
  await db.insert(systemHealthSamplesTable).values({
    cpuPercent: intervalCpu ?? stats.cpu.usagePercent,
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
