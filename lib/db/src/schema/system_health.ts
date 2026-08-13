import { pgTable, serial, real, timestamp } from "drizzle-orm/pg-core";

// Periodic snapshots of host system health, sampled independently of the
// live /system/stats endpoint so trend charts can show hours/days of history.
export const systemHealthSamplesTable = pgTable("system_health_samples", {
  id: serial("id").primaryKey(),
  cpuPercent: real("cpu_percent"),
  memoryPercent: real("memory_percent").notNull(),
  diskPercent: real("disk_percent"),
  temperatureCelsius: real("temperature_celsius"),
  sampledAt: timestamp("sampled_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SystemHealthSample = typeof systemHealthSamplesTable.$inferSelect;
