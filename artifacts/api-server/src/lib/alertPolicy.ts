/**
 * Per-type rules for when an alert is worth sending at all.
 *
 * A stalled ferment is a "go and look at it" event, not a live condition to
 * nag about. Once gravity has finished falling it stays flat for the rest of
 * the batch, so repeating the alert (or re-sending it every time a ±0.001
 * wobble briefly clears it) only trains the user to ignore it. It is also only
 * meaningful while the batch is fermenting: on brew day there is nothing to
 * measure yet, and in conditioning flat gravity is the expected outcome.
 *
 * Import-free on purpose, like notifyIntervals.ts, so it stays testable without
 * DATABASE_URL.
 */
export function alertAppliesToStatus(alertType: string, status: string): boolean {
  if (alertType === "gravity_stalled") return status === "fermenting";
  return true;
}

/**
 * Which temperature range applies at a given stage. Conditioning has its own
 * optional range because many beers deliberately leave the fermentation range
 * there — a cold crash, lagering, warm carbonation. Every other stage uses the
 * fermentation range.
 */
export function activeTempPhase(status: string): "fermenting" | "conditioning" {
  return status === "conditioning" ? "conditioning" : "fermenting";
}

/** Alerts that come from the brew (its range and its gravity), not the device. */
const BREW_ALERT_TYPES = new Set(["temp_out_of_range", "gravity_stalled"]);

/**
 * The alerts that hold for a brew in its current stage — what the alert
 * monitor would act on, minus its debounce and repeat bookkeeping. Used where
 * alerts are reported per device (the Home Assistant endpoint): device alerts
 * always count, brew alerts only while the brew is active and only when they
 * apply to its stage. `active` is passed in because ACTIVE_BREW_STATUSES lives
 * in @workspace/db, which this file must not import.
 */
export function alertsForBrew<A extends { type: string }>(
  alerts: A[],
  brew: { status: string | null | undefined; active: boolean },
): A[] {
  return alerts.filter((a) => {
    if (!BREW_ALERT_TYPES.has(a.type)) return true;
    return brew.active && brew.status != null && alertAppliesToStatus(a.type, brew.status);
  });
}

/** Types sent at most once per brew session, ignoring the repeat interval. */
export function notifiesOncePerBrew(alertType: string): boolean {
  return alertType === "gravity_stalled";
}
