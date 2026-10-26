import {
  parseShellyInfo,
  parseShellyStatus,
  relayPath,
  type ShellyInfo,
  type ShellyStatus,
} from "../lib/shellyParse.js";

/**
 * Shelly Gen1 HTTP driver. Every call is a single GET against the device on
 * the LAN with a short timeout, and none of them throw: a dead relay must not
 * take a request handler or the poller down with it.
 */

export type ShellyTarget = {
  host: string;
  channel?: number;
  username?: string | null;
  password?: string | null;
};

export type ShellyResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const TIMEOUT_MS = 3000;

async function shellyGet(target: ShellyTarget, path: string): Promise<ShellyResult<unknown>> {
  const headers: Record<string, string> = {};
  if (target.username || target.password) {
    const token = Buffer.from(`${target.username ?? ""}:${target.password ?? ""}`).toString("base64");
    headers["Authorization"] = `Basic ${token}`;
  }
  try {
    const res = await fetch(`http://${target.host}${path}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401) return { ok: false, reason: "Device rejected the username or password" };
    if (!res.ok) return { ok: false, reason: `Device returned HTTP ${res.status}` };
    return { ok: true, value: await res.json() };
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, reason: "Device did not respond" };
    }
    return { ok: false, reason: "Could not reach device" };
  }
}

/** GET /shelly — works without credentials even when login is restricted. */
export async function probeShelly(target: ShellyTarget): Promise<ShellyResult<ShellyInfo>> {
  const r = await shellyGet(target, "/shelly");
  if (!r.ok) return r;
  const info = parseShellyInfo(r.value);
  return info ? { ok: true, value: info } : { ok: false, reason: "Not a Shelly Gen1 device" };
}

export async function getShellyStatus(target: ShellyTarget): Promise<ShellyResult<ShellyStatus>> {
  const r = await shellyGet(target, "/status");
  if (!r.ok) return r;
  const status = parseShellyStatus(r.value, target.channel ?? 0);
  return status ? { ok: true, value: status } : { ok: false, reason: "Unexpected status response" };
}

/**
 * Switch the relay. With `timerSec` the device turns itself back after that
 * many seconds — automations always pass one when turning on, so the relay
 * can't be left on if FermentOS stops sending.
 */
export async function setShellyRelay(
  target: ShellyTarget,
  on: boolean,
  timerSec?: number,
): Promise<ShellyResult<boolean>> {
  const r = await shellyGet(target, relayPath(target.channel ?? 0, on, timerSec));
  if (!r.ok) return r;
  const ison = (r.value as { ison?: unknown })?.ison;
  return typeof ison === "boolean" ? { ok: true, value: ison } : { ok: false, reason: "Unexpected relay response" };
}

/** Come back off after a power cut rather than restoring the last state. */
export async function applyShellySafeDefaults(target: ShellyTarget): Promise<ShellyResult<true>> {
  const r = await shellyGet(target, `/settings/relay/${target.channel ?? 0}?default_state=off`);
  return r.ok ? { ok: true, value: true } : r;
}
