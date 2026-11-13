/**
 * A sensor on a brew is either a "fermenter" sensor, whose readings are the
 * brew's fermentation data (chart, alerts, insights), or a "reference" sensor
 * (ice bath, room, chamber) charted on its own and kept out of all that.
 *
 * Import-free so it can be unit tested directly.
 */

export type SensorRole = "fermenter" | "reference";

/**
 * Split a brew's assignment windows by role: fermenter windows in their given
 * order, and reference windows grouped per device in order of first appearance,
 * so each reference sensor gets its own chart.
 */
export function splitAssignmentsByRole<A extends { deviceId: number; role: SensorRole }>(
  assignments: A[],
): { fermenter: A[]; reference: Map<number, A[]> } {
  const fermenter: A[] = [];
  const reference = new Map<number, A[]>();
  for (const a of assignments) {
    if (a.role === "reference") reference.set(a.deviceId, [...(reference.get(a.deviceId) ?? []), a]);
    else fermenter.push(a);
  }
  return { fermenter, reference };
}
