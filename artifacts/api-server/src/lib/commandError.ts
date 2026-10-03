/**
 * The useful line of a failed pg_dump/psql run. execSync's own error message
 * repeats the whole command line — DATABASE_URL, password included — and these
 * messages reach the browser and the saved backup status, so only the tool's
 * stderr is passed on.
 *
 * Import-free on purpose, like alertPolicy.ts, so it stays testable without
 * DATABASE_URL.
 */
export function commandErrorReason(err: unknown): string {
  const stderr = String((err as { stderr?: Buffer | string } | null)?.stderr ?? "").trim();
  const lines = stderr.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => /ERROR|error:/.test(l)) ?? lines[0] ?? "command failed";
}
