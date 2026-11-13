import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { BrewReferenceSensor } from "@workspace/api-client-react";
import { connectionDotClass, connectionTextClass, formatSensorTemp, sensorTempIn } from "@/lib/sensorStatus";
import { formatDateTime, formatDateTimeShort } from "@/lib/format";

/**
 * A reference sensor on a brew (an ice bath, the room, a chamber): its current
 * temperature and a chart of its readings, in the user's temperature unit.
 * Kept apart from the fermentation chart on purpose.
 */
export function ReferenceSensorChart({ sensor, unit }: { sensor: BrewReferenceSensor; unit: "C" | "F" }) {
  const data = useMemo(
    () => sensor.readings
      .filter((r) => r.temperature != null)
      .map((r) => ({ date: formatDateTime(r.receivedAt), temp: Number(sensorTempIn(r.temperature!, r.temperatureUnit, unit).toFixed(2)) })),
    [sensor.readings, unit],
  );
  const latest = sensor.latestReading;
  const status = sensor.isActive ? sensor.connectionStatus : "unknown";

  return (
    <div className="bg-card border border-card-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${connectionDotClass(status)}`} />
          <h2 className="text-sm font-semibold text-foreground truncate">{sensor.device.deviceName}</h2>
          <span className="text-xs text-muted-foreground">Reference</span>
          {sensor.isActive
            ? <span className={`text-xs capitalize ${connectionTextClass(status)}`}>{status}</span>
            : <span className="text-xs text-muted-foreground">no longer on this brew</span>}
        </div>
        {latest?.temperature != null && (
          <div className="text-right">
            <span className="text-base font-semibold text-sky-700 dark:text-sky-400">{formatSensorTemp(latest.temperature, latest.temperatureUnit, unit)}</span>
            <span className="text-xs text-muted-foreground ml-2">{formatDateTimeShort(latest.receivedAt)}</span>
          </div>
        )}
      </div>

      {data.length > 1 ? (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "#0284c7" }} tickLine={false} axisLine={false} unit={`°${unit}`} width={42} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
                padding: "8px 12px",
              }}
              labelStyle={{ color: "var(--color-muted-foreground)", marginBottom: 4 }}
              formatter={(value: number) => [`${value.toFixed(1)}°${unit}`, "Temperature"]}
            />
            <Line
              type="monotone"
              dataKey="temp"
              stroke="#0284c7"
              strokeWidth={2}
              dot={data.length > 40 ? false : { r: 2, fill: "#0284c7", strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs text-muted-foreground">Not enough readings to chart yet. A Shelly probe logs one every 5 minutes.</p>
      )}
    </div>
  );
}
