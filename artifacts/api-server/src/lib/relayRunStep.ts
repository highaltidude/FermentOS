import type { RelayRunMode } from "@workspace/db";

/** What a relay was on for: the brew whose temperature drove it, and heating or cooling. */
export type RelayRunContext = { brewSessionId: number | null; mode: RelayRunMode | null };
export type OpenRelayRun = RelayRunContext & { id: number };

/**
 * What to do with a relay's run log given its new state.
 * - open: start a run.
 * - close: end the open run.
 * - reopen: end the open run and start another (it's now for a different brew or mode).
 * - adopt: give an open run with no context the one now known (the poller saw
 *   the relay come on a moment before the flow engine recorded switching it).
 * - noop: nothing changed (the "on" heartbeat every tick lands here).
 * Without a context (poller, manual switching) a relay that's already on keeps its run as it is.
 */
export function relayRunStep(
  open: OpenRelayRun | null,
  on: boolean,
  ctx?: RelayRunContext,
): "open" | "close" | "reopen" | "adopt" | "noop" {
  if (!on) return open ? "close" : "noop";
  if (!open) return "open";
  if (!ctx) return "noop";
  if (open.brewSessionId === ctx.brewSessionId && open.mode === ctx.mode) return "noop";
  if (open.brewSessionId == null && open.mode == null) return "adopt";
  return "reopen";
}

/**
 * When a run really ended. A relay switched on with a timer turns itself off
 * when it runs out, so an "off" noticed late (the device was unreachable, or
 * FermentOS was down) is moved back to that deadline, but never before the run began.
 */
export function relayRunEnd(atMs: number, startedMs: number, deadlineMs?: number | null): number {
  const end = deadlineMs != null ? Math.min(atMs, deadlineMs) : atMs;
  return Math.max(end, startedMs);
}
