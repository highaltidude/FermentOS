import { db, sensorDevicesTable, sensorReadingsTable, sensorDeviceBrewAssignmentsTable, brewSessionsTable, recipesTable, appConfigTable } from "@workspace/db";
import { eq, isNotNull, and, gte, lte } from "drizzle-orm";
import { calcInsights } from "../lib/fermentationInsights";

/**
 * Brew telemetry and alert computation.
 *
 * This used to live inline inside the GET /brew-sessions/:id/sensor-telemetry
 * route handler, which meant alerts only existed while somebody had the page
 * open. The scheduled alert monitor needs exactly the same numbers, so the
 * orchestration moved here and the route now calls it — one implementation,
 * so the UI and the notifications can never disagree.
 */

export type BrewAlert = { type: string; message: string; triggeredAt: string };

export type TempRange = { min: number | null; max: number | null; ideal: number | null; unit: "F" | "C" } | null;

export function calcConnectionStatus(
  lastSeenAt: Date | null,
  reportedIntervalSeconds: number | null,
): "connected" | "warning" | "offline" | "unknown" {
  if (!lastSeenAt) return "unknown";
  const intervalMs = (reportedIntervalSeconds ?? 1800) * 1000;
  const elapsed = Date.now() - new Date(lastSeenAt).getTime();
  if (elapsed < intervalMs * 2) return "connected";
  if (elapsed < intervalMs * 4) return "warning";
  return "offline";
}

export type TempReadingLike = { temperature?: number | null; temperatureUnit?: string | null };

export type TempExcursion = { direction: "below" | "above"; value: number; limit: number; unit: string };

/**
 * Whether one reading sits outside the configured range, expressed in the
 * range's own unit. Exported so the alert monitor can count *consecutive
 * out-of-range readings* using exactly the comparison that raises the alert,
 * rather than a second, drifting copy of the threshold logic.
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

export function buildAlerts(
  device: { lastSeenAt: Date | null },
  reading: { battery?: number | null; batteryPercentEstimate?: number | null; gravity?: number | null; receivedAt: Date; reportedInterval?: number | null; temperature?: number | null; temperatureUnit?: string | null } | null,
  connectionStatus: string,
  tempRange?: TempRange,
): BrewAlert[] {
  const alerts: BrewAlert[] = [];
  const now = new Date();

  if (connectionStatus === "offline") {
    alerts.push({ type: "device_offline", message: "Device has not reported recently", triggeredAt: now.toISOString() });
  }

  const pct = reading?.batteryPercentEstimate ?? null;
  if (pct != null && pct < 20) {
    const level = pct < 10 ? "critical" : "warning";
    alerts.push({
      type: "battery_low",
      message: `Battery ${level}: ${reading!.battery != null ? `${Number(reading!.battery).toFixed(2)}V ` : ""}(~${Math.round(pct)}%)`,
      triggeredAt: now.toISOString(),
    });
  }

  const excursion = tempExcursion(reading, tempRange ?? null);
  if (excursion) {
    const bound = excursion.direction === "below" ? "minimum" : "maximum";
    alerts.push({
      type: "temp_out_of_range",
      message: `Temperature ${excursion.value.toFixed(1)}${excursion.unit} is ${excursion.direction} ${bound} ${excursion.limit}${excursion.unit}`,
      triggeredAt: now.toISOString(),
    });
  }

  return alerts;
}

type Reading = typeof sensorReadingsTable.$inferSelect;

export type BrewTelemetry = {
  brewSessionId: number;
  device: typeof sensorDevicesTable.$inferSelect | null;
  latestReading: Reading | null;
  readings: Reading[];
  insights: ReturnType<typeof calcInsights> | null;
  alerts: BrewAlert[];
  /** Absent when the brew has never had a device assigned — see hasAssignments. */
  tempRange?: TempRange;
  isDeviceActive?: boolean;
  /** False when the brew has no assignment history at all. */
  hasAssignments: boolean;
};

/**
 * Everything the telemetry endpoint and the alert monitor both need for one
 * brew: the reading window across every assignment, insights, and alerts.
 */
