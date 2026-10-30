/**
 * Parsing for Shelly HTTP API responses: the Gen1 REST API (SHSW-1 and its
 * siblings) and the Gen2+ RPC API (Plus, Pro, Gen3, Gen4, The Pill).
 *
 * Kept free of network code so it can be unit tested: the driver in
 * services/shelly.ts does the fetching and hands the JSON to these.
 */
import { createHash } from "node:crypto";

export type ShellyInfo = {
  /** 1 for the Gen1 REST API; 2 or later for the RPC API, which they all share. */
  gen: number;
  /** Model code, e.g. "SHSW-1" or "S3SW-001X16EU". */
  type: string;
  /** Gen2+ application name, e.g. "Plus1" or "Pill". Null on Gen1. */
  app: string | null;
  mac: string | null;
  /** True when login is restricted: Basic auth on Gen1, digest auth on Gen2+. */
  auth: boolean;
  firmware: string | null;
};

export type ShellyStatus = {
  /** Relay state; null when the device has no relay on the requested channel. */
  ison: boolean | null;
  /** False for a sensor-only device, e.g. The Pill in OneWire mode. */
  hasRelay: boolean;
  /** How many relay channels the device has. */
  relayChannels: number;
  /** The first DS18B20 probe, in °C. Null when no probe is fitted. */
  tempC: number | null;
  rssi: number | null;
  uptimeSec: number | null;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** A DS18B20 that has lost contact reads -127 °C; treat that as no reading. */
const probeTemp = (v: unknown): number | null => {
  const t = numOrNull(v);
  return t != null && t > -100 ? t : null;
};

/**
 * GET /shelly, which answers without credentials on every generation. Gen2+
 * devices report a `gen` field; Gen1 doesn't. Returns null when the body isn't
 * a Shelly device description.
 */
export function parseShellyInfo(body: unknown): ShellyInfo | null {
  if (!isObject(body)) return null;
  if (typeof body.gen === "number" && body.gen >= 2 && typeof body.model === "string") {
    return {
      gen: body.gen,
      type: body.model,
      app: strOrNull(body.app),
      mac: strOrNull(body.mac),
      auth: body.auth_en === true,
      firmware: strOrNull(body.ver) ?? strOrNull(body.fw_id),
    };
  }
  if (typeof body.type !== "string") return null;
  return {
    gen: 1,
    type: body.type,
    app: null,
    mac: strOrNull(body.mac),
    auth: body.auth === true,
    firmware: strOrNull(body.fw),
  };
}

/** True for The Pill, which runs in one mode at a time (OneWire probe, SSR relays, …). */
export function isPill(info: ShellyInfo): boolean {
  return info.gen >= 2 && (info.app?.toLowerCase() === "pill" || /pill/i.test(info.type));
}

/** Pill.GetConfig. The mode is set in the Shelly app; FermentOS only reports it. */
export function parsePillMode(body: unknown): string | null {
  return isObject(body) ? strOrNull(body.mode) : null;
}

/** Gen1 GET /status. Returns null when the requested relay channel is missing. */
export function parseShellyStatus(body: unknown, channel = 0): ShellyStatus | null {
  if (!isObject(body) || !Array.isArray(body.relays)) return null;
  const relay = body.relays[channel];
  if (!isObject(relay) || typeof relay.ison !== "boolean") return null;

  // The add-on reports every slot, with an unplugged slot simply absent.
  let tempC: number | null = null;
  if (isObject(body.ext_temperature)) {
    const slot = body.ext_temperature["0"];
    if (isObject(slot)) tempC = probeTemp(slot.tC);
  }

  return {
    ison: relay.ison,
    hasRelay: true,
    relayChannels: body.relays.length,
    tempC,
    rssi: isObject(body.wifi_sta) ? numOrNull(body.wifi_sta.rssi) : null,
    uptimeSec: numOrNull(body.uptime),
  };
}

/** Numeric ids of a Gen2+ component type, e.g. "switch:0", "switch:1" → [0, 1]. */
function componentIds(body: Record<string, unknown>, type: string): number[] {
  const prefix = `${type}:`;
  return Object.keys(body)
    .filter((k) => k.startsWith(prefix) && /^\d+$/.test(k.slice(prefix.length)))
    .map((k) => Number(k.slice(prefix.length)))
    .sort((a, b) => a - b);
}

/**
 * Gen2+ Shelly.GetStatus: one key per component ("switch:0", "temperature:100",
 * "wifi", "sys"). A device without the requested switch is reported as having
 * no relay rather than rejected, since The Pill in OneWire mode is a probe
 * only. Returns null when the body isn't a Gen2+ status.
 */
export function parseShelly2Status(body: unknown, channel = 0): ShellyStatus | null {
  if (!isObject(body) || !isObject(body.sys)) return null;

  const relay = body[`switch:${channel}`];
  const ison = isObject(relay) && typeof relay.output === "boolean" ? relay.output : null;

  // Probes are numbered from 100 in the order they were found; read the first.
  const [firstProbe] = componentIds(body, "temperature");
  const probe = firstProbe != null ? body[`temperature:${firstProbe}`] : null;

  return {
    ison,
    hasRelay: ison != null,
    relayChannels: componentIds(body, "switch").length,
    tempC: isObject(probe) ? probeTemp(probe.tC) : null,
    rssi: isObject(body.wifi) ? numOrNull(body.wifi.rssi) : null,
    uptimeSec: numOrNull(body.sys.uptime),
  };
}

/**
 * Normalise what a user types as the device address into "host[:port]".
 * Accepts a bare IP or hostname, or a pasted URL ("http://192.168.1.40/").
 * Returns null for anything that isn't a plausible LAN address.
 */
export function normaliseShellyHost(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return /^[a-z0-9.-]+(:\d{1,5})?$/i.test(s) ? s.toLowerCase() : null;
}

/** Gen1 path for switching a relay; `timerSec` makes the device flip back on its own. */
export function relayPath(channel: number, on: boolean, timerSec?: number): string {
  const q = new URLSearchParams({ turn: on ? "on" : "off" });
  if (timerSec != null && timerSec > 0) q.set("timer", String(Math.round(timerSec)));
  return `/relay/${channel}?${q.toString()}`;
}

/** Gen2+ equivalent of relayPath: Switch.Set with `toggle_after`. */
export function switchSetPath(channel: number, on: boolean, timerSec?: number): string {
  const q = new URLSearchParams({ id: String(channel), on: String(on) });
  if (timerSec != null && timerSec > 0) q.set("toggle_after", String(Math.round(timerSec)));
  return `/rpc/Switch.Set?${q.toString()}`;
}

// ── Digest auth (Gen2+) ─────────────────────────────────────────────────────
// Gen2+ devices protect /rpc with RFC 7616 digest auth over SHA-256. The user
// is always "admin" and the realm is the device id.

export type DigestChallenge = { realm: string; nonce: string; opaque: string | null };

/** The WWW-Authenticate header of a 401. Null unless it's a SHA-256 digest challenge. */
export function parseDigestChallenge(header: string | null): DigestChallenge | null {
  if (!header || !/^digest\s/i.test(header)) return null;
  const params: Record<string, string> = {};
  for (const m of header.matchAll(/(\w+)=(?:"([^"]*)"|([^\s,]+))/g)) {
    params[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? "";
  }
  if (!params.realm || !params.nonce) return null;
  if (params.algorithm && params.algorithm.toUpperCase() !== "SHA-256") return null;
  return { realm: params.realm, nonce: params.nonce, opaque: params.opaque ?? null };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Authorization header answering a digest challenge, with qop=auth. */
export function digestAuthHeader(opts: {
  challenge: DigestChallenge;
  username: string;
  password: string;
  method: string;
  uri: string;
  cnonce: string;
  nc?: number;
}): string {
  const { challenge, username, password, method, uri, cnonce } = opts;
  const nc = (opts.nc ?? 1).toString(16).padStart(8, "0");
  const ha1 = sha256(`${username}:${challenge.realm}:${password}`);
  const ha2 = sha256(`${method}:${uri}`);
  const response = sha256(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`);
  const parts = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    "algorithm=SHA-256",
    `response="${response}"`,
    "qop=auth",
    `nc=${nc}`,
    `cnonce="${cnonce}"`,
  ];
  if (challenge.opaque != null) parts.push(`opaque="${challenge.opaque}"`);
  return `Digest ${parts.join(", ")}`;
}
