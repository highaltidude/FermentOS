import { useEffect, useState } from "react";

/**
 * In-page boil alerts: a beep, a buzz, and keeping the screen awake.
 *
 * Everything here degrades quietly. Over plain HTTP (the usual LAN install)
 * there is no Wake Lock, and iOS has no vibration, so the page leans on sound
 * while it is open and on the server's ntfy/webhook alerts once it is not.
 */

let audioCtx: AudioContext | null = null;

/**
 * Browsers only let a page make sound after a tap, so this has to run inside
 * the Start/Resume click handler. Later beeps from a timer then work.
 */
export function unlockBoilAudio(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

/** Three short beeps, or five for flameout. */
export function boilBeep(flameout = false): void {
  if (!audioCtx) return;
  try {
    const count = flameout ? 5 : 3;
    const start = audioCtx.currentTime + 0.05;
    for (let i = 0; i < count; i++) {
      const t = start + i * 0.35;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = flameout ? 660 : 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    }
  } catch {
    // An audio failure must never break the timer.
  }
}

export function boilVibrate(flameout = false): void {
  try {
    navigator.vibrate?.(flameout ? [400, 150, 400, 150, 400] : [250, 120, 250]);
  } catch {
    // Unsupported (iOS) or blocked — nothing to do.
  }
}

export const wakeLockSupported = (): boolean =>
  typeof navigator !== "undefined" && "wakeLock" in navigator && window.isSecureContext;

/**
 * Holds a screen wake lock while `active`. The browser drops the lock whenever
 * the page is hidden, so it is re-requested each time the page comes back.
 * Returns whether a lock is currently held.
 */
export function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active || !wakeLockSupported()) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) { void sentinel.release(); return; }
        setHeld(true);
        sentinel.addEventListener("release", () => setHeld(false));
      } catch {
        setHeld(false);
      }
    };

    const onVisible = () => { if (!sentinel || sentinel.released) void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
      setHeld(false);
    };
  }, [active]);

  return held;
}
