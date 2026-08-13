import { Cpu, MemoryStick, HardDrive, Network, Thermometer, Clock, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { describeLoadAverage, memoryPressurePercent } from "@/lib/systemHealth";
import { OverallHealthSummary } from "./OverallHealthSummary";
import { ResourceStatusCard } from "./ResourceStatusCard";
import { formatBytes, formatUptime } from "./formatters";
import { HealthHistoryChart } from "./HealthHistoryChart";

export function SystemHealthPanel({ onGoToBackups }: { onGoToBackups: () => void }) {
  const { stats, status, isLoading, error, lastUpdated } = useSystemHealth({ refetchInterval: 5000 });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || !stats || !status) {
    return <p className="text-sm text-muted-foreground text-center py-4">Could not load system stats.</p>;
  }

  const primaryNet = stats.network[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <OverallHealthSummary evaluation={status} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ResourceStatusCard icon={<Cpu className="w-3.5 h-3.5" />} label="CPU" evaluation={status.cpu}>
          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-lg font-bold text-foreground">{stats.cpu.usagePercent ?? "—"}%</span>
              <span className="text-xs text-muted-foreground">{stats.cpu.cores} cores</span>
            </div>
            <Progress percent={stats.cpu.usagePercent ?? 0} />
            <div className="text-xs text-muted-foreground truncate" title={stats.cpu.model}>
              {stats.cpu.model}
            </div>
            <div className="text-xs text-muted-foreground">
              {describeLoadAverage(stats)}
              <span className="text-muted-foreground/70"> · {stats.loadAvg.map((v) => v.toFixed(2)).join(" / ")}</span>
            </div>
          </div>
        </ResourceStatusCard>

        {status.temperature && stats.temperatureCelsius !== null && (
          <ResourceStatusCard icon={<Thermometer className="w-3.5 h-3.5" />} label="Temperature" evaluation={status.temperature}>
            <div className="space-y-1">
              <div
                className={`text-lg font-bold ${
                  status.temperature.status === "critical"
                    ? "text-destructive"
                    : status.temperature.status === "warning"
                      ? "text-amber-500"
                      : "text-foreground"
                }`}
              >
                {stats.temperatureCelsius.toFixed(1)}°C
              </div>
              <Progress percent={(stats.temperatureCelsius / 85) * 100} color="bg-green-500" />
              <div className="text-xs text-muted-foreground">{status.temperature.headline}</div>
            </div>
          </ResourceStatusCard>
        )}

        <ResourceStatusCard icon={<MemoryStick className="w-3.5 h-3.5" />} label="Memory" evaluation={status.memory}>
          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-lg font-bold text-foreground">{stats.memory.usedPercent}%</span>
              <span className="text-xs text-muted-foreground">
                {stats.memory.usedMB} / {stats.memory.totalMB} MB
              </span>
            </div>
            <Progress percent={memoryPressurePercent(stats)} />
            <div className="text-xs text-muted-foreground">{stats.memory.freeMB} MB free</div>
            {stats.isDocker && stats.containerMemoryLimitMB !== null && (
              <div className="text-xs text-muted-foreground">Container limit: {stats.containerMemoryLimitMB} MB</div>
            )}
          </div>
        </ResourceStatusCard>

        {status.disk && stats.disk && (
          <ResourceStatusCard icon={<HardDrive className="w-3.5 h-3.5" />} label="Disk (/)" evaluation={status.disk}>
            <div className="space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-lg font-bold text-foreground">{stats.disk.usedPercent}%</span>
                <span className="text-xs text-muted-foreground">
                  {stats.disk.usedGB} / {stats.disk.totalGB} GB
                </span>
              </div>
              <Progress percent={stats.disk.usedPercent} />
              <div className="text-xs text-muted-foreground">{stats.disk.freeGB} GB free</div>
              {status.disk.status !== "ok" && (
                <button type="button" onClick={onGoToBackups} className="text-xs text-primary hover:underline">
                  Review backups →
                </button>
              )}
            </div>
          </ResourceStatusCard>
        )}

        <ResourceStatusCard icon={<Network className="w-3.5 h-3.5" />} label={primaryNet ? `Network (${primaryNet.name})` : "Network"}>
          {primaryNet ? (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">↓ RX</div>
                  <div className="font-semibold text-foreground">{formatBytes(primaryNet.rxBytesPerSec)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">↑ TX</div>
                  <div className="font-semibold text-foreground">{formatBytes(primaryNet.txBytesPerSec)}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground pt-0.5">
                Total RX: {(primaryNet.rxBytes / 1e9).toFixed(2)} GB &nbsp;·&nbsp; TX: {(primaryNet.txBytes / 1e9).toFixed(2)} GB
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No network interface data</div>
          )}
        </ResourceStatusCard>
      </div>

      <HealthHistoryChart />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Uptime: {formatUptime(stats.uptime)} · Hostname: {stats.hostname}
        </div>
        <div className="flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Updating…"} · auto-refreshes every 5s
        </div>
      </div>
    </div>
  );
}
