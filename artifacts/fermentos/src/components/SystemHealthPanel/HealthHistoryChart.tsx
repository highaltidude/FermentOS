import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useGetSystemHealthHistory, getGetSystemHealthHistoryQueryKey } from "@workspace/api-client-react";

const WINDOWS = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 24 * 7 },
] as const;

function formatTick(iso: string, hours: number) {
  const d = new Date(iso);
  return hours <= 24
    ? d.toLocaleTimeString("en-US", { hour: "numeric" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function HealthHistoryChart() {
  const [hours, setHours] = useState<number>(24);
  const { data: samples } = useGetSystemHealthHistory(
    { hours },
    { query: { refetchInterval: 5 * 60 * 1000, queryKey: getGetSystemHealthHistoryQueryKey({ hours }) } },
  );

  const chartData = (samples ?? []).map((s) => ({
    t: formatTick(s.sampledAt, hours),
    cpu: s.cpuPercent,
    memory: s.memoryPercent,
    disk: s.diskPercent,
    temperature: s.temperatureCelsius,
  }));

  const hasDisk = chartData.some((d) => d.disk != null);
  const hasTemp = chartData.some((d) => d.temperature != null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Trends</p>
        <div className="flex items-center gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.hours}
              type="button"
              onClick={() => setHours(w.hours)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                hours === w.hours
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {chartData.length < 2 ? (
        <p className="text-xs text-muted-foreground py-2">Not enough history yet — check back in a few minutes.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="border border-border rounded-lg p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">CPU &amp; Memory</p>
            <ResponsiveContainer width="100%" height={110}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis dataKey="t" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} unit="%" width={32} />
                <Tooltip
                  labelStyle={{ fontSize: 10 }}
                  contentStyle={{ fontSize: 10 }}
                  formatter={(v: number, n: string) => [`${v.toFixed(0)}%`, n === "cpu" ? "CPU" : "Memory"]}
                />
                <Line type="monotone" dataKey="cpu" stroke="#2563eb" strokeWidth={1.5} dot={false} connectNulls />
                <Line type="monotone" dataKey="memory" stroke="#d97706" strokeWidth={1.5} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="border border-border rounded-lg p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Disk &amp; Temperature</p>
            {hasDisk || hasTemp ? (
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="t" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  {hasDisk && <YAxis yAxisId="disk" domain={[0, 100]} tick={{ fontSize: 9 }} unit="%" width={32} />}
                  {hasTemp && (
                    <YAxis yAxisId="temp" orientation="right" domain={["auto", "auto"]} tick={{ fontSize: 9 }} unit="°" width={30} />
                  )}
                  <Tooltip
                    labelStyle={{ fontSize: 10 }}
                    contentStyle={{ fontSize: 10 }}
                    formatter={(v: number, n: string) => (n === "disk" ? [`${v.toFixed(0)}%`, "Disk"] : [`${v.toFixed(1)}°`, "Temp"])}
                  />
                  {hasDisk && <Line yAxisId="disk" type="monotone" dataKey="disk" stroke="#7c3aed" strokeWidth={1.5} dot={false} connectNulls />}
                  {hasTemp && (
                    <Line yAxisId="temp" type="monotone" dataKey="temperature" stroke="#dc2626" strokeWidth={1.5} dot={false} connectNulls />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">Not available on this host</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
