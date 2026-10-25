/**
 * The brew_alert_state arithmetic behind recordFiringAlert: given the stored
 * row (if any) and this tick's state, what to store and whether to send.
 *
 * Import-free on purpose, like alertPolicy.ts, so it stays testable without
 * DATABASE_URL.
 */

/** The fields of a brew_alert_state row the decision reads. */
export type PriorAlertState = {
  seenCount: number;
  firstSeenAt: Date;
  lastNotifiedAt: Date | null;
  resolvedAt: Date | null;
};

export type AlertDecisionInput = {
  prior: PriorAlertState | undefined;
  now: Date;
  repeatMs: number;
  /** Keeps its send time through a recurrence, so it is only ever sent once. */
  oncePerBrew: boolean;
  /** False while a condition is still being confirmed; recorded but not sent. */
  debounced: boolean;
};

export type AlertDecision = {
  seenCount: number;
  firstSeenAt: Date;
  /** The send time before this tick: stored as-is when not sending, and restored if a send fails. */
  lastNotifiedAt: Date | null;
  shouldNotify: boolean;
};

export function decideFiringAlert(a: AlertDecisionInput): AlertDecision {
  const { prior, now } = a;

  // A previously resolved row starts over rather than resuming its old
  // seen count, so a recurrence is treated as a fresh incident.
  const resuming = prior && prior.resolvedAt != null;
  const seenCount = !prior || resuming ? 1 : prior.seenCount + 1;
  const lastNotifiedAt = resuming && !a.oncePerBrew ? null : prior?.lastNotifiedAt ?? null;

  const dueForRepeat = !a.oncePerBrew && lastNotifiedAt != null && now.getTime() - new Date(lastNotifiedAt).getTime() >= a.repeatMs;
  const shouldNotify = a.debounced && (lastNotifiedAt == null || dueForRepeat);
  const firstSeenAt = !prior || resuming ? now : prior.firstSeenAt;

  return { seenCount, firstSeenAt, lastNotifiedAt, shouldNotify };
}
