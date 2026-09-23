// Formatting shared by the iSpindel device list and device detail views.

/** Tailwind background class for a device's connection-status dot. */
export function connectionDotClass(status: string): string {
  return status === "connected" ? "bg-green-500"
    : status === "warning" ? "bg-amber-500"
    : status === "offline" ? "bg-destructive"
    : "bg-muted-foreground";
}

/** Text colour for a battery reading: red under 10 %, amber under 20 %. */
export function batteryClass(pct: number | null | undefined): string {
  return pct != null && pct < 10 ? "text-destructive" : pct != null && pct < 20 ? "text-amber-600 dark:text-amber-400" : "";
}

/** Short reading timestamp, e.g. "Sep 22, 3:04 PM". */
export function formatShortDateTime(value: string | number | Date): string {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
