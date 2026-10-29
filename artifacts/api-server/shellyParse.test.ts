import { describe, it, expect } from "vitest";
import {
  parseShellyInfo,
  parseShellyStatus,
  parseShelly2Status,
  parsePillMode,
  isPill,
  normaliseShellyHost,
  relayPath,
  switchSetPath,
  parseDigestChallenge,
  digestAuthHeader,
} from "./src/lib/shellyParse.js";

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
    expect(parseShellyStatus(statusWithProbe)).toEqual({
      ison: true, hasRelay: true, relayChannels: 1, tempC: 19.4, rssi: -61, uptimeSec: 86512,
    });
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
      gen: 1,
      type: "SHSW-1",
      app: null,
      mac: "A4CF12F45A1B",
      auth: true,
      firmware: "20230913-112003/v1.14.0-gcb84623",
    });
  });

  it("recognises a Gen2+ device description", () => {
    const body = {
      name: null, id: "shellypill-a0b1c2d3e4f5", mac: "A0B1C2D3E4F5", slot: 0, model: "S3SN-0U53X",
      gen: 3, fw_id: "20250410-123456/1.6.0-gabcdef", ver: "1.6.0", app: "Pill", auth_en: true, auth_domain: "shellypill-a0b1c2d3e4f5",
    };
    const info = parseShellyInfo(body);
    expect(info).toEqual({ gen: 3, type: "S3SN-0U53X", app: "Pill", mac: "A0B1C2D3E4F5", auth: true, firmware: "1.6.0" });
    expect(isPill(info!)).toBe(true);
    expect(isPill(parseShellyInfo({ ...body, app: "Plus1", model: "SNSW-001X16EU" })!)).toBe(false);
  });

  it("rejects responses without a type", () => {
    expect(parseShellyInfo({ name: "router" })).toBeNull();
    expect(parseShellyInfo("<html>")).toBeNull();
  });
});

// Shaped after the Gen2+ Shelly.GetStatus docs: one key per component.
const pillSys = { mac: "A0B1C2D3E4F5", restart_required: false, uptime: 3600 };
const pillWifi = { sta_ip: "192.168.1.41", status: "got ip", ssid: "brewery", rssi: -55 };

describe("parseShelly2Status", () => {
  it("reads a Pill in OneWire mode as a probe with no relay", () => {
    const body = {
      sys: pillSys, wifi: pillWifi, pill: {},
      "temperature:101": { id: 101, tC: 25.0, tF: 77.0 },
      "temperature:100": { id: 100, tC: 19.8, tF: 67.6 },
    };
    expect(parseShelly2Status(body)).toEqual({
      ison: null, hasRelay: false, relayChannels: 0, tempC: 19.8, rssi: -55, uptimeSec: 3600,
    });
  });

  it("reads a Pill in SSR mode, on either channel", () => {
    const body = {
      sys: pillSys, wifi: pillWifi,
      "switch:0": { id: 0, source: "init", output: false },
      "switch:1": { id: 1, source: "HTTP_in", output: true, timer_started_at: 1761400000, timer_duration: 90 },
    };
    expect(parseShelly2Status(body, 1)).toEqual({
      ison: true, hasRelay: true, relayChannels: 2, tempC: null, rssi: -55, uptimeSec: 3600,
    });
    expect(parseShelly2Status(body, 0)?.ison).toBe(false);
    expect(parseShelly2Status(body, 2)?.hasRelay).toBe(false);
  });

  it("treats a probe in error, or a lost DS18B20, as no reading", () => {
    const base = { sys: pillSys, wifi: pillWifi };
    expect(parseShelly2Status({ ...base, "temperature:100": { id: 100, tC: null, tF: null, errors: ["read"] } })?.tempC).toBeNull();
    expect(parseShelly2Status({ ...base, "temperature:100": { id: 100, tC: -127 } })?.tempC).toBeNull();
  });

  it("returns null for bodies that aren't a Gen2+ status", () => {
    expect(parseShelly2Status(null)).toBeNull();
    expect(parseShelly2Status(statusWithProbe)).toBeNull(); // Gen1 shape
  });
});

describe("parsePillMode", () => {
  it("reads the mode from Pill.GetConfig", () => {
    expect(parsePillMode({ mode: "onewire", pin0_mode: "none" })).toBe("onewire");
    expect(parsePillMode({})).toBeNull();
    expect(parsePillMode(null)).toBeNull();
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

describe("switchSetPath", () => {
  it("adds toggle_after only when turning on for a positive duration", () => {
    expect(switchSetPath(0, true, 90)).toBe("/rpc/Switch.Set?id=0&on=true&toggle_after=90");
    expect(switchSetPath(1, false)).toBe("/rpc/Switch.Set?id=1&on=false");
    expect(switchSetPath(0, true, 0)).toBe("/rpc/Switch.Set?id=0&on=true");
  });
});

describe("digest auth", () => {
  it("parses a Gen2+ challenge and rejects anything else", () => {
    expect(parseDigestChallenge('Digest qop="auth", realm="shellypill-a0b1c2d3e4f5", nonce="60dc59c6", algorithm=SHA-256'))
      .toEqual({ realm: "shellypill-a0b1c2d3e4f5", nonce: "60dc59c6", opaque: null });
    expect(parseDigestChallenge('Basic realm="shelly1"')).toBeNull();
    expect(parseDigestChallenge('Digest realm="x", nonce="y", algorithm=MD5')).toBeNull();
    expect(parseDigestChallenge(null)).toBeNull();
  });

  it("matches the SHA-256 example in RFC 7616 §3.9.1", () => {
    const header = digestAuthHeader({
      challenge: { realm: "http-auth@example.org", nonce: "7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v", opaque: "FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS" },
      username: "Mufasa",
      password: "Circle of Life",
      method: "GET",
      uri: "/dir/index.html",
      cnonce: "f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ",
    });
    expect(header).toContain('response="753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1"');
    expect(header).toContain("nc=00000001");
    expect(header).toContain('opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"');
  });
});
