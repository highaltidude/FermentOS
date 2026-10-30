type Shortage = { name: string; required: number; available: number; unit: string; reason: string };

/**
 * The lines to show when starting a brew was refused for lack of stock, or
 * null when `err` is some other failure.
 *
 * The generated client throws an `ApiError` with `.status` and `.data`
 * directly on the error (see lib/api-client-react/src/custom-fetch.ts). The
 * server returns 409 + shortages[] when inventory enforcement is on and
 * ingredients are missing.
 */
export function shortageLines(err: unknown, limit = 5): string[] | null {
  const e = err as { status?: number; data?: { shortages?: Shortage[] } };
  if (e?.status !== 409 || !e.data?.shortages) return null;
  const lines = e.data.shortages.slice(0, limit).map((s) => {
    if (s.reason === "missing") return `${s.name}: not in inventory (need ${s.required} ${s.unit})`;
    if (s.reason === "unit_mismatch") return `${s.name}: unit mismatch (need ${s.unit})`;
    return `${s.name}: have ${s.available} ${s.unit}, need ${s.required} ${s.unit}`;
  });
  if (e.data.shortages.length > limit) lines.push(`…and ${e.data.shortages.length - limit} more`);
  return lines;
}

/** The server's own message for a failed request, when it sent one. */
export function apiErrorMessage(err: unknown): string | undefined {
  return (err as { data?: { error?: string } })?.data?.error;
}
