import type { ThermostatConfig } from "./nodes.js";

/**
 * One control step of an on/off thermostat with hysteresis and minimum
 * on/off times.
 *
 * Heating: switch on at or below setpoint − hysteresis, off once back at the
 * setpoint. Cooling mirrors it above the setpoint. The minimum times hold the
 * current state a little longer — chiefly so a fridge compressor isn't
 * restarted moments after it stopped.
 *
 * Fail-safe (no or stale temperature) is the caller's job: it forces the relay
 * off without consulting this, ignoring the minimum on time.
 */

export type RelayTiming = {
  on: boolean;
  /** ms epoch of the last switch FermentOS made; null when unknown (e.g. after a restart). */
  since: number | null;
};

export type ThermostatReason = "heating" | "cooling" | "idle" | "holding_min_on" | "holding_min_off";

export type ThermostatStep = { on: boolean; reason: ThermostatReason };

export function thermostatStep(cfg: ThermostatConfig, tempC: number, relay: RelayTiming, now: number): ThermostatStep {
  const heat = cfg.mode === "heat";
  const want = relay.on
    ? (heat ? tempC < cfg.setpointC : tempC > cfg.setpointC)
    : (heat ? tempC <= cfg.setpointC - cfg.hysteresisC : tempC >= cfg.setpointC + cfg.hysteresisC);

  const active: ThermostatReason = heat ? "heating" : "cooling";
  if (want === relay.on) return { on: want, reason: want ? active : "idle" };

  const elapsedSec = relay.since == null ? Infinity : (now - relay.since) / 1000;
  if (relay.on && elapsedSec < cfg.minOnSec) return { on: true, reason: "holding_min_on" };
  if (!relay.on && elapsedSec < cfg.minOffSec) return { on: false, reason: "holding_min_off" };
  return { on: want, reason: want ? active : "idle" };
}
