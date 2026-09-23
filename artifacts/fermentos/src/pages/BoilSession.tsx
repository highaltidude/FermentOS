import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, Check, Flame, Pause, Play, RotateCcw, Square, SunMedium } from "lucide-react";
import {
  useGetBrewSession,
  useGetRecipe,
  useListBrewSessions,
  useControlBoil,
  useGetNotificationSettings,
  getGetBrewSessionQueryKey,
  getGetRecipeQueryKey,
  getListBrewSessionsQueryKey,
  type BoilAction,
  type BrewSession,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  boilPhase,
  boilRemainingMs,
  boilAlertGroups,
  suggestedBoilMinutes,
  formatCountdown,
  type BoilAlertGroup,
} from "@/lib/boil";
import { unlockBoilAudio, boilBeep, boilVibrate, useWakeLock, wakeLockSupported } from "@/lib/boilAlerts";

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function groupLabel(g: BoilAlertGroup): string {
  return g.flameout ? "Flameout" : `${g.atMinutesRemaining} min`;
}

// ── /boil ─────────────────────────────────────────────────────────────────
// The launch target for the home-screen shortcut: jumps straight to the one
// brew-day session, or lets you pick when there are several.
export function BoilPicker() {
  const [, navigate] = useLocation();
  const { data: sessions, isLoading } = useListBrewSessions(
    { status: "brew_day" },
    { query: { queryKey: getListBrewSessionsQueryKey({ status: "brew_day" }) } },
  );

  // A running boil wins; otherwise go straight in only when there is no choice.
  const target = useMemo(() => {
    if (!sessions) return null;
    const live = sessions.filter((s) => ["running", "paused"].includes(boilPhase(s)));
    if (live.length === 1) return live[0]!;
    if (sessions.length === 1) return sessions[0]!;
    return null;
  }, [sessions]);

  useEffect(() => {
    if (target) navigate(`/brew-sessions/${target.id}/boil`, { replace: true });
  }, [target, navigate]);

  if (isLoading || target) {
    return <div className="p-6 max-w-xl mx-auto space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-24 w-full" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Flame className="w-5 h-5 text-orange-500" />
        <h1 className="text-xl font-bold text-foreground">Boil</h1>
      </div>

      {sessions && sessions.length > 1 ? (
        <div className="bg-card border border-card-border rounded-lg divide-y divide-border">
          <p className="px-4 py-3 text-sm text-muted-foreground">Which brew are you boiling?</p>
          {sessions.map((s) => (
            <Link key={s.id} href={`/brew-sessions/${s.id}/boil`}>
              <div className="px-4 py-3 hover:bg-muted cursor-pointer flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{s.recipeName}</span>
                <span className="text-xs text-muted-foreground">{boilPhase(s) === "idle" ? "Not started" : boilPhase(s)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-lg p-4 space-y-3">
          <p className="text-sm text-foreground">No brew session is on brew day.</p>
          <p className="text-xs text-muted-foreground">Start one from a recipe to get its hop schedule, or create a blank session.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/recipes"><Button size="sm">Pick a recipe</Button></Link>
            <Link href="/brew-sessions/new"><Button size="sm" variant="outline">New brew session</Button></Link>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Tip: open this page in your browser and use <span className="font-medium">Add to Home Screen</span> to get a
        one-tap Boil icon. On Android and desktop you can also long-press or right-click the installed FermentOS icon.
      </p>
    </div>
  );
}

// ── /brew-sessions/:id/boil ───────────────────────────────────────────────
export default function BoilSession() {
  const [, params] = useRoute("/brew-sessions/:id/boil");
  const id = Number(params?.id);
  const qc = useQueryClient();
  const { toast } = useToast();

  // Polling keeps a second device in step when the timer is driven elsewhere.
  const { data: session, isLoading } = useGetBrewSession(id, {
    query: { enabled: !!id, refetchInterval: 15_000, queryKey: getGetBrewSessionQueryKey(id) },
  });
  const recipeId = session?.recipeId ?? 0;
  const { data: recipe } = useGetRecipe(recipeId, {
    query: { enabled: !!recipeId, queryKey: getGetRecipeQueryKey(recipeId) },
  });
  const { data: notify } = useGetNotificationSettings();

  const phase = session ? boilPhase(session) : "idle";
  const now = useNow(phase === "running");
  const wakeLockHeld = useWakeLock(phase === "running" || phase === "paused");

  const ingredients = recipe?.ingredients ?? [];
  const suggested = recipe ? suggestedBoilMinutes(recipe.steps, recipe.ingredients) : 60;
  const [minutesInput, setMinutesInput] = useState<string>("");
  useEffect(() => {
    if (!minutesInput && recipe) setMinutesInput(String(suggested));
  }, [recipe, suggested, minutesInput]);

  const boilMinutes = session?.boilMinutes ?? (Number(minutesInput) || suggested);
  const groups = useMemo(() => boilAlertGroups(boilMinutes, ingredients), [boilMinutes, ingredients]);
  const remaining = session ? (phase === "idle" ? boilMinutes * 60_000 : boilRemainingMs(session, now)) : 0;
  const done = useMemo(() => new Set(session?.boilDoneAdditionIds ?? []), [session?.boilDoneAdditionIds]);

  const control = useControlBoil({
    mutation: {
      onSuccess: (updated: BrewSession) => {
        // POST returns the bare session; keep the readings/statusLog the GET had.
        qc.setQueryData(getGetBrewSessionQueryKey(id), (old: object | undefined) => ({ ...(old ?? {}), ...updated }));
        qc.invalidateQueries({ queryKey: getListBrewSessionsQueryKey() });
      },
      onError: (e: unknown) =>
        toast({ title: "Boil timer not updated", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
    },
  });
  const send = (action: BoilAction, extra: { boilMinutes?: number; doneAdditionIds?: number[] } = {}) =>
    control.mutate({ id, data: { action, ...extra } });

  // ── In-page alerts: fire when the countdown crosses a group's time ──────
  // Seeded with the current value, so opening the page mid-boil (or after a
  // reload) does not replay everything already passed.
  const prevRemaining = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== "running") { prevRemaining.current = null; return; }
    const prev = prevRemaining.current;
    prevRemaining.current = remaining;
    if (prev == null) return;
    for (const g of groups) {
      const at = g.atMinutesRemaining * 60_000;
      if (prev > at && remaining <= at) {
        const pending = g.additions.filter((a) => !done.has(a.id));
        if (!g.flameout && pending.length === 0) continue;
        boilBeep(g.flameout);
        boilVibrate(g.flameout);
        toast({
          // Long enough to still be there when you look up from the kettle.
          duration: 60_000,
          title: g.flameout ? "Flameout!" : `${g.atMinutesRemaining} min addition`,
          description: pending.length ? pending.map((a) => `${a.amount} ${a.unit} ${a.name}`).join(", ") : "Boil complete — time to chill.",
        });
      }
    }
  }, [remaining, phase, groups, done, toast]);

  const toggleDone = (ingredientId: number) => {
    const next = done.has(ingredientId) ? [...done].filter((x) => x !== ingredientId) : [...done, ingredientId];
    send("checklist", { doneAdditionIds: next });
  };

  if (isLoading || !session) {
    return <div className="p-6 max-w-xl mx-auto space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></div>;
  }

  const nextGroup = phase === "idle"
    ? undefined
    : groups.find((g) => g.atMinutesRemaining * 60_000 < remaining && (g.flameout || g.additions.some((a) => !done.has(a.id))));
  const dueNow = groups.filter((g) => !g.flameout && g.atMinutesRemaining * 60_000 >= remaining && g.additions.some((a) => !done.has(a.id)));
  const total = boilMinutes * 60_000;
  const progress = phase === "idle" ? 0 : Math.min(1, Math.max(0, 1 - remaining / total));
  const notifyOff = notify && (notify.channel === "none" || notify.boilAlerts === false);

  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/brew-sessions/${id}`}>
          <Button variant="ghost" size="sm" className="-ml-2"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground truncate">{session.recipeName}</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Flame className="w-3 h-3 text-orange-500" />Boil</p>
        </div>
      </div>

      {/* Countdown */}
      <div className="bg-card border border-card-border rounded-lg p-5 text-center space-y-3">
        <div
          className={`font-mono font-bold tabular-nums leading-none text-6xl sm:text-7xl ${
            remaining < 0 ? "text-destructive" : phase === "paused" ? "text-muted-foreground" : "text-foreground"
          }`}
          aria-live="off"
        >
          {formatCountdown(remaining)}
        </div>
        <div className="text-xs text-muted-foreground">
          {phase === "idle" && `${boilMinutes} minute boil`}
          {phase === "running" && (remaining < 0 ? "Past flameout" : "remaining")}
          {phase === "paused" && "Paused"}
          {phase === "ended" && "Boil complete"}
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-orange-500 transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
        </div>

        {phase === "idle" && (
          <div className="flex items-end gap-2 justify-center pt-1">
            <div className="text-left">
              <label className="text-xs text-muted-foreground mb-1 block">Boil length (min)</label>
              <Input
                type="number" min={1} max={600} inputMode="numeric" className="w-28"
                value={minutesInput} onChange={(e) => setMinutesInput(e.target.value)}
              />
            </div>
            <Button
              size="lg" className="flex-1 max-w-48"
              disabled={control.isPending || !(Number(minutesInput) >= 1)}
              onClick={() => { unlockBoilAudio(); send("start", { boilMinutes: Math.round(Number(minutesInput)) }); }}
            >
              <Play className="w-4 h-4 mr-1.5" />Start boil
            </Button>
          </div>
        )}

        {(phase === "running" || phase === "paused") && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            {phase === "running" ? (
              <Button size="lg" variant="outline" disabled={control.isPending} onClick={() => send("pause")}>
                <Pause className="w-4 h-4 mr-1.5" />Pause
              </Button>
            ) : (
              <Button size="lg" disabled={control.isPending} onClick={() => { unlockBoilAudio(); send("resume"); }}>
                <Play className="w-4 h-4 mr-1.5" />Resume
              </Button>
            )}
            <Button
              size="lg" variant={remaining <= 0 ? "default" : "outline"} disabled={control.isPending}
              onClick={() => { if (remaining <= 0 || window.confirm("End the boil now?")) send("finish"); }}
            >
              <Square className="w-4 h-4 mr-1.5" />Finish
            </Button>
          </div>
        )}

        {phase === "ended" && (
          <div className="flex flex-wrap gap-2 justify-center pt-1">
            <Link href={`/brew-sessions/${id}`}>
              <Button size="lg">Record OG &amp; notes</Button>
            </Link>
          </div>
        )}
      </div>

      {/* What to do now / next */}
      {dueNow.length > 0 && (phase === "running" || phase === "paused") && (
        <div className="bg-orange-500/10 border border-orange-500/40 rounded-lg px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Add now</p>
          <p className="text-sm text-foreground">
            {dueNow.flatMap((g) => g.additions.filter((a) => !done.has(a.id))).map((a) => `${a.amount} ${a.unit} ${a.name}`).join(", ")}
          </p>
        </div>
      )}
      {nextGroup && (phase === "running" || phase === "paused") && (
        <div className="bg-card border border-card-border rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Next · {groupLabel(nextGroup)}</p>
            <p className="text-sm font-medium text-foreground truncate">
              {nextGroup.additions.filter((a) => !done.has(a.id)).map((a) => `${a.amount} ${a.unit} ${a.name}`).join(", ") || "Boil complete"}
            </p>
          </div>
          <span className="font-mono tabular-nums text-sm text-muted-foreground shrink-0">
            in {formatCountdown(remaining - nextGroup.atMinutesRemaining * 60_000)}
          </span>
        </div>
      )}

      {/* Schedule / checklist */}
      <div className="bg-card border border-card-border rounded-lg">
        <div className="px-4 py-3 border-b border-card-border">
          <h2 className="text-sm font-semibold text-foreground">Additions</h2>
        </div>
        {groups.every((g) => g.additions.length === 0) ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            {session.recipeId
              ? "This recipe has no boil or whirlpool additions. Set an ingredient's use to Boil with a time to see it here."
              : "No recipe linked, so there is no hop schedule — the timer still counts down and alerts at flameout."}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {groups.filter((g) => g.additions.length > 0).map((g) => {
              const past = phase !== "idle" && g.atMinutesRemaining * 60_000 >= remaining;
              return (
                <div key={g.atMinutesRemaining} className="px-4 py-2.5 flex gap-3">
                  <span className={`w-16 shrink-0 text-xs font-semibold pt-1.5 ${past ? "text-orange-500" : "text-muted-foreground"}`}>
                    {groupLabel(g)}
                  </span>
                  <div className="flex-1 space-y-1">
                    {g.additions.map((a) => {
                      const on = done.has(a.id);
                      return (
                        <button
                          key={a.id} type="button" disabled={phase === "idle" || control.isPending}
                          onClick={() => toggleDone(a.id)}
                          className="w-full flex items-center gap-2.5 text-left py-1 disabled:cursor-default"
                        >
                          <span className={`h-5 w-5 rounded border-2 shrink-0 flex items-center justify-center ${on ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
                            {on && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                          </span>
                          <span className={`text-sm ${on ? "line-through text-muted-foreground" : "text-foreground"}`}>
                            {a.amount} {a.unit} {a.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Environment hints */}
      <div className="space-y-2 text-xs text-muted-foreground">
        {notifyOff && (
          <p className="flex items-start gap-1.5">
            <Bell className="w-3.5 h-3.5 mt-px shrink-0" />
            <span>
              Want alerts with your phone locked?{" "}
              <Link href="/settings"><span className="text-primary hover:underline cursor-pointer">Set up ntfy or a webhook</span></Link>{" "}
              in Settings → Notifications. Until then, keep this page open — it beeps at each addition.
            </span>
          </p>
        )}
        {(phase === "running" || phase === "paused") && !wakeLockHeld && (
          <p className="flex items-start gap-1.5">
            <SunMedium className="w-3.5 h-3.5 mt-px shrink-0" />
            <span>
              {wakeLockSupported()
                ? "Couldn't keep the screen on — your device may lock during the boil."
                : "Your screen may lock during the boil (keeping it awake needs FermentOS on HTTPS). The timer keeps running either way."}
            </span>
          </p>
        )}
        {phase !== "idle" && (
          <button
            type="button" className="flex items-center gap-1.5 hover:text-foreground"
            onClick={() => { if (window.confirm("Clear this boil timer and its checklist?")) send("reset"); }}
          >
            <RotateCcw className="w-3.5 h-3.5" />Reset timer
          </button>
        )}
      </div>
    </div>
  );
}
