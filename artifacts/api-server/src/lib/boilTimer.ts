/**
 * Boil timer arithmetic, shared by the /boil route and the alert scheduler.
 *
 * The timer is stored as timestamps, never as a ticking counter, so the value
 * is the same no matter who asks or when: the page on your phone, the tab on
 * the laptop, and the scheduler rebuilding its timeouts after a restart.
 *
 * Import-free on purpose, like notifyIntervals.ts — anything reaching
 * `@workspace/db` throws at load without DATABASE_URL, which CI does not have.
 */

export type BoilState = {
  boilMinutes: number | null;
  boilStartedAt: Date | string | null;
  boilPausedAt: Date | string | null;
  boilPausedMs: number | null;
  boilEndedAt: Date | string | null;
};

export type BoilPhase = "idle" | "running" | "paused" | "ended";

export type BoilIngredient = {
  id: number;
  name: string;
  amount: number;
  unit: string;
  use: string | null;
  timingMinutes: number | null;
};

export type BoilAlertGroup = {
  /** Minutes left on the boil when this group is due. 0 is flameout. */
  atMinutesRemaining: number;
  additions: BoilIngredient[];
  flameout: boolean;
};

const ms = (d: Date | string) => new Date(d).getTime();

export function boilPhase(s: BoilState): BoilPhase {
  if (!s.boilStartedAt || s.boilMinutes == null) return "idle";
  if (s.boilEndedAt) return "ended";
  if (s.boilPausedAt) return "paused";
  return "running";
}

/** Boiling time so far, excluding every pause including the current one. */
export function boilElapsedMs(s: BoilState, now: number): number {
  if (!s.boilStartedAt) return 0;
  const until = s.boilEndedAt ? ms(s.boilEndedAt) : s.boilPausedAt ? ms(s.boilPausedAt) : now;
  return Math.max(0, until - ms(s.boilStartedAt) - (s.boilPausedMs ?? 0));
}

/** Negative once the boil has overrun, so the UI can show "+2:10". */
export function boilRemainingMs(s: BoilState, now: number): number {
  if (s.boilMinutes == null) return 0;
  return s.boilMinutes * 60_000 - boilElapsedMs(s, now);
}

/**
 * What to add, and when, grouped so three hops at 15 minutes are one alert
 * rather than three.
 *
 * Boil additions use timingMinutes as "minutes left in the boil", the usual
 * homebrew convention. One with no time, or a time longer than the boil, goes
 * in at the start. Whirlpool additions go in at flameout, which always gets a
 * group of its own, even an empty one, because "boil's done" is the alert that
 * matters most.
 */
export function boilAlertGroups(boilMinutes: number, ingredients: BoilIngredient[]): BoilAlertGroup[] {
  const byMinute = new Map<number, BoilIngredient[]>();
  const add = (minute: number, ing: BoilIngredient) => {
    const list = byMinute.get(minute) ?? [];
    list.push(ing);
    byMinute.set(minute, list);
  };

  for (const ing of ingredients) {
    if (ing.use === "boil") {
      const t = ing.timingMinutes == null ? boilMinutes : Math.min(Math.max(ing.timingMinutes, 0), boilMinutes);
      add(t, ing);
    } else if (ing.use === "whirlpool") {
      add(0, ing);
    }
  }
  if (!byMinute.has(0)) byMinute.set(0, []);

  return [...byMinute.entries()]
    .sort(([a], [b]) => b - a)
    .map(([minute, additions]) => ({ atMinutesRemaining: minute, additions, flameout: minute === 0 }));
}

/**
 * Groups that are still ahead of a running boil, with the wall-clock time each
 * one is due. Nothing is upcoming for a paused, ended or unstarted boil — the
 * scheduler clears its timeouts on pause and rebuilds them on resume.
 */
export function upcomingBoilAlerts(
  s: BoilState,
  ingredients: BoilIngredient[],
  now: number,
): { group: BoilAlertGroup; fireAt: number }[] {
  if (boilPhase(s) !== "running") return [];
  const remaining = boilRemainingMs(s, now);
  return boilAlertGroups(s.boilMinutes!, ingredients)
    .map((group) => ({ group, fireAt: now + remaining - group.atMinutesRemaining * 60_000 }))
    .filter(({ fireAt }) => fireAt > now);
}
