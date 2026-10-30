import { randomBytes } from "node:crypto";
import {
  parseShellyInfo,
  parseShellyStatus,
  parseShelly2Status,
  parsePillMode,
  parseDigestChallenge,
  digestAuthHeader,
  relayPath,
  switchSetPath,
  type ShellyInfo,
  type ShellyStatus,
} from "../lib/shellyParse.js";

/**
 * Shelly HTTP driver for both API generations: the Gen1 REST API (SHSW-1) and
 * the Gen2+ RPC API (Plus, Pro, Gen3, Gen4, The Pill). Every call is a single
 * GET against the device on the LAN with a short timeout, and none of them
 * throw: a dead relay must not take a request handler or the poller down
 * with it.
 */

export type ShellyTarget = {
  host: string;
  /** Which API to speak; Gen1 when omitted. */
  deviceType?: "shelly_gen1" | "shelly_gen2";
  channel?: number;
  username?: string | null;
  password?: string | null;
};

export type ShellyResult<T> =
  | { ok: true; value: T }
  /** `code` is the Gen2+ RPC error code, when the device sent one. */
  | { ok: false; reason: string; code?: number };

const TIMEOUT_MS = 3000;
/** Gen2+ RPC error for an argument naming something that doesn't exist, e.g. a missing switch id. */
const RPC_INVALID_ARGUMENT = -105;
/** Gen2+ digest auth always uses this user. */
const GEN2_USER = "admin";

const isGen2 = (target: ShellyTarget) => target.deviceType === "shelly_gen2";

async function send(url: string, headers: Record<string, string>): Promise<Response | string> {
  try {
    return await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const name = (err as Error)?.name;
    return name === "TimeoutError" || name === "AbortError" ? "Device did not respond" : "Could not reach device";
  }
}

async function shellyGet(target: ShellyTarget, path: string): Promise<ShellyResult<unknown>> {
  const url = `http://${target.host}${path}`;
  const headers: Record<string, string> = {};
  if (!isGen2(target) && (target.username || target.password)) {
    const token = Buffer.from(`${target.username ?? ""}:${target.password ?? ""}`).toString("base64");
    headers["Authorization"] = `Basic ${token}`;
  }

  let res = await send(url, headers);
  // Gen2+ answers a protected call with a digest challenge; answer it once.
  if (typeof res !== "string" && res.status === 401 && isGen2(target) && target.password) {
    const challenge = parseDigestChallenge(res.headers.get("www-authenticate"));
    if (challenge) {
      headers["Authorization"] = digestAuthHeader({
        challenge,
        username: GEN2_USER,
        password: target.password,
        method: "GET",
        uri: path,
        cnonce: randomBytes(8).toString("hex"),
      });
      res = await send(url, headers);
    }
  }

  if (typeof res === "string") return { ok: false, reason: res };
  if (res.status === 401) return { ok: false, reason: "Device rejected the username or password" };
  if (!res.ok) {
    // Gen2+ explains a refused call as {code, message}.
    const body = (await res.json().catch(() => null)) as { code?: unknown; message?: unknown } | null;
    if (body && typeof body.message === "string") {
      return { ok: false, reason: `Device refused the request: ${body.message}`, code: typeof body.code === "number" ? body.code : undefined };
    }
    return { ok: false, reason: `Device returned HTTP ${res.status}` };
  }
  try {
    return { ok: true, value: await res.json() };
  } catch {
    return { ok: false, reason: "Unexpected response from device" };
  }
}

/** GET /shelly — works without credentials on every generation, and tells them apart. */
export async function probeShelly(target: ShellyTarget): Promise<ShellyResult<ShellyInfo>> {
  const r = await shellyGet(target, "/shelly");
  if (!r.ok) return r;
  const info = parseShellyInfo(r.value);
  return info ? { ok: true, value: info } : { ok: false, reason: "Not a Shelly device" };
}

export async function getShellyStatus(target: ShellyTarget): Promise<ShellyResult<ShellyStatus>> {
  const channel = target.channel ?? 0;
  const r = await shellyGet(target, isGen2(target) ? "/rpc/Shelly.GetStatus" : "/status");
  if (!r.ok) return r;
  const status = isGen2(target) ? parseShelly2Status(r.value, channel) : parseShellyStatus(r.value, channel);
  return status ? { ok: true, value: status } : { ok: false, reason: "Unexpected status response" };
}

/** The Pill's mode ("onewire", "ssr", …), as set in the Shelly app. */
export async function getPillMode(target: ShellyTarget): Promise<ShellyResult<string | null>> {
  const r = await shellyGet({ ...target, deviceType: "shelly_gen2" }, "/rpc/Pill.GetConfig");
  return r.ok ? { ok: true, value: parsePillMode(r.value) } : r;
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
  const channel = target.channel ?? 0;
  if (isGen2(target)) {
    const r = await shellyGet(target, switchSetPath(channel, on, timerSec));
    if (!r.ok) {
      return r.code === RPC_INVALID_ARGUMENT
        ? { ok: false, reason: `This device has no relay on channel ${channel} (is The Pill in OneWire mode?)` }
        : r;
    }
    // Switch.Set answers {was_on}; a successful call means the output is now `on`.
    return { ok: true, value: on };
  }
  const r = await shellyGet(target, relayPath(channel, on, timerSec));
  if (!r.ok) return r;
  const ison = (r.value as { ison?: unknown })?.ison;
  return typeof ison === "boolean" ? { ok: true, value: ison } : { ok: false, reason: "Unexpected relay response" };
}

/** Come back off after a power cut rather than restoring the last state. */
export async function applyShellySafeDefaults(target: ShellyTarget): Promise<ShellyResult<true>> {
  const channel = target.channel ?? 0;
  const path = isGen2(target)
    ? `/rpc/Switch.SetConfig?id=${channel}&config=${encodeURIComponent(JSON.stringify({ initial_state: "off" }))}`
    : `/settings/relay/${channel}?default_state=off`;
  const r = await shellyGet(target, path);
  return r.ok ? { ok: true, value: true } : r;
}
