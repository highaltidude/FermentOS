import cron from "node-cron";
import { db, brewSessionsTable, brewAlertStateTable, appConfigTable, sensorDeviceBrewAssignmentsTable } from "@workspace/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { computeBrewAlerts, tempExcursion, type BrewTelemetry } from "./brewAlerts.js";
import { getNotifyConfig, sendNotification, type AlertType } from "./notifications.js";

/**
 * Scheduled alert monitor.
 *
 * Alerts used to be computed only inside request handlers, so nothing was
 * noticed unless a browser had the page open. This runs the same computation
 * (computeBrewAlerts — shared with the telemetry endpoint, so the UI and the
 * notifications can never disagree) on a timer and pushes anything new out
 * through the configured channel.
 */

// Only these stages are worth alerting on. `packaged` is terminal — the beer
// is in the keg, a stale probe reading must never wake anyone up.
const ACTIVE_STATUSES = ["brew_day", "fermenting", "conditioning"] as const;

const TEMP_ALERT_READINGS_KEY = "temp_alert_consecutive_readings";

/**
 * Consecutive out-of-range readings required before the first temperature
 * notification — the `temp_alert_consecutive_readings` setting, shown in the
 * UI as "Temperature Alert Threshold: N readings".
 *
 * Counted in readings, not monitor ticks. The monitor runs every 5 minutes
 * but an iSpindel typically reports every 30, so counting ticks would fire
 * after ~10 minutes on the strength of a single reading — far sooner than
 * the setting promises.
 */
