/**
 * Brew Flow node catalog: the node types a flow graph may contain and the
 * config each one carries. Configs arrive as untyped JSON from the editor, so
 * every one is parsed here before the engine trusts it.
 *
 * Temperatures are always °C in stored configs; the UI converts for display.
 *
 * Import-free, like the rest of lib/, so it can be unit tested directly.
 */

export const NODE_TYPES = [
  "trigger.schedule",
  "trigger.temperature",
  "condition.compare",
  "condition.timeWindow",
  "condition.brewStatus",
  "condition.stageAge",
  "control.thermostat",
  "action.relay",
  "action.notify",
  "action.delay",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const BREW_STATUSES = ["brew_day", "fermenting", "conditioning", "packaged"] as const;
export type BrewStatus = (typeof BREW_STATUSES)[number];

export type TempSource =
  | { kind: "sensor"; sensorDeviceId: number }
  | { kind: "shelly"; outputDeviceId: number };

export type ScheduleConfig = { cron: string };
export type TemperatureTriggerConfig = { source: TempSource };
export type CompareConfig = { op: "lt" | "gt" | "between"; valueC: number; value2C: number | null };
export type TimeWindowConfig = { from: string; to: string; days: number[] };
export type BrewStatusConfig = { statuses: BrewStatus[] };
export type StageAgeConfig = { status: BrewStatus; op: "atLeast" | "lessThan"; days: number };
export type ThermostatConfig = {
  outputDeviceId: number;
  mode: "heat" | "cool";
  setpointC: number;
  hysteresisC: number;
  minOnSec: number;
  minOffSec: number;
};
export type RelayConfig = { outputDeviceId: number; action: "on" | "off" | "onFor"; minutes: number | null };
export type NotifyConfig = { message: string };
export type DelayConfig = { minutes: number };

export type FlowNode =
  | { id: string; type: "trigger.schedule"; config: ScheduleConfig }
  | { id: string; type: "trigger.temperature"; config: TemperatureTriggerConfig }
  | { id: string; type: "condition.compare"; config: CompareConfig }
  | { id: string; type: "condition.timeWindow"; config: TimeWindowConfig }
  | { id: string; type: "condition.brewStatus"; config: BrewStatusConfig }
  | { id: string; type: "condition.stageAge"; config: StageAgeConfig }
  | { id: string; type: "control.thermostat"; config: ThermostatConfig }
  | { id: string; type: "action.relay"; config: RelayConfig }
  | { id: string; type: "action.notify"; config: NotifyConfig }
  | { id: string; type: "action.delay"; config: DelayConfig };

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Plausible brewing range; catches °F typed into a °C field and similar slips. */
const TEMP_MIN_C = -10;
const TEMP_MAX_C = 110;
const inTempRange = (t: number) => t >= TEMP_MIN_C && t <= TEMP_MAX_C;

/** Minutes past midnight for an "HH:MM" string already checked against HHMM. */
export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}

