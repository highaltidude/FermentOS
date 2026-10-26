import { describe, it, expect } from "vitest";
import { parseShellyInfo, parseShellyStatus, normaliseShellyHost, relayPath } from "./src/lib/shellyParse.js";

// Trimmed from a real SHSW-1 (firmware 1.14) with the temperature add-on fitted.
const statusWithProbe = {
  wifi_sta: { connected: true, ssid: "brewery", ip: "192.168.1.40", rssi: -61 },
  relays: [{ ison: true, has_timer: true, timer_started: 1761400000, timer_duration: 90, timer_remaining: 72, source: "http" }],
  ext_sensors: { temperature_unit: "C" },
  ext_temperature: { "0": { hwID: "28ff6a1c01160485", tC: 19.4, tF: 66.92 } },
  uptime: 86512,
};

describe("parseShellyStatus", () => {
  it("reads relay state, probe temperature, rssi and uptime", () => {
    expect(parseShellyStatus(statusWithProbe)).toEqual({ ison: true, tempC: 19.4, rssi: -61, uptimeSec: 86512 });
  });

  it("gives a null temperature when no add-on is fitted", () => {
    const { ext_temperature: _, ...noProbe } = statusWithProbe;
    expect(parseShellyStatus(noProbe)?.tempC).toBeNull();
    expect(parseShellyStatus({ ...statusWithProbe, ext_temperature: {} })?.tempC).toBeNull();
  });

  it("treats a disconnected DS18B20 (-127 °C) as no reading", () => {
    const body = { ...statusWithProbe, ext_temperature: { "0": { tC: -127, tF: -196.6 } } };
    expect(parseShellyStatus(body)?.tempC).toBeNull();
  });

  it("returns null when the requested channel doesn't exist", () => {
    expect(parseShellyStatus(statusWithProbe, 1)).toBeNull();
  });

  it("returns null for bodies that aren't a Gen1 status", () => {
    expect(parseShellyStatus(null)).toBeNull();
    expect(parseShellyStatus({ relays: [{}] })).toBeNull();
    expect(parseShellyStatus({ "switch:0": { output: true } })).toBeNull(); // Gen2 shape
  });
});

describe("parseShellyInfo", () => {
  it("reads model, mac, auth and firmware", () => {
    const body = { type: "SHSW-1", mac: "A4CF12F45A1B", auth: true, fw: "20230913-112003/v1.14.0-gcb84623" };
    expect(parseShellyInfo(body)).toEqual({
      type: "SHSW-1",
      mac: "A4CF12F45A1B",
      auth: true,
      firmware: "20230913-112003/v1.14.0-gcb84623",
    });
  });

  it("rejects responses without a type", () => {
    expect(parseShellyInfo({ name: "router" })).toBeNull();
    expect(parseShellyInfo("<html>")).toBeNull();
  });
});

describe("normaliseShellyHost", () => {
  it("accepts IPs, hostnames and pasted URLs", () => {
    expect(normaliseShellyHost("192.168.1.40")).toBe("192.168.1.40");
    expect(normaliseShellyHost("  http://192.168.1.40/  ")).toBe("192.168.1.40");
    expect(normaliseShellyHost("Shelly1-A4CF12.local")).toBe("shelly1-a4cf12.local");
    expect(normaliseShellyHost("192.168.1.40:8081")).toBe("192.168.1.40:8081");
  });

  it("rejects empty or odd input", () => {
    expect(normaliseShellyHost("")).toBeNull();
    expect(normaliseShellyHost("user@host")).toBeNull();
    expect(normaliseShellyHost("a b")).toBeNull();
  });
});

describe("relayPath", () => {
  it("adds a timer only when turning on for a positive duration", () => {
    expect(relayPath(0, true, 90)).toBe("/relay/0?turn=on&timer=90");
    expect(relayPath(0, false)).toBe("/relay/0?turn=off");
    expect(relayPath(1, true, 0)).toBe("/relay/1?turn=on");
  });
});
