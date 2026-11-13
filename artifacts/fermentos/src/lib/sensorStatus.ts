/** Connection states reported for an iSpindel / sensor device. */
export type ConnectionStatus = "connected" | "warning" | "offline" | "unknown" | (string & {});

/** Background class for a connection status dot. */
export function connectionDotClass(status: ConnectionStatus): string {
  return status === "connected" ? "bg-green-500" :
    status === "warning" ? "bg-amber-500" :
    status === "offline" ? "bg-destructive" : "bg-muted-foreground";
}

/** Text colour class for a connection status label. */
export function connectionTextClass(status: ConnectionStatus): string {
  return status === "connected" ? "text-green-600 dark:text-green-400" :
    status === "warning" ? "text-amber-600 dark:text-amber-400" :
    status === "offline" ? "text-destructive" : "text-muted-foreground";
}

/**
 * Text colour class for an estimated battery percentage: red under 10%,
 * amber under 20%, otherwise `fallback`.
 */
export function batteryClass(pct: number | null | undefined, fallback = ""): string {
  if (pct != null && pct < 10) return "text-destructive";
  if (pct != null && pct < 20) return "text-amber-600 dark:text-amber-400";
  return fallback;
}

/**
 * A sensor temperature converted to `displayUnit` (the user's temperature
 * unit). `storedUnit` is the unit the reading was stored in; anything other
 * than "F" is treated as °C, which is what Shelly probes and most iSpindels
 * report. E.g. 18.5 stored in C shows as "65.3°F".
 */
export function sensorTempIn(temperature: number, storedUnit: string | null | undefined, displayUnit: "C" | "F"): number {
  const t = Number(temperature);
  const stored = storedUnit === "F" ? "F" : "C";
  if (stored === displayUnit) return t;
  return displayUnit === "F" ? t * 9 / 5 + 32 : (t - 32) * 5 / 9;
}

export function formatSensorTemp(temperature: number, storedUnit: string | null | undefined, displayUnit: "C" | "F"): string {
  return `${sensorTempIn(temperature, storedUnit, displayUnit).toFixed(1)}°${displayUnit}`;
}
