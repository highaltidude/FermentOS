import { useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import type { FlowGraphNodeType, OutputDevice, SensorDeviceWithStatus } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DAY_LABELS, NODE_HINTS, NODE_LABELS, SETPOINT_LABELS, cronToSchedule, deltaFromUnit, deltaToUnit, fromUnit, scheduleToCron,
  sourceKey, tempSourceOptions, toUnit, type GraphKind, type SetpointSource, type TempUnit,
} from "@/lib/flows";
import { cn } from "@/lib/utils";
import { NODE_ICONS } from "./FlowNodeCard";

type Config = Record<string, unknown>;

const label = "text-xs text-muted-foreground mb-1 block";
const select = "w-full text-sm bg-background border border-border rounded-md px-2 h-9 text-foreground";
const hint = "text-[11px] text-muted-foreground mt-1";

const round = (v: number, places = 2) => Number(v.toFixed(places));

/**
 * A number input that keeps what's typed ("20." or "") while sending only
 * valid numbers upward, so the stored config never holds a half-typed value.
 */
function NumberField({ value, onChange, toDisplay = (v) => v, fromDisplay = (v) => v, step = "any", places = 2, min, max, className }: {
  value: unknown;
  onChange: (v: number | null) => void;
  toDisplay?: (v: number) => number;
  fromDisplay?: (v: number) => number;
  step?: string;
  /** Decimal places shown; stored values are °C, so a converted °F reads 1.01 at two places. */
  places?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState(typeof value === "number" ? String(round(toDisplay(value), places)) : "");
  return (
    <Input
      type="number"
      step={step}
      min={min}
      max={max}
      value={draft}
      className={cn("text-sm", className)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = e.target.valueAsNumber;
        onChange(Number.isFinite(n) ? round(fromDisplay(n), 4) : null);
      }}
    />
  );
}

