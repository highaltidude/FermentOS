import { db, brewAlertStateTable, type BrewAlertState } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { sendNotification, type NotificationPayload, type NotifyConfig } from "./notifications.js";

/**
 * The brew_alert_state bookkeeping shared by every monitored alert — the
 * sensor conditions in alertMonitor.ts and the dry hop reminders in dryHops.ts.
 * One row per (brew, alert type) remembers when it was first seen and last
 * sent, which is what turns "still firing" into "repeat every N hours".
 */

export type FiringAlert = {
  brewSessionId: number;
  alertType: string;
  prior: BrewAlertState | undefined;
  now: Date;
  repeatMs: number;
  /** Keeps its send time through a recurrence, so it is only ever sent once. */
  oncePerBrew: boolean;
  /** False while a condition is still being confirmed; recorded but not sent. */
  debounced: boolean;
  payload: NotificationPayload;
  config: NotifyConfig;
};

export async function recordFiringAlert(a: FiringAlert): Promise<void> {
  const { brewSessionId, alertType, prior, now } = a;

  // A previously resolved row starts over rather than resuming its old
  // seen count, so a recurrence is treated as a fresh incident.
  const resuming = prior && prior.resolvedAt != null;
  const seenCount = !prior || resuming ? 1 : prior.seenCount + 1;
  const lastNotifiedAt = resuming && !a.oncePerBrew ? null : prior?.lastNotifiedAt ?? null;

  const dueForRepeat = !a.oncePerBrew && lastNotifiedAt != null && now.getTime() - new Date(lastNotifiedAt).getTime() >= a.repeatMs;
  const shouldNotify = a.debounced && (lastNotifiedAt == null || dueForRepeat);
  const firstSeenAt = !prior || resuming ? now : prior.firstSeenAt;

  await db
    .insert(brewAlertStateTable)
    .values({
      brewSessionId,
      alertType,
      firstSeenAt,
      seenCount,
      lastNotifiedAt: shouldNotify ? now : lastNotifiedAt,
      resolvedAt: null,
    })
    .onConflictDoUpdate({
      target: [brewAlertStateTable.brewSessionId, brewAlertStateTable.alertType],
      set: {
        seenCount,
        firstSeenAt,
        lastNotifiedAt: shouldNotify ? now : lastNotifiedAt,
        resolvedAt: null,
      },
    });

  if (!shouldNotify) return;

  const result = await sendNotification(a.payload, a.config);

  if (result.ok) {
    logger.info({ brewSessionId, alertType }, "Alert notification sent");
  } else {
    // Roll the timestamp back so a failed send retries next tick instead
    // of being treated as delivered.
    await db
      .update(brewAlertStateTable)
      .set({ lastNotifiedAt })
      .where(and(
        eq(brewAlertStateTable.brewSessionId, brewSessionId),
        eq(brewAlertStateTable.alertType, alertType),
      ));
    logger.warn({ brewSessionId, alertType, error: result.error }, "Alert notification failed");
  }
}

export async function resolveAlert(row: BrewAlertState, now: Date): Promise<void> {
  if (row.resolvedAt != null) return;
  await db
    .update(brewAlertStateTable)
    .set({ resolvedAt: now, seenCount: 0 })
    .where(eq(brewAlertStateTable.id, row.id));
  logger.info({ brewSessionId: row.brewSessionId, alertType: row.alertType }, "Alert condition resolved");
}
