import { useState, useEffect, useMemo, Fragment } from "react";
import { ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useListISpindelDeviceReadings } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { batteryClass, connectionDotClass, formatShortDateTime } from "./ispindelFormat";

export function ISpindelDeviceDetail({
  deviceId, device, onBack, brewSessions,
}: {
  deviceId: number; device: any; onBack: () => void; brewSessions: any[];
}) {
  const [filterPreset, setFilterPreset] = useState<"24h" | "7d" | "30d" | "all" | "brew">("24h");
  const [filterBrewId, setFilterBrewId] = useState<number | null>(null);
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const LIMIT = 50;

  const startDate = useMemo(() => {
    const now = Date.now();
    if (filterPreset === "24h") return new Date(now - 86_400_000).toISOString();
    if (filterPreset === "7d") return new Date(now - 7 * 86_400_000).toISOString();
    if (filterPreset === "30d") return new Date(now - 30 * 86_400_000).toISOString();
    return undefined;
  }, [filterPreset]);

  const tableParams = useMemo(() => ({
    limit: LIMIT, offset, sort,
    ...(startDate ? { start: startDate } : {}),
    ...(filterPreset === "brew" && filterBrewId ? { brewId: filterBrewId } : {}),
  }), [offset, sort, startDate, filterPreset, filterBrewId]);

  const chartParams = useMemo(() => ({
    limit: 200, offset: 0, sort: "asc" as const,
    ...(startDate ? { start: startDate } : {}),
    ...(filterPreset === "brew" && filterBrewId ? { brewId: filterBrewId } : {}),
  }), [startDate, filterPreset, filterBrewId]);

  const { data: page, isLoading } = useListISpindelDeviceReadings(deviceId, tableParams);
  const { data: chartPage } = useListISpindelDeviceReadings(deviceId, chartParams);

  useEffect(() => { setOffset(0); }, [filterPreset, filterBrewId, sort]);

  const readings = page?.readings ?? [];
  const total = page?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);
  const currentPage = Math.floor(offset / LIMIT) + 1;

  const chartData = useMemo(() => (chartPage?.readings ?? []).map((r: any) => ({
    t: formatShortDateTime(r.receivedAt),
    gravity: r.gravity != null ? Number(r.gravity) : null,
    temp: r.temperature != null ? Number(r.temperature) : null,
    battery: r.battery != null ? Number(r.battery) : null,
    batteryPct: r.batteryPercentEstimate != null ? Number(r.batteryPercentEstimate) : null,
  })), [chartPage]);

  const brewName = (id: number | null) =>
    id ? (brewSessions as any[]).find((s: any) => s.id === id)?.recipeName ?? `Brew #${id}` : null;

  const connDot = connectionDotClass(device.connectionStatus);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />Back
        </button>
        <span className="text-muted-foreground/50">·</span>
        <span className={`w-2 h-2 rounded-full shrink-0 ${connDot}`} />
        <span className="text-sm font-semibold">{device.device.deviceName}</span>
        <span className="text-xs text-muted-foreground font-mono">· {device.device.deviceKey}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Total Readings", value: page ? String(total) : "…" },
          { label: "Last Seen", value: device.device.lastSeenAt ? formatShortDateTime(device.device.lastSeenAt) : "Never" },
          { label: "Status", value: device.connectionStatus, extra: device.connectionStatus === "connected" ? "text-green-600 dark:text-green-400" : device.connectionStatus === "warning" ? "text-amber-600 dark:text-amber-400" : device.connectionStatus === "offline" ? "text-destructive" : "" },
          { label: "Assigned Brew", value: device.assignedBrewName ?? "Unassigned" },
        ].map(({ label, value, extra }) => (
          <div key={label} className="bg-muted/30 rounded-lg px-3 py-2 min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-xs font-semibold truncate capitalize ${extra ?? ""}`}>{value}</p>
          </div>
        ))}
      </div>

      {device.latestReading && (
        <div className="bg-muted/20 border border-border rounded-lg px-3 py-2">
          <p className="text-xs text-muted-foreground mb-1.5">
            Latest — {formatShortDateTime(device.latestReading.receivedAt)}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
            {device.latestReading.gravity != null && <span>SG <strong className="text-blue-700 dark:text-blue-400">{Number(device.latestReading.gravity).toFixed(3)}</strong></span>}
            {device.latestReading.temperature != null && <span>Temp <strong className="text-amber-700 dark:text-amber-400">{Number(device.latestReading.temperature).toFixed(1)}{device.latestReading.temperatureUnit === "F" ? "°F" : "°C"}</strong></span>}
            {device.latestReading.battery != null && (
              <span className={batteryClass(device.latestReading.batteryPercentEstimate)}>
                🔋 <strong>{Number(device.latestReading.battery).toFixed(2)}V</strong>
                {device.latestReading.batteryPercentEstimate != null && <span className="font-normal text-muted-foreground"> (~{Math.round(device.latestReading.batteryPercentEstimate)}%)</span>}
              </span>
            )}
            {device.latestReading.angle != null && <span>∠ <strong>{Number(device.latestReading.angle).toFixed(1)}°</strong></span>}
            {device.latestReading.rssi != null && <span>📶 <strong>{device.latestReading.rssi} dBm</strong></span>}
          </div>
        </div>
      )}

      {chartData.length > 1 && (
        <div className="space-y-2">
          {chartData.some((d: any) => d.gravity != null) && (
            <div className="border border-border rounded-lg p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Gravity &amp; Temperature</p>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="t" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="g" orientation="right" domain={["auto", "auto"]} tick={{ fontSize: 9 }} tickFormatter={(v: number) => v.toFixed(3)} width={48} />
                  <YAxis yAxisId="t" orientation="left" domain={["auto", "auto"]} tick={{ fontSize: 9 }} unit="°" width={30} />
                  <Tooltip labelStyle={{ fontSize: 10 }} contentStyle={{ fontSize: 10 }} formatter={(v: number, n: string) => n === "gravity" ? [v.toFixed(3), "Gravity"] : [`${v.toFixed(1)}°`, "Temp"]} />
                  {chartData.some((d: any) => d.temp != null) && <Line yAxisId="t" type="monotone" dataKey="temp" stroke="#d97706" strokeWidth={1.5} dot={false} connectNulls />}
                  <Line yAxisId="g" type="monotone" dataKey="gravity" stroke="#2563eb" strokeWidth={1.5} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {chartData.some((d: any) => d.battery != null) && (
            <div className="border border-border rounded-lg p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Battery</p>
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                  <XAxis dataKey="t" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 9 }} unit="V" width={32} />
                  <Tooltip labelStyle={{ fontSize: 10 }} contentStyle={{ fontSize: 10 }} formatter={(v: number, _name: string, entry: any) => {
                    const pct = entry?.payload?.batteryPct;
                    return [`${v.toFixed(2)}V${pct != null ? ` (~${Math.round(pct)}%)` : ""}`, "Battery"];
                  }} />
                  <Line type="monotone" dataKey="battery" stroke="#16a34a" strokeWidth={1.5} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {(["24h", "7d", "30d", "all", "brew"] as const).map((p) => (
            <button key={p} type="button" onClick={() => setFilterPreset(p)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filterPreset === p ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {p === "24h" ? "Last 24h" : p === "7d" ? "Last 7d" : p === "30d" ? "Last 30d" : p === "all" ? "All time" : "By brew"}
            </button>
          ))}
          {filterPreset === "brew" && (
            <select className="text-xs bg-background border border-border rounded px-2 py-1 ml-1"
              value={filterBrewId ?? ""} onChange={(e) => setFilterBrewId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">All brews</option>
              {(brewSessions as any[]).map((s: any) => <option key={s.id} value={s.id}>{s.recipeName}</option>)}
            </select>
          )}
        </div>
        <button type="button" onClick={() => setSort((s) => (s === "desc" ? "asc" : "desc"))}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0">
          {sort === "desc" ? "↓ Newest first" : "↑ Oldest first"}
        </button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Received</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Gravity</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Temp</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Angle</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Battery</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">RSSI</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Brew</th>
                <th className="w-6 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 8 }).map((_, j) => <td key={j} className="px-3 py-2"><Skeleton className="h-3 w-full rounded" /></td>)}</tr>
              ))}
              {!isLoading && readings.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No readings in this range</td></tr>
              )}
              {(readings as any[]).map((r: any) => (
                <Fragment key={r.id}>
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                      {formatShortDateTime(r.receivedAt)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{r.gravity != null ? Number(r.gravity).toFixed(3) : "—"}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">{r.temperature != null ? `${Number(r.temperature).toFixed(1)}${r.temperatureUnit === "F" ? "°F" : "°C"}` : "—"}</td>
                    <td className="px-2 py-1.5 text-right">{r.angle != null ? `${Number(r.angle).toFixed(1)}°` : "—"}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      {r.battery != null ? (
                        <span className={batteryClass(r.batteryPercentEstimate)}>
                          {Number(r.battery).toFixed(2)}V{r.batteryPercentEstimate != null ? ` (~${Math.round(r.batteryPercentEstimate)}%)` : ""}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right text-muted-foreground">{r.rssi != null ? `${r.rssi}` : "—"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground max-w-[100px] truncate">{brewName(r.brewSessionId ?? null) ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      {r.rawPayload && (
                        <button type="button" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors" title="Raw payload">
                          {expandedId === r.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === r.id && r.rawPayload && (
                    <tr key={`${r.id}-raw`}>
                      <td colSpan={8} className="px-3 pb-2 bg-muted/10">
                        <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto text-muted-foreground">{JSON.stringify(r.rawPayload, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="border-t border-border px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
                className="px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted transition-colors">← Prev</button>
              <span>{currentPage} / {totalPages}</span>
              <button type="button" disabled={offset + LIMIT >= total} onClick={() => setOffset((o) => o + LIMIT)}
                className="px-2 py-1 rounded border border-border disabled:opacity-40 hover:bg-muted transition-colors">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
