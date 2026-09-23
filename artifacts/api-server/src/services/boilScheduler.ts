import { db, brewSessionsTable, recipeIngredientsTable } from "@workspace/db";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { upcomingBoilAlerts, boilPhase, type BoilAlertGroup, type BoilIngredient } from "../lib/boilTimer.js";
import { getNotifyConfig, sendNotification } from "./notifications.js";

/**
 * Hop-addition and flameout notifications for a running boil timer.
 *
 * This is the one alert that cannot wait for the 5-minute alert monitor — a
 * 15-minute addition that arrives four minutes late is a different beer — so
 * each due time gets its own setTimeout. The timeouts are only a cache of what
 * the brew_sessions row says: they are rebuilt from the row on every timer
 * change and on boot, and each one re-reads the row before sending, so a pause,
 * finish, reset or deleted session can never produce a stray alert.
 *
 * Delivered on the outbound ntfy/webhook channel, which is what makes it work
 * on a plain-HTTP LAN with the phone locked; the page itself beeps as well.
 */

const timers = new Map<number, NodeJS.Timeout[]>();

export function clearBoilAlerts(brewSessionId: number): void {
  for (const t of timers.get(brewSessionId) ?? []) clearTimeout(t);
  timers.delete(brewSessionId);
}

async function loadBoilIngredients(recipeId: number | null): Promise<BoilIngredient[]> {
  if (recipeId == null) return [];
  return db
    .select({
      id: recipeIngredientsTable.id,
      name: recipeIngredientsTable.name,
      amount: recipeIngredientsTable.amount,
      unit: recipeIngredientsTable.unit,
      use: recipeIngredientsTable.use,
      timingMinutes: recipeIngredientsTable.timingMinutes,
    })
    .from(recipeIngredientsTable)
    .where(eq(recipeIngredientsTable.recipeId, recipeId));
}

function describe(ing: BoilIngredient): string {
  return `${ing.amount} ${ing.unit} ${ing.name}`;
}

async function fire(brewSessionId: number, group: BoilAlertGroup): Promise<void> {
  const config = await getNotifyConfig();
  if (config.channel === "none" || !config.boilAlerts) return;

  const [session] = await db.select().from(brewSessionsTable).where(eq(brewSessionsTable.id, brewSessionId));
  if (!session || boilPhase(session) !== "running") return;

  // Anything already ticked off on the page (added early) is not worth a buzz.
  const done = new Set(session.boilDoneAdditionIds ?? []);
  const additions = group.additions.filter((a) => !done.has(a.id));
  if (!group.flameout && additions.length === 0) return;

  const title = group.flameout
    ? `${session.recipeName}: Flameout`
    : `${session.recipeName}: ${group.atMinutesRemaining} min addition`;
  const body = group.flameout
    ? additions.length
      ? `Boil complete. Whirlpool / flameout: ${additions.map(describe).join(", ")}`
      : "Boil complete — time to chill."
    : `Add ${additions.map(describe).join(", ")}`;

  const result = await sendNotification({
    title,
    body,
    priority: "high",
    meta: {
      brewSessionId,
      recipeName: session.recipeName,
      event: group.flameout ? "boil_flameout" : "boil_addition",
      minutesRemaining: group.atMinutesRemaining,
      additions: additions.map((a) => ({ id: a.id, name: a.name, amount: a.amount, unit: a.unit })),
    },
  }, config);

  if (result.ok) logger.info({ brewSessionId, minutesRemaining: group.atMinutesRemaining }, "Boil alert sent");
  else logger.warn({ brewSessionId, error: result.error }, "Boil alert failed");
}

/** Rebuild the timeouts for one session from its stored timer state. */
export async function scheduleBoilAlerts(brewSessionId: number): Promise<void> {
  clearBoilAlerts(brewSessionId);

  const [session] = await db.select().from(brewSessionsTable).where(eq(brewSessionsTable.id, brewSessionId));
  if (!session || boilPhase(session) !== "running") return;

  const ingredients = await loadBoilIngredients(session.recipeId);
  const now = Date.now();
  const handles = upcomingBoilAlerts(session, ingredients, now).map(({ group, fireAt }) =>
    setTimeout(() => {
      fire(brewSessionId, group).catch((e) => logger.error({ e, brewSessionId }, "Boil alert errored"));
    }, fireAt - now),
  );
  if (handles.length) timers.set(brewSessionId, handles);
}

/** On boot: pick up any boil that was running when the server went down. */
export async function resumeBoilAlerts(): Promise<void> {
  const running = await db
    .select({ id: brewSessionsTable.id })
    .from(brewSessionsTable)
    .where(and(
      isNotNull(brewSessionsTable.boilStartedAt),
      isNull(brewSessionsTable.boilEndedAt),
      isNull(brewSessionsTable.boilPausedAt),
    ));
  for (const { id } of running) await scheduleBoilAlerts(id);
  if (running.length) logger.info({ count: running.length }, "Resumed boil timers");
}
