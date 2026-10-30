/**
 * Temperature range checks shared by the telemetry endpoint and the alert
 * monitor, so the comparison that raises an alert and the one that debounces it
 * are the same code.
 *
 * Import-free on purpose, like alertPolicy.ts, so it stays testable without
 * DATABASE_URL.
 */

export type TempRange = {
  min: number | null;
  max: number | null;
  ideal: number | null;
  unit: "F" | "C";
  /** Which stage's range this is, so the chart can label it. */
  phase: "fermenting" | "conditioning";
} | null;

export type TempReadingLike = { temperature?: number | null; temperatureUnit?: string | null };

export type TempExcursion = { direction: "below" | "above"; value: number; limit: number; unit: string };

/**
 * Whether one reading sits outside the configured range, expressed in the
 * range's own unit.
 */
export function tempExcursion(
  reading: TempReadingLike | null | undefined,
  tempRange: TempRange,
): TempExcursion | null {
  if (!tempRange || reading?.temperature == null) return null;

  const readingUnit = (reading.temperatureUnit ?? "C").toUpperCase();
  const rangeUnit = tempRange.unit;
  let value = reading.temperature;
  if (readingUnit === "C" && rangeUnit === "F") {
    value = value * 9 / 5 + 32;
  } else if (readingUnit === "F" && rangeUnit === "C") {
    value = (value - 32) * 5 / 9;
  }

  const unit = rangeUnit === "F" ? "°F" : "°C";
  const { min, max } = tempRange;
  if (min != null && value < min) return { direction: "below", value, limit: min, unit };
  if (max != null && value > max) return { direction: "above", value, limit: max, unit };
  return null;
}

/**
 * Trailing run of readings that are outside the range. Readings with no
 * temperature at all are skipped rather than treated as a recovery, so one
 * partial report does not silently restart the count.
 *
 * Only temperature is debounced this way. The other three conditions are
 * already slow by construction — device_offline needs 4x the report interval
 * to elapse, gravity_stalled needs 24 hours of flat gravity, and battery_low
 * only trips once the pack is under 20% — so they notify on first detection.
 * gravity_stalled is further limited by lib/alertPolicy.ts: it is only checked
 * while fermenting and is sent at most once per brew.
 */
export function consecutiveTempExcursions(readings: TempReadingLike[], range: TempRange | undefined): number {
  if (!range) return 0;

  let streak = 0;
  for (let i = readings.length - 1; i >= 0; i--) {
    const reading = readings[i]!;
    if (reading.temperature == null) continue;
    if (!tempExcursion(reading, range)) break;
    streak++;
  }
  return streak;
}

/**
 * Temperature has to persist across `required` readings before it is sent;
 * the other types stand on their own (see consecutiveTempExcursions).
 */
export function tempAlertConfirmed(alertType: string, streak: number, required: number): boolean {
  return alertType !== "temp_out_of_range" || streak >= required;
}
