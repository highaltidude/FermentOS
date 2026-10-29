import { Router } from "express";
import { db, outputDevicesTable, sensorDevicesTable, type OutputDevice } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateOutputDeviceBody,
  UpdateOutputDeviceBody,
  ProbeOutputDeviceBody,
  SetOutputDeviceRelayBody,
} from "@workspace/api-zod";
import { parseIdParam } from "../lib/http";
import { normaliseShellyHost, isPill, type ShellyInfo } from "../lib/shellyParse";
import { probeShelly, getShellyStatus, getPillMode, setShellyRelay, applyShellySafeDefaults } from "../services/shelly";
import { getLiveState, isReachable, noteRelayState, forgetDevice, pollNow } from "../services/devicePoller";
import { relayOwners } from "../services/flowEngine";
import { closeActiveAssignment } from "../services/sensorDevices";

const router = Router();

const deviceTypeOf = (info: ShellyInfo): OutputDevice["deviceType"] => (info.gen >= 2 ? "shelly_gen2" : "shelly_gen1");

/** Whether the device has a relay, as last seen. Rows from before Gen2+ support were all relays. */
function hasRelay(device: OutputDevice): boolean {
  return getLiveState(device.id)?.hasRelay ?? device.lastState?.hasRelay ?? true;
}

const NO_RELAY = "This device has no relay. If it's The Pill, switch it to SSR mode in the Shelly app to use it as one.";

/** API shape: credentials reduced to hasPassword, live state merged in. */
function toApi(device: OutputDevice) {
  const { password, lastState, ...rest } = device;
  const live = getLiveState(device.id);
  return {
    ...rest,
    hasPassword: !!password,
    controlledBy: relayOwners().get(device.id) ?? null,
    state: {
      reachable: isReachable(live),
      ison: live?.ison ?? lastState?.ison ?? null,
      hasRelay: hasRelay(device),
      tempC: live?.tempC ?? lastState?.tempC ?? null,
      rssi: live?.rssi ?? lastState?.rssi ?? null,
      lastError: live?.lastError ?? null,
    },
  };
}

async function findDevice(id: number): Promise<OutputDevice | undefined> {
  const [device] = await db.select().from(outputDevicesTable).where(eq(outputDevicesTable.id, id));
  return device;
}

// ── GET /devices ───────────────────────────────────────────────────────────
router.get("/", async (_req, res) => {
  const devices = await db.select().from(outputDevicesTable).orderBy(outputDevicesTable.name);
  res.json(devices.map(toApi));
});

// ── POST /devices/probe ────────────────────────────────────────────────────
// Lets the add dialog confirm the address and credentials before saving.
router.post("/probe", async (req, res) => {
  const body = ProbeOutputDeviceBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });
  const host = normaliseShellyHost(body.data.host);
  if (!host) return res.status(400).json({ error: "Enter an IP address or hostname, e.g. 192.168.1.40" });

  const empty = {
    host, model: null, generation: null, isPill: false, pillMode: null, authRequired: false,
    ison: null, hasRelay: false, relayChannels: 0, tempC: null,
  };
  const info = await probeShelly({ host });
  if (!info.ok) return res.json({ ...empty, ok: false, error: info.reason });

  const pill = isPill(info.value);
  const target = { host, deviceType: deviceTypeOf(info.value), username: body.data.username, password: body.data.password };
  const status = await getShellyStatus(target);
  const base = { ...empty, model: info.value.type, generation: info.value.gen, isPill: pill, authRequired: info.value.auth };
  if (!status.ok) {
    const error = info.value.auth && !body.data.password
      ? info.value.gen >= 2
        ? "This device has restricted login on; enter its password (the username is always admin)"
        : "This device has restricted login on; enter its username and password"
      : status.reason;
    return res.json({ ...base, ok: false, error });
  }
  // The mode only explains what the Pill has; a failed read doesn't stop it being added.
  const mode = pill ? await getPillMode(target) : null;
  const { ison, hasRelay, relayChannels, tempC } = status.value;
  return res.json({
    ...base, ok: true, error: null, pillMode: mode?.ok ? mode.value : null, ison, hasRelay, relayChannels, tempC,
  });
});

// ── POST /devices ──────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const body = CreateOutputDeviceBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });
  const host = normaliseShellyHost(body.data.host);
  if (!host) return res.status(400).json({ error: "Enter an IP address or hostname, e.g. 192.168.1.40" });
  // Ask the device which API it speaks rather than trusting the client.
  const info = await probeShelly({ host });
  if (!info.ok) return res.status(400).json({ error: info.reason });

  const [device] = await db
    .insert(outputDevicesTable)
    .values({
      deviceType: deviceTypeOf(info.value),
      model: info.value.type,
      name: body.data.name.trim(),
      host,
      channel: body.data.channel ?? 0,
      username: body.data.username || null,
      password: body.data.password || null,
    })
    .returning();
  // Poll straight away so the list shows real state instead of "unreachable".
  await pollNow();
  return res.status(201).json(toApi((await findDevice(device!.id)) ?? device!));
});

// ── GET /devices/:id ───────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;
  const device = await findDevice(id);
  if (!device) return res.status(404).json({ error: "Device not found" });
  return res.json(toApi(device));
});

