import { db, sensorDevicesTable, sensorReadingsTable, sensorDeviceBrewAssignmentsTable, brewSessionsTable, recipesTable, type brewStatusEnum } from "@workspace/db";
import { eq, isNotNull, and, gte, lte } from "drizzle-orm";
import { calcInsights } from "../lib/fermentationInsights";
import { batteryWarningLevel } from "../lib/batteryUtil";
import { getConfigValue } from "./appConfig";
import { activeTempPhase } from "../lib/alertPolicy";
import { isGravityStalled } from "../lib/gravityStall";
import { tempExcursion, type TempRange } from "../lib/tempExcursion";

export { tempExcursion, type TempRange, type TempReadingLike, type TempExcursion } from "../lib/tempExcursion";

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
  const level = pct != null ? batteryWarningLevel(pct) : null;
  if (pct != null && level) {
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
type BrewStatus = (typeof brewStatusEnum)[number];

const RANGE_COLUMNS = {
  fermenting: { min: "fermentTempMin", max: "fermentTempMax", ideal: "fermentTempIdeal" },
  conditioning: { min: "conditionTempMin", max: "conditionTempMax", ideal: "conditionTempIdeal" },
} as const;

/**
 * The temperature range in force for the brew's current stage: the session's
 * own values, each falling back to the linked recipe. Null when nothing is set,
 * which switches temperature alerts off — so a batch in conditioning with no
 * conditioning range is simply not checked.
 */
async function resolveTempRange(brewId: number): Promise<{ status: BrewStatus | null; range: TempRange; originalGravity: number | null }> {
  const [session] = await db.select().from(brewSessionsTable).where(eq(brewSessionsTable.id, brewId));
  if (!session) return { status: null, range: null, originalGravity: null };
  const originalGravity = session.originalGravityActual ?? null;

  const phase = activeTempPhase(session.status);
  const cols = RANGE_COLUMNS[phase];
  let min = session[cols.min];
  let max = session[cols.max];
  let ideal = session[cols.ideal];

  if ((min == null || max == null || ideal == null) && session.recipeId) {
    const [recipe] = await db.select().from(recipesTable).where(eq(recipesTable.id, session.recipeId));
    if (recipe) {
      min = min ?? recipe[cols.min];
      max = max ?? recipe[cols.max];
      ideal = ideal ?? recipe[cols.ideal];
    }
  }

  if (min == null && max == null && ideal == null) return { status: session.status, range: null, originalGravity };
  const unit = (await getConfigValue("ferment_temp_unit")) === "C" ? "C" : "F";
  return { status: session.status, range: { min, max, ideal, unit, phase }, originalGravity };
}

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
  /** The brew's stage, for callers that only alert on active brews. */
  status?: BrewStatus | null;
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
  const { status, range: tempRange, originalGravity } = await resolveTempRange(brewId);
  const insights = calcInsights(readings, originalGravity);

  const connectionStatus = calcConnectionStatus(device?.lastSeenAt ?? null, latestReading?.reportedInterval ?? null);

  const alerts = buildAlerts(device ?? { lastSeenAt: null }, latestReading, connectionStatus, tempRange);

  if (isGravityStalled(readings)) {
    alerts.push({ type: "gravity_stalled", message: "Gravity unchanged for 24+ hours", triggeredAt: new Date().toISOString() });
  }

  return { brewSessionId: brewId, device: device ?? null, latestReading, readings, insights, alerts, tempRange, isDeviceActive, status, hasAssignments: true };
}
