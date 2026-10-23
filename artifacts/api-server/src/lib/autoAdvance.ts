/**
 * When a fermenting batch is moved on to Conditioning without the brewer.
 *
 * Import-free on purpose, like alertPolicy.ts, so it stays testable without
 * DATABASE_URL.
 */

/** A batch's own setting wins; null means it follows the global one. */
export function effectiveAutoAdvance(perBrew: boolean | null | undefined, global: boolean): boolean {
  return perBrew ?? global;
}

/**
 * `possibly_complete` already carries the attenuation and 24-hour flat-gravity
 * requirements (see fermentationInsights.ts), so this only adds the stage and
 * the on/off switch.
 */
export function shouldAutoAdvance(input: {
  status: string;
  perBrew: boolean | null | undefined;
  global: boolean;
  fermentationStatus: string | null | undefined;
}): boolean {
  return (
    input.status === "fermenting" &&
    effectiveAutoAdvance(input.perBrew, input.global) &&
    input.fermentationStatus === "possibly_complete"
  );
}

/**
 * Pulling a batch back from Conditioning to Fermenting is the brewer
 * overruling auto-advance. Unless the same request sets the per-batch switch
 * itself, it has to go off, or the next check would advance the batch again.
 */
export function overrulesAutoAdvance(input: {
  fromStatus: string;
  toStatus: string | undefined;
  perBrew: boolean | null | undefined;
  global: boolean;
  setsPerBrew: boolean;
}): boolean {
  return (
    input.fromStatus === "conditioning" &&
    input.toStatus === "fermenting" &&
    !input.setsPerBrew &&
    effectiveAutoAdvance(input.perBrew, input.global)
  );
}
