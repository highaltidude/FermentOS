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

/** Types sent at most once per brew session, ignoring the repeat interval. */
export function notifiesOncePerBrew(alertType: string): boolean {
  return alertType === "gravity_stalled";
}