async function getRequiredTempReadings(): Promise<number> {
  const [row] = await db.select().from(appConfigTable).where(eq(appConfigTable.key, TEMP_ALERT_READINGS_KEY));
  const parsed = row?.value ? parseInt(row.value, 10) : 2;
  return Number.isFinite(parsed) && parsed >= 2 && parsed <= 10 ? parsed : 2;
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
 */
function consecutiveTempExcursions(telemetry: BrewTelemetry): number {
  const range = telemetry.tempRange ?? null;
  if (!range) return 0;

  let streak = 0;
  for (let i = telemetry.readings.length - 1; i >= 0; i--) {
    const reading = telemetry.readings[i]!;
    if (reading.temperature == null) continue;
    if (!tempExcursion(reading, range)) break;
    streak++;
  }
  return streak;
}

function titleFor(recipeName: string, alertType: string): string {
  const labels: Record<string, string> = {
    temp_out_of_range: "Temperature out of range",
    gravity_stalled: "Fermentation may be stalled",
    device_offline: "Sensor offline",
    battery_low: "Sensor battery low",
  };
  return `${recipeName}: ${labels[alertType] ?? alertType}`;
}

export async function runAlertCheck(): Promise<void> {
  const config = await getNotifyConfig();
  if (config.channel === "none") return;      // nothing configured, nothing to do
  if (config.types.length === 0) return;

  const requiredTempReadings = await getRequiredTempReadings();
  const repeatMs = config.repeatHours * 60 * 60 * 1000;
  const now = new Date();

  const sessions = await db
    .select({ id: brewSessionsTable.id, recipeName: brewSessionsTable.recipeName })
    .from(brewSessionsTable)
    .where(inArray(brewSessionsTable.status, [...ACTIVE_STATUSES]));

  for (const session of sessions) {
    try {
      // A brew whose probe has been unassigned should not keep reporting
      // "device offline". It still falls through to the resolution pass below
      // though — skipping outright would strand any open alert rows as
      // permanently active, which would then suppress or misfire the next
      // time that brew got a device.
      const [activeAssignment] = await db
        .select({ id: sensorDeviceBrewAssignmentsTable.id })
        .from(sensorDeviceBrewAssignmentsTable)
        .where(and(
          eq(sensorDeviceBrewAssignmentsTable.brewSessionId, session.id),
          isNull(sensorDeviceBrewAssignmentsTable.unassignedAt),
        ));

      const telemetry = activeAssignment ? await computeBrewAlerts(session.id) : null;
      const tempStreak = telemetry ? consecutiveTempExcursions(telemetry) : 0;
      const firing = new Set(
        (telemetry?.alerts ?? [])
          .map((a) => a.type)
          .filter((t): t is AlertType => (config.types as string[]).includes(t)),
      );

      const existing = await db
        .select()
        .from(brewAlertStateTable)
        .where(eq(brewAlertStateTable.brewSessionId, session.id));
      const byType = new Map(existing.map((r) => [r.alertType, r]));

      // ── Conditions currently firing ────────────────────────────────────
      for (const alert of telemetry?.alerts ?? []) {
        if (!firing.has(alert.type as AlertType)) continue;
        const prior = byType.get(alert.type);

        // A previously resolved row starts over rather than resuming its old
        // seen count, so a recurrence is treated as a fresh incident.
        const resuming = prior && prior.resolvedAt != null;
        const seenCount = !prior || resuming ? 1 : prior.seenCount + 1;
        const lastNotifiedAt = resuming ? null : prior?.lastNotifiedAt ?? null;

        const dueForRepeat = lastNotifiedAt != null && now.getTime() - new Date(lastNotifiedAt).getTime() >= repeatMs;
        // Temperature has to persist across N readings; the rest are already
        // slow enough to stand on their own (see consecutiveTempExcursions).
        const debounced = alert.type !== "temp_out_of_range" || tempStreak >= requiredTempReadings;
        const shouldNotify = debounced && (lastNotifiedAt == null || dueForRepeat);

        await db
          .insert(brewAlertStateTable)
          .values({
            brewSessionId: session.id,
            alertType: alert.type,
            firstSeenAt: !prior || resuming ? now : prior.firstSeenAt,
            seenCount,
            lastNotifiedAt: shouldNotify ? now : lastNotifiedAt,
            resolvedAt: null,
          })
          .onConflictDoUpdate({
            target: [brewAlertStateTable.brewSessionId, brewAlertStateTable.alertType],
            set: {
              seenCount,
              firstSeenAt: !prior || resuming ? now : prior.firstSeenAt,
              lastNotifiedAt: shouldNotify ? now : lastNotifiedAt,
              resolvedAt: null,
            },
          });

        if (!shouldNotify) continue;

        const result = await sendNotification({
          title: titleFor(session.recipeName, alert.type),
          body: alert.message,
          priority: alert.type === "battery_low" ? "default" : "high",
          meta: { brewSessionId: session.id, recipeName: session.recipeName, alertType: alert.type },
        }, config);

        if (result.ok) {
          logger.info({ brewSessionId: session.id, alertType: alert.type }, "Alert notification sent");
        } else {
          // Roll the timestamp back so a failed send retries next tick instead
          // of being treated as delivered.
          await db
            .update(brewAlertStateTable)
            .set({ lastNotifiedAt })
            .where(and(
              eq(brewAlertStateTable.brewSessionId, session.id),
              eq(brewAlertStateTable.alertType, alert.type),
            ));
          logger.warn({ brewSessionId: session.id, alertType: alert.type, error: result.error }, "Alert notification failed");
        }
      }

      // ── Conditions that have cleared ───────────────────────────────────
      for (const row of existing) {
        if (firing.has(row.alertType as AlertType) || row.resolvedAt != null) continue;
        await db
          .update(brewAlertStateTable)
          .set({ resolvedAt: now, seenCount: 0 })
          .where(eq(brewAlertStateTable.id, row.id));
        logger.info({ brewSessionId: session.id, alertType: row.alertType }, "Alert condition resolved");
      }
    } catch (e) {
      // One bad brew must not stop the others being checked.
      logger.error({ e, brewSessionId: session.id }, "Alert check failed for brew session");
    }
  }
}

export function startAlertMonitor(): void {
  cron.schedule("*/5 * * * *", () => {
    runAlertCheck().catch((e) => logger.error({ e }, "Alert monitor run failed"));
  });
  logger.info("Alert monitor started");
}
