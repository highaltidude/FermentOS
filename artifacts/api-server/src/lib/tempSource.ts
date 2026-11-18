/**
 * Which readings give a brew its temperature. With several fermenter sensors
 * on one brew (an iSpindel in the beer, a Shelly probe in a thermowell) each
 * sends its own temperature; a brew can pick one to go by. Gravity is not
 * affected: it comes from whichever sensor measures it.
 *
 * The choice only counts while that sensor has readings among the ones given.
 * Otherwise (it was deleted, or switched to Reference so its readings left
 * the brew's fermentation data) the brew goes back to every sensor rather
 * than showing no temperature at all.
 */

/** The chosen sensor, if it is among the readings; null for every sensor. */
export function effectiveTempSensor<T>(
  readings: readonly T[],
  tempSensorId: number | null | undefined,
  deviceOf: (r: T) => number | null | undefined,
): number | null {
  if (tempSensorId == null) return null;
  return readings.some((r) => deviceOf(r) === tempSensorId) ? tempSensorId : null;
}

/**
 * The readings whose temperature counts: all of them with no sensor chosen,
 * otherwise the chosen sensor's, plus any reading that came from no sensor
 * (one entered by hand).
 */
export function tempReadings<T>(
  readings: readonly T[],
  tempSensorId: number | null | undefined,
  deviceOf: (r: T) => number | null | undefined,
): T[] {
  const chosen = effectiveTempSensor(readings, tempSensorId, deviceOf);
  if (chosen == null) return [...readings];
  return readings.filter((r) => {
    const d = deviceOf(r);
    return d == null || d === chosen;
  });
}