function RelaySelect({ value, onChange, devices, flowId }: { value: unknown; onChange: (id: number | null) => void; devices: OutputDevice[]; flowId: number | null }) {
  return (
    <div>
      <label className={label}>Relay</label>
      <select className={select} value={typeof value === "number" ? value : ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Choose a relay…</option>
        {devices.map((d) => {
          const other = d.controlledBy && d.controlledBy.flowId !== flowId ? d.controlledBy.name : null;
          return <option key={d.id} value={d.id}>{d.name}{other ? ` (used by ${other})` : ""}</option>;
        })}
      </select>
      {devices.length === 0 && <p className={hint}>Add a Shelly relay in Settings → System → Integrations first.</p>}
    </div>
  );
}

function DayPicker({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  return (
    <div>
      <label className={label}>Days <span className="font-normal">(none selected = every day)</span></label>
      <div className="flex flex-wrap gap-1">
        {DAY_LABELS.map((d, i) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort())}
            className={cn("text-xs px-2 py-1 rounded border", days.includes(i) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScheduleFields({ cron, onChange }: { cron: string; onChange: (cron: string) => void }) {
  const choice = cronToSchedule(cron);
  const [custom, setCustom] = useState(choice === null);
  const kind = custom ? "custom" : choice!.kind;
  return (
    <>
      <div>
        <label className={label}>Repeat</label>
        <select
          className={select}
          value={kind}
          onChange={(e) => {
            const v = e.target.value;
            setCustom(v === "custom");
            if (v === "daily") onChange(scheduleToCron({ kind: "daily", time: "06:00", days: [] }));
            if (v === "everyHours") onChange(scheduleToCron({ kind: "everyHours", hours: 6 }));
          }}
        >
          <option value="daily">At a time of day</option>
          <option value="everyHours">Every few hours</option>
          <option value="custom">Custom (cron)</option>
        </select>
      </div>
      {kind === "daily" && choice?.kind === "daily" && (
        <>
          <div>
            <label className={label}>Time</label>
            <Input type="time" value={choice.time} className="text-sm" onChange={(e) => e.target.value && onChange(scheduleToCron({ ...choice, time: e.target.value }))} />
          </div>
          <DayPicker days={choice.days} onChange={(days) => onChange(scheduleToCron({ ...choice, days }))} />
        </>
      )}
      {kind === "everyHours" && choice?.kind === "everyHours" && (
        <div>
          <label className={label}>Every</label>
          <select className={select} value={choice.hours} onChange={(e) => onChange(scheduleToCron({ kind: "everyHours", hours: Number(e.target.value) }))}>
            {[1, 2, 3, 4, 6, 8, 12].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? "s" : ""}</option>)}
          </select>
        </div>
      )}
      {kind === "custom" && (
        <div>
          <label className={label}>Cron expression</label>
          <Input value={cron} onChange={(e) => onChange(e.target.value)} className="text-sm font-mono" placeholder="0 6 * * *" />
          <p className={hint}>Five fields: minute, hour, day of month, month, day of week. Uses the server's local time.</p>
        </div>
      )}
    </>
  );
}

const STATUS_OPTIONS = [
  ["brew_day", "Brew day"],
  ["fermenting", "Fermenting"],
  ["conditioning", "Conditioning"],
  ["packaged", "Packaged"],
] as const;

export function NodeInspector({ id, type, config, onChange, onDelete, kind, unit, devices, sensors, flowId, problems, readOnly }: {
  id: string;
  type: FlowGraphNodeType;
  config: Config;
  onChange: (config: Config) => void;
  onDelete: () => void;
  kind: GraphKind | null;
  unit: TempUnit;
  devices: OutputDevice[];
  sensors: SensorDeviceWithStatus[];
  flowId: number | null;
  problems: string[];
  readOnly: boolean;
}) {
  const set = (patch: Config) => onChange({ ...config, ...patch });
  const Icon = NODE_ICONS[type];
  const temp = { toDisplay: (c: number) => toUnit(c, unit), fromDisplay: (v: number) => fromUnit(v, unit), step: "0.1", places: 1 };
  const delta = { toDisplay: (c: number) => deltaToUnit(c, unit), fromDisplay: (v: number) => deltaFromUnit(v, unit), step: "0.1", places: 1 };
  const minutes = { toDisplay: (s: number) => s / 60, fromDisplay: (m: number) => m * 60, step: "1", min: 0, max: 60 };

  let fields: ReactNode = null;
  switch (type) {
    case "trigger.schedule":
      fields = <ScheduleFields cron={String(config.cron ?? "")} onChange={(cron) => set({ cron })} />;
      break;
    case "trigger.temperature": {
      const options = tempSourceOptions(sensors, devices);
      fields = (
        <div>
          <label className={label}>Temperature from</label>
          <select
            className={select}
            value={sourceKey(config.source)}
            onChange={(e) => set({ source: options.find((o) => o.key === e.target.value)?.value ?? null })}
          >
            <option value="">Choose a sensor…</option>
            {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          <p className={hint}>A Shelly probe updates every few seconds; an iSpindel only every 15 minutes or so.</p>
        </div>
      );
      break;
    }
    case "condition.compare":
      fields = (
        <>
          <div>
            <label className={label}>Continue while the temperature is</label>
            <select className={select} value={String(config.op ?? "gt")} onChange={(e) => set({ op: e.target.value, value2C: e.target.value === "between" ? config.value2C ?? (Number(config.valueC) || 0) + 2 : null })}>
              <option value="gt">Above</option>
              <option value="lt">Below</option>
              <option value="between">Between</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>{config.op === "between" ? "From" : "Value"} °{unit}</label>
              <NumberField value={config.valueC} onChange={(v) => set({ valueC: v })} {...temp} />
            </div>
            {config.op === "between" && (
              <div>
                <label className={label}>To °{unit}</label>
                <NumberField value={config.value2C} onChange={(v) => set({ value2C: v })} {...temp} />
              </div>
            )}
          </div>
        </>
      );
      break;
    case "condition.timeWindow":
      fields = (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>From</label>
              <Input type="time" value={String(config.from ?? "")} onChange={(e) => set({ from: e.target.value })} className="text-sm" />
            </div>
            <div>
              <label className={label}>To</label>
              <Input type="time" value={String(config.to ?? "")} onChange={(e) => set({ to: e.target.value })} className="text-sm" />
            </div>
          </div>
          <DayPicker days={Array.isArray(config.days) ? (config.days as number[]) : []} onChange={(days) => set({ days })} />
          <p className={hint}>A window can run past midnight, e.g. 22:00 to 06:00. Days are the day it starts.</p>
        </>
      );
      break;
    case "condition.stageAge":
      fields = (
        <>
          <div>
            <label className={label}>Continue while the brew has been</label>
            <select className={select} value={String(config.status ?? "conditioning")} onChange={(e) => set({ status: e.target.value })}>
              {STATUS_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>For</label>
              <select className={select} value={String(config.op ?? "atLeast")} onChange={(e) => set({ op: e.target.value })}>
                <option value="atLeast">At least</option>
                <option value="lessThan">Less than</option>
              </select>
            </div>
            <div>
              <label className={label}>Days</label>
              <NumberField value={config.days} onChange={(v) => set({ days: v })} step="0.5" min={0} max={365} />
            </div>
          </div>
          <p className={hint}>
            Counted from when the sensor's brew last moved to this stage. A brew at any other stage doesn't pass. Pair
            "at least 3 days" with "less than 3 days" on another branch to hand a relay from one thermostat to the next,
            e.g. to cold crash.
          </p>
        </>
      );
      break;
    case "condition.brewStatus": {
      const statuses = Array.isArray(config.statuses) ? (config.statuses as string[]) : [];
      fields = (
        <div>
          <label className={label}>Continue while the brew is</label>
          <div className="space-y-1">
            {STATUS_OPTIONS.map(([value, text]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={statuses.includes(value)}
                  onChange={(e) => set({ statuses: e.target.checked ? [...statuses, value] : statuses.filter((s) => s !== value) })}
                />
                {text}
              </label>
            ))}
          </div>
          <p className={hint}>Uses the brew the temperature sensor is assigned to.</p>
        </div>
      );
      break;
    }
    case "control.thermostat": {
      const cool = config.mode === "cool";
      const from = (config.setpointFrom ?? "fixed") as SetpointSource;
      const sp = Number(config.setpointC);
      const hy = Number(config.hysteresisC ?? 0.5);
      fields = (
        <>
          <RelaySelect value={config.outputDeviceId} onChange={(v) => set({ outputDeviceId: v })} devices={devices} flowId={flowId} />
          <div>
            <label className={label}>Mode</label>
            <select
              className={select}
              value={cool ? "cool" : "heat"}
              // Cooling defaults to a 5-minute rest between runs to protect a compressor.
              onChange={(e) => set({ mode: e.target.value, minOffSec: e.target.value === "cool" ? Math.max(Number(config.minOffSec) || 0, 300) : config.minOffSec })}
            >
              <option value="heat">Heat</option>
              <option value="cool">Cool</option>
            </select>
          </div>
          <div>
            <label className={label}>Target</label>
            <select className={select} value={from} onChange={(e) => set({ setpointFrom: e.target.value })}>
              {(Object.keys(SETPOINT_LABELS) as SetpointSource[]).map((s) => <option key={s} value={s}>{SETPOINT_LABELS[s]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {from === "fixed" && (
              <div>
                <label className={label}>Target °{unit}</label>
                <NumberField value={config.setpointC} onChange={(v) => set({ setpointC: v })} {...temp} />
              </div>
            )}
            <div>
              <label className={label}>Swing °{unit}</label>
              <NumberField value={config.hysteresisC ?? 0.5} onChange={(v) => set({ hysteresisC: v })} {...delta} min={0.1} />
            </div>
          </div>
          {from === "fixed" ? (
            Number.isFinite(sp) && Number.isFinite(hy) && (
              <p className={hint}>
                On {cool ? "above" : "below"} {toUnit(cool ? sp + hy : sp - hy, unit).toFixed(1)}°{unit}, off again at {toUnit(sp, unit).toFixed(1)}°{unit}.
              </p>
            )
          ) : (
            <p className={hint}>
              Uses the ideal {from === "fermentIdeal" ? "fermentation" : "conditioning"} temperature of the brew the sensor is assigned to: the
              brew's own if set, else its recipe's. If there's no brew or no temperature set, the flow switches its relays off and alerts you.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Min. on (min)</label>
              <NumberField value={config.minOnSec ?? 0} onChange={(v) => set({ minOnSec: v })} {...minutes} />
            </div>
            <div>
              <label className={label}>Min. off (min)</label>
              <NumberField value={config.minOffSec ?? (cool ? 300 : 0)} onChange={(v) => set({ minOffSec: v })} {...minutes} />
            </div>
          </div>
          <p className={hint}>A thermostat must be the last step on its branch.</p>
        </>
      );
      break;
    }
    case "action.relay": {
      // Schedule flows can't leave a relay on with no end; temperature flows hold
      // a relay on while the step is reached, so "on" is the only choice there.
      const actions = kind === "temperature" ? [["on", "On"]]
        : kind === "schedule" ? [["onFor", "On for a while"], ["off", "Off"]]
        : [["on", "On"], ["onFor", "On for a while"], ["off", "Off"]];
      fields = (
        <>
          <RelaySelect value={config.outputDeviceId} onChange={(v) => set({ outputDeviceId: v })} devices={devices} flowId={flowId} />
          <div>
            <label className={label}>Turn it</label>
            <select className={select} value={String(config.action ?? "")} onChange={(e) => set({ action: e.target.value, minutes: e.target.value === "onFor" ? config.minutes ?? 15 : null })}>
              {actions.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            {kind === "temperature" && <p className={hint}>In a temperature flow the relay stays on while this step is reached, and goes off when it isn't.</p>}
          </div>
          {config.action === "onFor" && (
            <div>
              <label className={label}>Minutes</label>
              <NumberField value={config.minutes} onChange={(v) => set({ minutes: v })} step="1" min={1} max={1440} className="w-28" />
              <p className={hint}>The Shelly counts this down itself, so it switches off on time even if FermentOS restarts.</p>
            </div>
          )}
        </>
      );
      break;
    }
    case "action.notify":
      fields = (
        <div>
          <label className={label}>Message</label>
          <Textarea value={String(config.message ?? "")} onChange={(e) => set({ message: e.target.value })} rows={3} className="text-sm" maxLength={500} />
          <p className={hint}>
            <code>{"{flow}"}</code> is replaced by the flow's name and <code>{"{temp}"}</code> by the current temperature. Sent each time this step is newly reached.
          </p>
        </div>
      );
      break;
    case "action.delay":
      fields = (
        <div>
          <label className={label}>Wait (minutes)</label>
          <NumberField value={config.minutes} onChange={(v) => set({ minutes: v })} step="1" min={1} max={1440} className="w-28" />
          <p className={hint}>A wait in progress is dropped if FermentOS restarts.</p>
        </div>
      );
      break;
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold flex items-center gap-1.5"><Icon className="w-4 h-4" />{NODE_LABELS[type]}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{NODE_HINTS[type]}</p>
      </div>
      {problems.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 space-y-0.5">
          {problems.map((p, i) => <p key={i} className="text-xs text-destructive">{p}</p>)}
        </div>
      )}
      {/* Re-mount per node so each field's draft text starts from that node's config. */}
      <fieldset key={id} disabled={readOnly} className="space-y-3">{fields}</fieldset>
      {!readOnly && (
        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive w-full" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />Delete step
        </Button>
      )}
    </div>
  );
}
