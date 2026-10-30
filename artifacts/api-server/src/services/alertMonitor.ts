import cron from "node-cron";
import { db, brewSessionsTable, brewAlertStateTable, sensorDeviceBrewAssignmentsTable, ACTIVE_BREW_STATUSES } from "@workspace/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { computeBrewAlerts } from "./brewAlerts.js";
import { getNotifyConfig, type AlertType } from "./notifications.js";
import { recordFiringAlert, resolveAlert } from "./alertState.js";
import { runDryHopCheck } from "./dryHops.js";
import { runAutoAdvanceCheck } from "./autoConditioning.js";
import { isDryHopAlertType } from "../lib/dryHopSchedule.js";
import { resolveRepeatHours } from "../lib/notifyIntervals.js";
import { alertAppliesToStatus, notifiesOncePerBrew } from "../lib/alertPolicy.js";
import { getTempAlertReadings } from "./tempAlertReadings.js";
import { consecutiveTempExcursions, tempAlertConfirmed } from "../lib/tempExcursion.js";

/**
 * Scheduled alert monitor.
 *
 * Alerts used to be computed only inside request handlers, so nothing was
 * noticed unless a browser had the page open. This runs the same computation
 * (computeBrewAlerts — shared with the telemetry endpoint, so the UI and the
 * notifications can never disagree) on a timer and pushes anything new out
 * through the configured channel.
 */

function titleFor(recipeName: string, alertType: string): string {
  const labels: Record<string, string> = {
    temp_out_of_range: "Temperature out of range",
    gravity_stalled: "Fermentation may be stalled",
    device_offline: "Sensor offline",
    battery_low: "Sensor battery low",
  };
  return `${recipeName}: ${labels[alertType] ?? alertType}`;
}

async function runAlertCheck(): Promise<void> {
  const config = await getNotifyConfig();
  if (config.channel === "none") return;      // nothing configured, nothing to do
  if (config.types.length === 0) return;

  const requiredTempReadings = await getTempAlertReadings();
  const now = new Date();

  // Only active stages are worth alerting on. `packaged` is terminal — the beer
  // is in the keg, a stale probe reading must never wake anyone up.
  const sessions = await db
    .select({ id: brewSessionsTable.id, recipeName: brewSessionsTable.recipeName, status: brewSessionsTable.status })
    .from(brewSessionsTable)
    .where(inArray(brewSessionsTable.status, [...ACTIVE_BREW_STATUSES]));

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
      const tempStreak = telemetry ? consecutiveTempExcursions(telemetry.readings, telemetry.tempRange) : 0;
      const firing = new Set(
        (telemetry?.alerts ?? [])
          .map((a) => a.type)
          .filter((t): t is AlertType => (config.types as string[]).includes(t))
          .filter((t) => alertAppliesToStatus(t, session.status)),
      );

      const existing = await db
        .select()
        .from(brewAlertStateTable)
        .where(eq(brewAlertStateTable.brewSessionId, session.id));
      const byType = new Map(existing.map((r) => [r.alertType, r]));

      // ── Conditions currently firing ────────────────────────────────────
      for (const alert of telemetry?.alerts ?? []) {
        if (!firing.has(alert.type as AlertType)) continue;
        await recordFiringAlert({
          brewSessionId: session.id,
          alertType: alert.type,
          prior: byType.get(alert.type),
          now,
          // Per alert type: temperature can carry its own interval, the rest
          // use the global one.
          repeatMs: resolveRepeatHours(alert.type, config.repeatHours, config.tempRepeatHours) * 60 * 60 * 1000,
          oncePerBrew: notifiesOncePerBrew(alert.type),
          debounced: tempAlertConfirmed(alert.type, tempStreak, requiredTempReadings),
          payload: {
            title: titleFor(session.recipeName, alert.type),
            body: alert.message,
            priority: alert.type === "battery_low" ? "default" : "high",
            meta: { brewSessionId: session.id, recipeName: session.recipeName, alertType: alert.type },
          },
          config,
        });
      }

      // ── Conditions that have cleared ───────────────────────────────────
      // Dry hop rows are not sensor conditions; runDryHopCheck resolves them.
      for (const row of existing) {
        if (firing.has(row.alertType as AlertType) || isDryHopAlertType(row.alertType)) continue;
        await resolveAlert(row, now);
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
    // Separate pass: dry hops need no probe and have their own on/off switch,
    // so they must not sit behind the sensor checks' early returns.
    runDryHopCheck().catch((e) => logger.error({ e }, "Dry hop check failed"));
    // Also separate: moving a finished batch on must happen with notifications
    // switched off entirely.
    runAutoAdvanceCheck().catch((e) => logger.error({ e }, "Auto-advance check failed"));
  });
  logger.info("Alert monitor started");
}