export function parseNodeConfig(type: NodeType, raw: unknown, isValidCron: (expr: string) => boolean): ParseResult<FlowNode["config"]> {
  const c = isObj(raw) ? raw : {};
  const fail = (error: string): ParseResult<never> => ({ ok: false, error });

  switch (type) {
    case "trigger.schedule": {
      if (typeof c.cron !== "string" || !c.cron.trim()) return fail("Choose when this schedule runs");
      const cron = c.cron.trim();
      // Five fields only: a seconds field would let a flow fire every second.
      if (cron.split(/\s+/).length !== 5 || !isValidCron(cron)) return fail("Schedule is not a valid cron expression");
      return { ok: true, value: { cron } };
    }
    case "trigger.temperature": {
      const s = c.source;
      if (isObj(s) && s.kind === "sensor" && isId(s.sensorDeviceId)) {
        return { ok: true, value: { source: { kind: "sensor", sensorDeviceId: s.sensorDeviceId } } };
      }
      if (isObj(s) && s.kind === "shelly" && isId(s.outputDeviceId)) {
        return { ok: true, value: { source: { kind: "shelly", outputDeviceId: s.outputDeviceId } } };
      }
      return fail("Choose a temperature source");
    }
    case "condition.compare": {
      if (c.op !== "lt" && c.op !== "gt" && c.op !== "between") return fail("Choose a comparison");
      if (!isNum(c.valueC) || !inTempRange(c.valueC)) return fail("Enter a temperature to compare with");
      if (c.op === "between") {
        if (!isNum(c.value2C) || !inTempRange(c.value2C)) return fail("Enter both ends of the range");
        if (c.value2C <= c.valueC) return fail("The upper temperature must be above the lower one");
        return { ok: true, value: { op: c.op, valueC: c.valueC, value2C: c.value2C } };
      }
      return { ok: true, value: { op: c.op, valueC: c.valueC, value2C: null } };
    }
    case "condition.timeWindow": {
      if (typeof c.from !== "string" || !HHMM.test(c.from) || typeof c.to !== "string" || !HHMM.test(c.to)) {
        return fail("Enter start and end times as HH:MM");
      }
      if (c.from === c.to) return fail("Start and end times must differ");
      const days = Array.isArray(c.days) ? c.days : [];
      if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return fail("Days must be 0 (Sunday) to 6");
      return { ok: true, value: { from: c.from, to: c.to, days: [...new Set(days as number[])].sort() } };
    }
    case "condition.stageAge": {
      if (!(BREW_STATUSES as readonly unknown[]).includes(c.status)) return fail("Choose a brew stage");
      if (c.op !== "atLeast" && c.op !== "lessThan") return fail("Choose \"at least\" or \"less than\"");
      if (!isNum(c.days) || c.days < 0 || c.days > 365) return fail("Days must be 0–365");
      return { ok: true, value: { status: c.status as BrewStatus, op: c.op, days: Math.round(c.days * 10) / 10 } };
    }
    case "condition.brewStatus": {
      const statuses = Array.isArray(c.statuses) ? c.statuses : [];
      if (statuses.length === 0) return fail("Choose at least one brew status");
      if (!statuses.every((s) => (BREW_STATUSES as readonly unknown[]).includes(s))) return fail("Unknown brew status");
      return { ok: true, value: { statuses: statuses as BrewStatus[] } };
    }
    case "control.thermostat": {
      if (!isId(c.outputDeviceId)) return fail("Choose the relay to switch");
      if (c.mode !== "heat" && c.mode !== "cool") return fail("Choose heating or cooling");
      if (!isNum(c.setpointC) || !inTempRange(c.setpointC)) return fail("Enter a target temperature");
      const hysteresisC = c.hysteresisC ?? 0.5;
      if (!isNum(hysteresisC) || hysteresisC < 0.1 || hysteresisC > 10) return fail("Hysteresis must be 0.1–10 °C");
      const minOnSec = c.minOnSec ?? 0;
      const minOffSec = c.minOffSec ?? (c.mode === "cool" ? 300 : 0);
      if (!isNum(minOnSec) || minOnSec < 0 || minOnSec > 3600) return fail("Minimum on time must be 0–60 minutes");
      if (!isNum(minOffSec) || minOffSec < 0 || minOffSec > 3600) return fail("Minimum off time must be 0–60 minutes");
      return {
        ok: true,
        value: { outputDeviceId: c.outputDeviceId, mode: c.mode, setpointC: c.setpointC, hysteresisC, minOnSec, minOffSec },
      };
    }
    case "action.relay": {
      if (!isId(c.outputDeviceId)) return fail("Choose the relay to switch");
      if (c.action !== "on" && c.action !== "off" && c.action !== "onFor") return fail("Choose what to do with the relay");
      if (c.action === "onFor") {
        if (!isNum(c.minutes) || c.minutes < 1 || c.minutes > 1440) return fail("Run time must be 1–1440 minutes");
        return { ok: true, value: { outputDeviceId: c.outputDeviceId, action: "onFor", minutes: Math.round(c.minutes) } };
      }
      return { ok: true, value: { outputDeviceId: c.outputDeviceId, action: c.action, minutes: null } };
    }
    case "action.notify": {
      if (typeof c.message !== "string" || !c.message.trim()) return fail("Enter a message");
      if (c.message.length > 500) return fail("Message is too long");
      return { ok: true, value: { message: c.message.trim() } };
    }
    case "action.delay": {
      if (!isNum(c.minutes) || c.minutes < 1 || c.minutes > 1440) return fail("Delay must be 1–1440 minutes");
      return { ok: true, value: { minutes: Math.round(c.minutes) } };
    }
  }
}

/** Output device a node switches, if it switches one. */
export function controlledRelay(node: FlowNode): number | null {
  return node.type === "control.thermostat" || node.type === "action.relay" ? node.config.outputDeviceId : null;
}

/**
 * Whether `now` falls inside a time window. Windows may run past midnight
 * ("22:00"–"06:00"); `days` then refers to the day the window started on.
 * An empty `days` list means every day.
 */
export function inTimeWindow(cfg: TimeWindowConfig, now: Date): boolean {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const from = minutesOfDay(cfg.from);
  const to = minutesOfDay(cfg.to);
  const dayOk = (d: number) => cfg.days.length === 0 || cfg.days.includes(d);
  if (from < to) return nowMin >= from && nowMin < to && dayOk(now.getDay());
  // Overnight: the evening part belongs to today, the morning part to yesterday.
  if (nowMin >= from) return dayOk(now.getDay());
  if (nowMin < to) return dayOk((now.getDay() + 6) % 7);
  return false;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a brew has been in a stage for at least / less than a number of
 * days. A brew in any other stage never passes, so "conditioning for less than
 * 3 days" doesn't match a batch that's still fermenting.
 */
export function stageAgePasses(
  cfg: StageAgeConfig,
  brew: { status: string; stageStartedAt: Date | null } | null,
  now: Date,
): boolean {
  if (!brew || brew.status !== cfg.status || !brew.stageStartedAt) return false;
  const days = (now.getTime() - brew.stageStartedAt.getTime()) / DAY_MS;
  return cfg.op === "atLeast" ? days >= cfg.days : days < cfg.days;
}

export function compareTemp(cfg: CompareConfig, tempC: number): boolean {
  if (cfg.op === "lt") return tempC < cfg.valueC;
  if (cfg.op === "gt") return tempC > cfg.valueC;
  return tempC >= cfg.valueC && tempC <= cfg.value2C!;
}
