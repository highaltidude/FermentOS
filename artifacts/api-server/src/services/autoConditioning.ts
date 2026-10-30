import {
  db,
  brewSessionsTable,
  brewSessionStatusLogTable,
  sensorDeviceBrewAssignmentsTable,
} from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { effectiveAutoAdvance, shouldAutoAdvance } from "../lib/autoAdvance.js";
import { getConfigValue, setConfigValue } from "./appConfig.js";
import { computeBrewAlerts } from "./brewAlerts.js";
import { getNotifyConfig, sendNotification } from "./notifications.js";

const KEY = "auto_advance_to_conditioning";

/** The global switch; a batch can override it either way. Off unless set. */
export async function getAutoConditioning(): Promise<boolean> {
  return (await getConfigValue(KEY)) === "true";
}

export async function setAutoConditioning(enabled: boolean): Promise<void> {
  await setConfigValue(KEY, String(enabled));
}

/**
 * Run from the alert monitor's 5-minute tick. This used to live in the brew
 * page, so a batch nobody opened never advanced (issue #199).
 *
 * Fermentation status comes from computeBrewAlerts, the same computation the
 * telemetry endpoint uses, so the page's "may be complete" banner and this
 * check can never disagree.
 */
export async function runAutoAdvanceCheck(): Promise<void> {
  const global = await getAutoConditioning();

  const sessions = await db
    .select({
      id: brewSessionsTable.id,
      recipeName: brewSessionsTable.recipeName,
      status: brewSessionsTable.status,
      autoAdvanceToConditioning: brewSessionsTable.autoAdvanceToConditioning,
    })
    .from(brewSessionsTable)
    .where(eq(brewSessionsTable.status, "fermenting"));

  for (const session of sessions) {
    if (!effectiveAutoAdvance(session.autoAdvanceToConditioning, global)) continue;
    try {
      // A probe that has been taken out says nothing about the beer any more.
      const [activeAssignment] = await db
        .select({ id: sensorDeviceBrewAssignmentsTable.id })
        .from(sensorDeviceBrewAssignmentsTable)
        .where(and(
          eq(sensorDeviceBrewAssignmentsTable.brewSessionId, session.id),
          isNull(sensorDeviceBrewAssignmentsTable.unassignedAt),
        ));
      if (!activeAssignment) continue;

      const telemetry = await computeBrewAlerts(session.id);
      if (!shouldAutoAdvance({
        status: session.status,
        perBrew: session.autoAdvanceToConditioning,
        global,
        fermentationStatus: telemetry.insights?.fermentationStatus,
      })) continue;

      // Guarded on the stage, so a brewer changing it in the same moment wins
      // and the log never gets a second entry for one move.
      const moved = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(brewSessionsTable)
          .set({ status: "conditioning", updatedAt: new Date() })
          .where(and(eq(brewSessionsTable.id, session.id), eq(brewSessionsTable.status, "fermenting")))
          .returning({ id: brewSessionsTable.id });
        if (!row) return false;
        await tx.insert(brewSessionStatusLogTable).values({
          brewSessionId: session.id,
          status: "conditioning",
          changedAt: new Date(),
          notes: "Moved automatically: fermentation looked complete",
        });
        return true;
      });
      if (!moved) continue;

      logger.info({ brewSessionId: session.id }, "Auto-advanced brew session to conditioning");

      const config = await getNotifyConfig();
      if (config.channel === "none" || !config.autoAdvanceAlerts) continue;
      const insights = telemetry.insights;
      const details = [
        insights?.currentGravity != null ? `Gravity ${insights.currentGravity.toFixed(3)}` : null,
        insights?.attenuationPercent != null ? `${Math.round(insights.attenuationPercent)}% attenuation` : null,
      ].filter(Boolean).join(", ");
      // Never throws (see sendNotification); a failed send is only logged.
      const result = await sendNotification({
        title: `${session.recipeName}: Moved to Conditioning`,
        body: `Gravity has stopped moving, so the batch was moved on automatically.${details ? ` ${details}.` : ""}`,
        priority: "default",
        meta: { brewSessionId: session.id, recipeName: session.recipeName, alertType: "auto_advance" },
      }, config);
      if (!result.ok) {
        logger.warn({ brewSessionId: session.id, error: result.error }, "Auto-advance notification failed");
      }
    } catch (e) {
      // One bad brew must not stop the others being checked.
      logger.error({ e, brewSessionId: session.id }, "Auto-advance check failed for brew session");
    }
  }
}
