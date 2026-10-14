/**
 * Dry hop schedule, shared by the /dry-hops routes and the alert monitor so the
 * page and the notifications can never disagree about what is due.
 *
 * A recipe's dry hops each carry a day (dryHopDay) counted from when the batch
 * entered conditioning, 0 being that day. Once the day is reached the addition
 * is due, and stays due — reminding on every repeat — until it is marked added.
 *
 * Import-free on purpose, like boilTimer.ts — anything reaching `@workspace/db`
 * throws at load without DATABASE_URL, which CI does not have.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export type DryHopIngredient = {
  id: number;
  name: string;
  amount: number;
  unit: string;
  use: string | null;
  dryHopDay: number | null;
};

export type DryHopStatus = "scheduled" | "due" | "added";

export type DryHopItem = {
  ingredientId: number;
  name: string;
  amount: number;
  unit: string;
  day: number;
  /** Null until the batch has entered conditioning. */
  dueAt: Date | null;
  status: DryHopStatus;
};

export type DryHopState = {
  /** When the batch last entered conditioning, from the status log. */
  conditioningStartedAt: Date | string | null;
  /**
   * Whether the batch is in conditioning right now. Nothing is due outside it:
   * a batch moved back to fermenting, or already packaged, is not nagged.
   */
  inConditioning: boolean;
  addedIds: readonly number[] | null;
};

export function dryHopSchedule(ingredients: readonly DryHopIngredient[], state: DryHopState, now: number): DryHopItem[] {
  const start = state.conditioningStartedAt == null ? null : new Date(state.conditioningStartedAt).getTime();
  const added = new Set(state.addedIds ?? []);

  return ingredients
    .filter((ing): ing is DryHopIngredient & { dryHopDay: number } => ing.use === "dry_hop" && ing.dryHopDay != null)
    .map((ing) => {
      const day = Math.max(ing.dryHopDay, 0);
      const dueAt = start == null ? null : new Date(start + day * DAY_MS);
      const status: DryHopStatus = added.has(ing.id)
        ? "added"
        : state.inConditioning && dueAt != null && now >= dueAt.getTime() ? "due" : "scheduled";
      return { ingredientId: ing.id, name: ing.name, amount: ing.amount, unit: ing.unit, day, dueAt, status };
    })
    .sort((a, b) => a.day - b.day || a.ingredientId - b.ingredientId);
}

/**
 * brew_alert_state is keyed by (session, alertType), so each day gets its own
 * alert type: a day 3 and a day 5 addition notify and repeat independently, and
 * two hops on the same day share one notification.
 */
const ALERT_PREFIX = "dry_hop_day_";

export function dryHopAlertType(day: number): string {
  return `${ALERT_PREFIX}${day}`;
}

export function isDryHopAlertType(alertType: string): boolean {
  return alertType.startsWith(ALERT_PREFIX);
}

export type DryHopAlertGroup = {
  day: number;
  alertType: string;
  additions: DryHopItem[];
};

/** The additions that are due and not yet added, one group per day. */
export function dueDryHopGroups(items: readonly DryHopItem[]): DryHopAlertGroup[] {
  const byDay = new Map<number, DryHopItem[]>();
  for (const item of items) {
    if (item.status !== "due") continue;
    byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, additions]) => ({ day, alertType: dryHopAlertType(day), additions }));
}

export function dryHopAlertMessage(group: DryHopAlertGroup): string {
  const list = group.additions.map((a) => `${a.amount} ${a.unit} ${a.name}`).join(", ");
  return `Day ${group.day} of conditioning — add ${list}. Mark it added in FermentOS to stop these reminders.`;
}
