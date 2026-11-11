/**
 * Identity and naming for the DS18B20 probes on a Shelly (add-on slots on
 * Gen1, temperature components on Gen2+ and The Pill). Each probe is its own
 * sensor device, keyed by the probe's id rather than its position, so a probe
 * dropping out never shifts another's readings into the wrong history.
 *
 * Import-free so it can be unit tested directly.
 */

export type ProbeReading = { id: number; tempC: number | null };

/** Sensor device key for one probe on an output device. */
export const probeDeviceKey = (outputDeviceId: number, probeId: number): string => `shelly:${outputDeviceId}:${probeId}`;

/**
 * Key of the single probe sensor from before each probe had its own. On its
 * first sight the default probe adopts it, history and brew included.
 */
export const legacyProbeDeviceKey = (outputDeviceId: number): string => `shelly:${outputDeviceId}`;

/** The device and probe a Shelly probe sensor's key names; probeId is null for the legacy key. */
export function parseProbeDeviceKey(key: string): { outputDeviceId: number; probeId: number | null } | null {
  const m = /^shelly:(\d+)(?::(\d+))?$/.exec(key);
  if (!m) return null;
  return { outputDeviceId: Number(m[1]), probeId: m[2] != null ? Number(m[2]) : null };
}

/** The lowest-numbered probe: the one in control unless another is chosen. */
export function defaultProbeId(probes: ProbeReading[]): number | null {
  return probes.length ? Math.min(...probes.map((p) => p.id)) : null;
}

/**
 * The probe flows control on. A probe chosen by the brewer that has gone
 * missing gives null rather than falling back to another, which could be
 * measuring something else entirely (the room rather than the wort).
 */
export function controlProbe<P extends ProbeReading>(probes: P[], controlProbeId: number | null): P | null {
  const id = controlProbeId ?? defaultProbeId(probes);
  return probes.find((p) => p.id === id) ?? null;
}

/** "Fermenter probe", then "Fermenter probe 2", "Fermenter probe 3", … */
export function probeSensorName(deviceName: string, ordinal: number): string {
  return ordinal <= 1 ? `${deviceName} probe` : `${deviceName} probe ${ordinal}`;
}

/**
 * A probe sensor's name after its device is renamed, or null to leave it: a
 * name the brewer chose ("Wort", "Ambient") is kept.
 */
export function renamedProbeSensor(sensorName: string, oldDeviceName: string, newDeviceName: string): string | null {
  const prefix = `${oldDeviceName} probe`;
  if (sensorName !== prefix && !(sensorName.startsWith(`${prefix} `) && /^\d+$/.test(sensorName.slice(prefix.length + 1)))) return null;
  return `${newDeviceName} probe${sensorName.slice(prefix.length)}`;
}
