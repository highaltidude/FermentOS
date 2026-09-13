/**
 * Which re-notify interval applies to a given alert.
 *
 * Temperature is the one condition you can act on the moment you hear about it —
 * go and adjust the fermenter — so it earns a shorter leash than a low battery
 * or a stalled ferment, which only nag if reminded often.
 *
 * A null override means inherit the global interval. That is the default, and it
 * is what keeps an upgrade from changing anyone's existing behaviour: someone
 * who had set 12 hours keeps getting 12-hour temperature reminders until they
 * deliberately choose otherwise.
 *
 * Takes plain values rather than the NotifyConfig type on purpose. Importing
 * from services/notifications.ts would drag in `@workspace/db`, which throws at
 * module load without DATABASE_URL — and a test reaching that is what broke CI
 * on a86cc20. Import-free keeps this directly testable.
 */
export function resolveRepeatHours(
  alertType: string,
  globalHours: number,
  tempOverride: number | null,
): number {
  return alertType === "temp_out_of_range" && tempOverride != null ? tempOverride : globalHours;
}
