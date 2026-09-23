import type { BrewSession, RecipeIngredient, RecipeStep } from "@workspace/api-client-react";

/**
 * Boil timer arithmetic for the page. Mirrors
 * artifacts/api-server/src/lib/boilTimer.ts, which schedules the ntfy/webhook
 * alerts from the same stored timestamps, so keep the two in step: if they
 * disagree, the phone buzzes at a different moment from the page.
 */

export type BoilPhase = "idle" | "running" | "paused" | "ended";

type BoilFields = Pick<BrewSession, "boilMinutes" | "boilStartedAt" | "boilPausedAt" | "boilPausedMs" | "boilEndedAt">;

export type BoilAlertGroup = {
  /** Minutes left on the boil when this group is due. 0 is flameout. */
  atMinutesRemaining: number;
  additions: RecipeIngredient[];
  flameout: boolean;
};

const ms = (d: string) => new Date(d).getTime();

export function boilPhase(s: BoilFields): BoilPhase {
  if (!s.boilStartedAt || s.boilMinutes == null) return "idle";
  if (s.boilEndedAt) return "ended";
  if (s.boilPausedAt) return "paused";
  return "running";
}

function boilElapsedMs(s: BoilFields, now: number): number {
  if (!s.boilStartedAt) return 0;
  const until = s.boilEndedAt ? ms(s.boilEndedAt) : s.boilPausedAt ? ms(s.boilPausedAt) : now;
  return Math.max(0, until - ms(s.boilStartedAt) - (s.boilPausedMs ?? 0));
}

/** Negative once the boil has overrun. */
export function boilRemainingMs(s: BoilFields, now: number): number {
  if (s.boilMinutes == null) return 0;
  return s.boilMinutes * 60_000 - boilElapsedMs(s, now);
}

export function boilAlertGroups(boilMinutes: number, ingredients: RecipeIngredient[]): BoilAlertGroup[] {
  const byMinute = new Map<number, RecipeIngredient[]>();
  const add = (minute: number, ing: RecipeIngredient) => {
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
 * Best guess at the boil length before one is entered: an explicit boil step,
 * then the earliest boil addition, then the usual hour.
 */
export function suggestedBoilMinutes(steps: RecipeStep[], ingredients: RecipeIngredient[]): number {
  const step = steps.find((s) => s.phase === "boil" && s.durationMinutes != null && s.durationMinutes > 0);
  if (step?.durationMinutes) return step.durationMinutes;
  const longest = Math.max(0, ...ingredients.filter((i) => i.use === "boil").map((i) => i.timingMinutes ?? 0));
  return longest > 0 ? longest : 60;
}

/** 5400000 → "90:00", -130000 → "+2:10". */
export function formatCountdown(remainingMs: number): string {
  const over = remainingMs < 0;
  // Round up while counting down so "0:00" only shows at flameout.
  const totalSec = over ? Math.floor(-remainingMs / 1000) : Math.ceil(remainingMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${over ? "+" : ""}${m}:${String(s).padStart(2, "0")}`;
}
