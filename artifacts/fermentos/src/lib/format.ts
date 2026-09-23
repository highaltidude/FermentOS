// Parse a YYYY-MM-DD date string as local midnight to prevent UTC offset shifting.
// Only for calendar date fields (brewDate, plannedDate, expiryDate, ...).
export function parseLocalDate(d: string): Date {
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, day ?? 1);
}

/** Calendar date, e.g. "Mar 4, 2026". */
export function formatDate(d: string): string {
  return parseLocalDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Full ISO timestamp in local time without the year, e.g. "Mar 4, 3:15 PM". */
export function formatDateTimeShort(d: string | Date): string {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Full ISO timestamp in local time, e.g. "Mar 4, 2026, 3:15 PM". */
export function formatDateTime(d: string | Date): string {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
