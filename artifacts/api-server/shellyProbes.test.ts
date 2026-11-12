import { describe, it, expect } from "vitest";
import {
  probeDeviceKey,
  legacyProbeDeviceKey,
  parseProbeDeviceKey,
  defaultProbeId,
  controlProbe,
  probeSensorName,
  renamedProbeSensor,
} from "./src/lib/shellyProbes";
import { parseNodeConfig } from "./src/lib/flows/nodes";

describe("probe sensor keys", () => {
  it("names the device and the probe, and round-trips", () => {
    expect(probeDeviceKey(3, 201)).toBe("shelly:3:201");
    expect(parseProbeDeviceKey("shelly:3:201")).toEqual({ outputDeviceId: 3, probeId: 201 });
  });

  it("recognises the single key from before per-probe sensors", () => {
    expect(legacyProbeDeviceKey(3)).toBe("shelly:3");
    expect(parseProbeDeviceKey("shelly:3")).toEqual({ outputDeviceId: 3, probeId: null });
  });

  it("rejects other sensors' keys", () => {
    expect(parseProbeDeviceKey("iSpindel001")).toBeNull();
    expect(parseProbeDeviceKey("shelly:x:1")).toBeNull();
    expect(parseProbeDeviceKey("shelly:3:201:5")).toBeNull();
  });
});

describe("controlProbe", () => {
  const probes = [
    { id: 201, tempC: 15.5 },
    { id: 200, tempC: 19.0 },
    { id: 202, tempC: null },
  ];

  it("defaults to the lowest id, whatever the order", () => {
    expect(defaultProbeId(probes)).toBe(200);
    expect(controlProbe(probes, null)?.tempC).toBe(19.0);
  });

  it("follows the chosen probe", () => {
    expect(controlProbe(probes, 201)?.tempC).toBe(15.5);
  });

  it("gives nothing when the chosen probe is gone, rather than another probe", () => {
    expect(controlProbe(probes, 203)).toBeNull();
    expect(controlProbe([{ id: 1, tempC: 22 }], 0)).toBeNull();
  });

  it("gives nothing without probes", () => {
    expect(defaultProbeId([])).toBeNull();
    expect(controlProbe([], null)).toBeNull();
  });
});

describe("probe sensor names", () => {
  it("numbers probes after the first", () => {
    expect(probeSensorName("Fermenter", 1)).toBe("Fermenter probe");
    expect(probeSensorName("Fermenter", 2)).toBe("Fermenter probe 2");
  });

  it("follows a device rename", () => {
    expect(renamedProbeSensor("Fermenter probe", "Fermenter", "FV1")).toBe("FV1 probe");
    expect(renamedProbeSensor("Fermenter probe 3", "Fermenter", "FV1")).toBe("FV1 probe 3");
  });

  it("keeps a name the brewer chose", () => {
    expect(renamedProbeSensor("Ambient", "Fermenter", "FV1")).toBeNull();
    expect(renamedProbeSensor("Fermenter probe wort", "Fermenter", "FV1")).toBeNull();
    expect(renamedProbeSensor("Fermenter probes", "Fermenter", "FV1")).toBeNull();
  });
});

describe("Shelly temperature source", () => {
  const parse = (source: unknown) => parseNodeConfig("trigger.temperature", { source }, () => true);

  it("keeps a probe id", () => {
    expect(parse({ kind: "shelly", outputDeviceId: 3, probeId: 201 })).toEqual({
      ok: true,
      value: { source: { kind: "shelly", outputDeviceId: 3, probeId: 201 } },
    });
    expect(parse({ kind: "shelly", outputDeviceId: 3, probeId: 0 }).ok).toBe(true);
  });

  it("leaves it out for the control probe, as flows saved before it had", () => {
    expect(parse({ kind: "shelly", outputDeviceId: 3 })).toEqual({ ok: true, value: { source: { kind: "shelly", outputDeviceId: 3 } } });
    expect(parse({ kind: "shelly", outputDeviceId: 3, probeId: null })).toEqual({ ok: true, value: { source: { kind: "shelly", outputDeviceId: 3 } } });
  });

  it("rejects a malformed probe id", () => {
    expect(parse({ kind: "shelly", outputDeviceId: 3, probeId: -1 }).ok).toBe(false);
    expect(parse({ kind: "shelly", outputDeviceId: 3, probeId: "201" }).ok).toBe(false);
    expect(parse({ kind: "shelly", outputDeviceId: 3, probeId: 1.5 }).ok).toBe(false);
  });
});
