import { getConfigValue, setConfigValue } from "./appConfig";

const KEY = "temp_alert_consecutive_readings";
const DEFAULT = 2;
export const MIN_TEMP_ALERT_READINGS = 2;
export const MAX_TEMP_ALERT_READINGS = 10;

/**
 * Consecutive out-of-range readings required before the first temperature
 * notification — shown in the UI as "Temperature Alert Threshold: N readings".
 * Anything missing or outside 2–10 falls back to the default.
 *
 * Counted in readings, not monitor ticks. The alert monitor runs every 5
 * minutes but an iSpindel typically reports every 30, so counting ticks would
 * fire after ~10 minutes on the strength of a single reading — far sooner than
 * the setting promises.
 */
export async function getTempAlertReadings(): Promise<number> {
  const value = await getConfigValue(KEY);
  const parsed = value ? parseInt(value, 10) : DEFAULT;
  return Number.isFinite(parsed) && parsed >= MIN_TEMP_ALERT_READINGS && parsed <= MAX_TEMP_ALERT_READINGS
    ? parsed
    : DEFAULT;
}

export async function setTempAlertReadings(count: number): Promise<void> {
  await setConfigValue(KEY, String(count));
}
