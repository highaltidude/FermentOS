import type { SystemStats } from "@workspace/api-client-react";

export type ResourceStatus = "ok" | "warning" | "critical";

export type ResourceEvaluation = {
  status: ResourceStatus;
  headline: string;
  guidance?: string;
};

export type SystemHealthEvaluation = {
  overall: ResourceStatus;
  cpu: ResourceEvaluation;
  memory: ResourceEvaluation;
  disk: ResourceEvaluation | null;
  temperature: ResourceEvaluation | null;
};

function statusForPercent(percent: number): ResourceStatus {
  if (percent > 85) return "critical";
  if (percent > 60) return "warning";
  return "ok";
}

// Container-limit-aware memory pressure — matches the value the backend
// sampler stores in system_health_samples, so live view and history agree.
export function memoryPressurePercent(stats: SystemStats): number {
  if (stats.isDocker && stats.containerMemoryLimitMB) {
    return Math.round((stats.memory.usedMB / stats.containerMemoryLimitMB) * 100);
  }
  return stats.memory.usedPercent;
}

// Plain-language reading of load average relative to core count, for display
// alongside (not instead of) the raw numbers in the CPU card.
export function describeLoadAverage(stats: SystemStats): string {
  const perCore = stats.loadAvg[0] / stats.cpu.cores;
  return perCore > 1 ? "Higher than usual load" : "Normal load";
}

function evaluateCpu(stats: SystemStats): ResourceEvaluation {
  const status = statusForPercent(stats.cpu.usagePercent ?? 0);
  return {
    status,
    headline: status === "ok" ? "CPU normal" : status === "warning" ? "CPU busy" : "CPU consistently high",
    guidance:
      status === "critical"
        ? "Consistently high CPU can slow sensor logging."
        : status === "warning"
          ? "Busy — normal during active sensor logging."
          : undefined,
  };
}

function evaluateMemory(stats: SystemStats): ResourceEvaluation {
  const status = statusForPercent(memoryPressurePercent(stats));
  return {
    status,
    headline: status === "ok" ? "Memory normal" : status === "warning" ? "Memory getting full" : "Memory nearly full",
    guidance:
      status === "critical" ? "Memory is nearly full, which can cause the app to slow down or restart." : undefined,
  };
}

function evaluateDisk(stats: SystemStats): ResourceEvaluation | null {
  if (!stats.disk) return null;
  const status = statusForPercent(stats.disk.usedPercent);
  return {
    status,
    headline: status === "ok" ? "Disk space normal" : status === "warning" ? "Disk space getting low" : "Disk space almost full",
    guidance:
      status !== "ok" ? "Can prevent new sensor readings and backups from being saved." : undefined,
  };
}

function evaluateTemperature(stats: SystemStats): ResourceEvaluation | null {
  if (stats.temperatureCelsius === null) return null;
  const t = stats.temperatureCelsius;
  const status: ResourceStatus = t >= 75 ? "critical" : t >= 60 ? "warning" : "ok";
  return {
    status,
    headline: status === "ok" ? "Normal" : status === "warning" ? "Running warm" : "Thermal throttle risk",
    guidance:
      status === "critical"
        ? "The Pi may slow down under heat, which can reduce how often sensor readings are logged — worth checking airflow, especially mid-brew."
        : undefined,
  };
}

export function evaluateSystemHealth(stats: SystemStats): SystemHealthEvaluation {
  const cpu = evaluateCpu(stats);
  const memory = evaluateMemory(stats);
  const disk = evaluateDisk(stats);
  const temperature = evaluateTemperature(stats);

  const statuses = [cpu.status, memory.status, disk?.status, temperature?.status].filter(
    (s): s is ResourceStatus => s !== undefined,
  );
  const overall: ResourceStatus = statuses.includes("critical")
    ? "critical"
    : statuses.includes("warning")
      ? "warning"
      : "ok";

  return { overall, cpu, memory, disk, temperature };
}
