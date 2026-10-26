/**
 * Parsing for Shelly Gen1 HTTP API responses (SHSW-1 and its siblings).
 *
 * Kept import-free so it can be unit tested without the network: the driver
 * in services/shelly.ts does the fetching and hands the JSON to these.
 */

export type ShellyInfo = {
  /** Model code, e.g. "SHSW-1". */
  type: string;
  mac: string | null;
  /** True when restricted login is on and requests need Basic auth. */
  auth: boolean;
  firmware: string | null;
};

export type ShellyStatus = {
  ison: boolean;
  /** Add-on DS18B20 probe on sensor slot 0, in °C. Null when no probe is fitted. */
  tempC: number | null;
  rssi: number | null;
  uptimeSec: number | null;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** GET /shelly. Returns null when the body isn't a Gen1 device description. */
export function parseShellyInfo(body: unknown): ShellyInfo | null {
  if (!isObject(body) || typeof body.type !== "string") return null;
  return {
    type: body.type,
    mac: typeof body.mac === "string" ? body.mac : null,
    auth: body.auth === true,
    firmware: typeof body.fw === "string" ? body.fw : null,
  };
}

/** GET /status. Returns null when the requested relay channel is missing. */
export function parseShellyStatus(body: unknown, channel = 0): ShellyStatus | null {
  if (!isObject(body) || !Array.isArray(body.relays)) return null;
  const relay = body.relays[channel];
  if (!isObject(relay) || typeof relay.ison !== "boolean") return null;

  // The add-on reports every slot, with an unplugged slot simply absent. A
  // DS18B20 that has lost contact reads -127 °C; treat that as no reading
  // rather than a freezing fermenter.
  let tempC: number | null = null;
  if (isObject(body.ext_temperature)) {
    const slot = body.ext_temperature["0"];
    if (isObject(slot)) {
      const t = numOrNull(slot.tC);
      if (t != null && t > -100) tempC = t;
    }
  }

  return {
    ison: relay.ison,
    tempC,
    rssi: isObject(body.wifi_sta) ? numOrNull(body.wifi_sta.rssi) : null,
    uptimeSec: numOrNull(body.uptime),
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

/** Path for switching a relay; `timerSec` makes the device flip back on its own. */
export function relayPath(channel: number, on: boolean, timerSec?: number): string {
  const q = new URLSearchParams({ turn: on ? "on" : "off" });
  if (timerSec != null && timerSec > 0) q.set("timer", String(Math.round(timerSec)));
  return `/relay/${channel}?${q.toString()}`;
}