// ── PATCH /devices/:id ─────────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;
  const body = UpdateOutputDeviceBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });

  const { host: rawHost, password, username, ...rest } = body.data;
  const before = await findDevice(id);
  if (!before) return res.status(404).json({ error: "Device not found" });
  let host: string | undefined;
  let detected: ShellyInfo | undefined;
  if (rawHost !== undefined) {
    const normalised = normaliseShellyHost(rawHost);
    if (!normalised) return res.status(400).json({ error: "Enter an IP address or hostname, e.g. 192.168.1.40" });
    host = normalised;
    // A new address may be a different device, possibly of another generation.
    const info = await probeShelly({ host });
    if (!info.ok) return res.status(400).json({ error: info.reason });
    detected = info.value;
  }

  const [device] = await db
    .update(outputDevicesTable)
    .set({
      ...rest,
      ...(rest.name !== undefined && { name: rest.name.trim() }),
      ...(host !== undefined && { host }),
      ...(detected !== undefined && { deviceType: deviceTypeOf(detected), model: detected.type }),
      ...(username !== undefined && { username: username || null }),
      // Omitted keeps the stored password; null or "" clears it.
      ...(password !== undefined && { password: password || null }),
      updatedAt: new Date(),
    })
    .where(eq(outputDevicesTable.id, id))
    .returning();
  if (!device) return res.status(404).json({ error: "Device not found" });

  // Disabling or re-addressing a device ends FermentOS's hold on it, so switch
  // the old relay off (best effort: it may be why the address is changing)
  // rather than leave it in whatever state it was. A disabled device's probe
  // stops reporting, so it comes off its brew too.
  const disabled = rest.enabled === false && before.enabled;
  const moved = (host !== undefined && host !== before.host) || (rest.channel !== undefined && rest.channel !== before.channel);
  if ((disabled || moved) && hasRelay(before)) {
    const off = await setShellyRelay(before, false);
    if (!off.ok) req.log.warn({ deviceId: id, reason: off.reason }, "Could not switch the old relay off");
  }
  if (disabled && device.probeSensorDeviceId != null) await closeActiveAssignment(device.probeSensorDeviceId);

  // Keep the probe's sensor name in step, so brew charts show the new name.
  if (rest.name !== undefined && device.probeSensorDeviceId != null) {
    await db
      .update(sensorDevicesTable)
      .set({ deviceName: `${device.name} probe`, updatedAt: new Date() })
      .where(eq(sensorDevicesTable.id, device.probeSensorDeviceId));
  }

  // A new address or credentials invalidates what we knew about the old one.
  if (host !== undefined || password !== undefined || username !== undefined || rest.channel !== undefined || rest.enabled === false) {
    forgetDevice(id);
  }
  return res.json(toApi(device));
});

// ── DELETE /devices/:id ────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;
  const device = await findDevice(id);
  const owner = relayOwners().get(id);
  if (owner) return res.status(409).json({ error: `Turn off the flow "${owner.name}" before removing this relay` });
  if (device) {
    // Don't leave a heater running on a relay nothing manages any more. If it
    // can't be reached, say so and let the brewer decide (force=true).
    if (hasRelay(device)) {
      const off = await setShellyRelay(device, false);
      if (!off.ok && req.query.force !== "true") {
        return res.status(502).json({ error: `Couldn't switch ${device.name} off: ${off.reason}` });
      }
    }
    // Its probe stops reporting, so it comes off its brew; the history stays.
    if (device.probeSensorDeviceId != null) await closeActiveAssignment(device.probeSensorDeviceId);
    await db.delete(outputDevicesTable).where(eq(outputDevicesTable.id, id));
    forgetDevice(id);
  }
  return res.status(204).end();
});

// ── POST /devices/:id/relay ────────────────────────────────────────────────
router.post("/:id/relay", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;
  const body = SetOutputDeviceRelayBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request body" });
  const device = await findDevice(id);
  if (!device) return res.status(404).json({ error: "Device not found" });
  if (!hasRelay(device)) return res.status(409).json({ error: NO_RELAY });
  // Manual switching would be undone on the next tick anyway; say why instead.
  const owner = relayOwners().get(id);
  if (owner) return res.status(409).json({ error: `The flow "${owner.name}" is controlling this relay; turn it off to switch by hand` });

  const result = await setShellyRelay(device, body.data.on, body.data.on ? body.data.durationSec : undefined);
  if (!result.ok) return res.status(502).json({ error: result.reason });
  noteRelayState(id, result.value);
  req.log.info({ deviceId: id, on: result.value, durationSec: body.data.durationSec }, "Relay switched by hand");
  return res.json(toApi(device));
});

// ── POST /devices/:id/safe-defaults ────────────────────────────────────────
router.post("/:id/safe-defaults", async (req, res) => {
  const id = parseIdParam(req, res);
  if (id === undefined) return;
  const device = await findDevice(id);
  if (!device) return res.status(404).json({ error: "Device not found" });
  if (!hasRelay(device)) return res.status(409).json({ error: NO_RELAY });

  const result = await applyShellySafeDefaults(device);
  if (!result.ok) return res.status(502).json({ error: result.reason });
  return res.json(toApi(device));
});

export default router;