export async function computeBrewAlerts(brewId: number): Promise<BrewTelemetry> {
  // Fetch ALL assignment windows for this brew, oldest first.
  // A brew may have multiple windows if a device was un-assigned and re-assigned,
  // or if different devices were used at different stages.
  const assignments = await db
    .select()
    .from(sensorDeviceBrewAssignmentsTable)
    .where(eq(sensorDeviceBrewAssignmentsTable.brewSessionId, brewId))
    .orderBy(sensorDeviceBrewAssignmentsTable.assignedAt);

  if (assignments.length === 0) {
    return { brewSessionId: brewId, device: null, latestReading: null, readings: [], insights: null, alerts: [], hasAssignments: false };
  }

  // For device display / connection status use the most recent assignment's device.
  const latestAssignment = assignments[assignments.length - 1]!;
  const isDeviceActive = latestAssignment.unassignedAt == null;
  const [device] = await db
    .select()
    .from(sensorDevicesTable)
    .where(eq(sensorDevicesTable.id, latestAssignment.deviceId));

  // Collect readings for every assignment window.
  // Filter by (deviceId, receivedAt >= assignedAt [, receivedAt <= unassignedAt]).
  // This means pre-assignment "test" readings are never included, and readings
  // from a prior brew's window are correctly excluded from the current brew.
  const windowResults = await Promise.all(
    assignments.map((a) => {
      const conditions: ReturnType<typeof eq>[] = [
        eq(sensorReadingsTable.deviceId, a.deviceId),
        gte(sensorReadingsTable.receivedAt, a.assignedAt),
        isNotNull(sensorReadingsTable.brewSessionId),
      ];
      if (a.unassignedAt != null) {
        conditions.push(lte(sensorReadingsTable.receivedAt, a.unassignedAt));
      }
      return db
        .select()
        .from(sensorReadingsTable)
        .where(and(...conditions))
        .orderBy(sensorReadingsTable.receivedAt);
    }),
  );

  // Merge and sort all windows by time (handles the rare multi-device case).
  const readings: Reading[] = windowResults
    .flat()
    .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());

  const latestReading = readings[readings.length - 1] ?? null;
  const insights = calcInsights(readings);

  const connectionStatus = calcConnectionStatus(device?.lastSeenAt ?? null, latestReading?.reportedInterval ?? null);

  // Fetch temp range from session, falling back to linked recipe
  const [brewSession] = await db
    .select({
      fermentTempMin: brewSessionsTable.fermentTempMin,
      fermentTempMax: brewSessionsTable.fermentTempMax,
      fermentTempIdeal: brewSessionsTable.fermentTempIdeal,
      recipeId: brewSessionsTable.recipeId,
    })
    .from(brewSessionsTable)
    .where(eq(brewSessionsTable.id, brewId));

  let tempMin: number | null = brewSession?.fermentTempMin ?? null;
  let tempMax: number | null = brewSession?.fermentTempMax ?? null;
  let tempIdeal: number | null = brewSession?.fermentTempIdeal ?? null;

  if ((tempMin == null || tempMax == null || tempIdeal == null) && brewSession?.recipeId) {
    const [recipe] = await db
      .select({ fermentTempMin: recipesTable.fermentTempMin, fermentTempMax: recipesTable.fermentTempMax, fermentTempIdeal: recipesTable.fermentTempIdeal })
      .from(recipesTable)
      .where(eq(recipesTable.id, brewSession.recipeId));
    if (recipe) {
      tempMin = tempMin ?? recipe.fermentTempMin ?? null;
      tempMax = tempMax ?? recipe.fermentTempMax ?? null;
      tempIdeal = tempIdeal ?? recipe.fermentTempIdeal ?? null;
    }
  }

  const [tempUnitRow] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, "ferment_temp_unit"));
  const tempUnit = (tempUnitRow?.value === "C" ? "C" : "F") as "F" | "C";

  const tempRange: TempRange = (tempMin != null || tempMax != null || tempIdeal != null)
    ? { min: tempMin, max: tempMax, ideal: tempIdeal, unit: tempUnit }
    : null;

  const alerts = buildAlerts(device ?? { lastSeenAt: null }, latestReading, connectionStatus, tempRange);

  // Gravity stall alert — gravity unchanged for 24h
  if (readings.length >= 2) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentReadings = readings.filter((r) => r.gravity != null && new Date(r.receivedAt) >= cutoff);
    if (recentReadings.length >= 2) {
      const gravityValues = recentReadings.map((r) => r.gravity!);
      const range = Math.max(...gravityValues) - Math.min(...gravityValues);
      if (range < 0.001) {
        alerts.push({ type: "gravity_stalled", message: "Gravity unchanged for 24+ hours", triggeredAt: new Date().toISOString() });
      }
    }
  }

  return { brewSessionId: brewId, device: device ?? null, latestReading, readings, insights, alerts, tempRange, isDeviceActive, hasAssignments: true };
}
