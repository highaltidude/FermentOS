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

/** "18.5°C" / "65.3°F" — anything other than "F" is shown as °C. */
export function formatSensorTemp(temperature: number, unit: string | null | undefined): string {
  return `${Number(temperature).toFixed(1)}${unit === "F" ? "°F" : "°C"}`;
}
