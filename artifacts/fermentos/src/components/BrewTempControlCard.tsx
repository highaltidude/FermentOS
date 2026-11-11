import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Flame, Snowflake, Thermometer, Trash2, Loader2, Workflow } from "lucide-react";
import {
  useListOutputDevices,
  getListOutputDevicesQueryKey,
  useListSensorDevices,
  getListSensorDevicesQueryKey,
  useListFlows,
  getListFlowsQueryKey,
  useCreateFlow,
  useEnableFlow,
  useDisableFlow,
  useDeleteFlow,
  useGetFlowStatus,
  getGetFlowStatusQueryKey,
  useAssignSensorDevice,
  type Flow,
  type OutputDevice,
  type BrewStatus,
  type SensorDeviceWithStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useFermentTempUnit } from "@/hooks/useFermentTempUnit";
import { apiError } from "@/pages/Flows";
import { FlowStatusLine } from "@/components/flows/FlowStatusLine";
import { ExperimentalBadge } from "@/components/flows/ExperimentalBadge";
import { brewTempControlTemplate, deltaFromUnit, deltaToUnit, formatTemp, sourceKey, tempSourceOptions, type TempSourceChoice } from "@/lib/flows";

const SETTINGS_LINK = "/settings?tab=system&section=connectivity";

/** The temperature trigger's source, if the flow has one. */
function flowSource(flow: Flow): TempSourceChoice | undefined {
  const trigger = flow.graph.nodes.find((n) => n.type === "trigger.temperature");
  return (trigger?.data.config as { source?: TempSourceChoice } | undefined)?.source;
}

/** The temperature trigger's source key ("shelly:3", "shelly:3:201", "sensor:5"), or "" for other flows. */
function flowSourceKey(flow: Flow): string {
  return sourceKey(flowSource(flow));
}

/**
 * Hold this brew at its ideal temperature for each stage with a heater and/or
 * a cooler, driven by a probe on the brew (The Pill, a Shelly add-on, or an
 * iSpindel). Under the hood it's a Brew Flow linked to the brew's recipe.
 */
export function BrewTempControlCard({ session }: {
  session: { id: number; recipeId?: number | null; recipeName: string; status: BrewStatus };
}) {
  const { data: devices = [] } = useListOutputDevices({ query: { refetchInterval: 10_000, queryKey: getListOutputDevicesQueryKey() } });
  const { data: sensors = [] } = useListSensorDevices({ query: { refetchInterval: 30_000, queryKey: getListSensorDevicesQueryKey() } });
  const { data: flows = [] } = useListFlows({ query: { queryKey: getListFlowsQueryKey() } });

  // Every probe that can drive control, paired with the sensor that ties it to a brew.
  const sources = tempSourceOptions(sensors, devices).map((option, i) => ({ ...option, sensor: sensors[i]! }));
  const onThisBrew = sources.filter((s) => s.sensor.assignedBrewSessionId === session.id);
  const brewKeys = new Set(onThisBrew.map((s) => s.key));
  const controlFlows = flows.filter((f) => f.kind === "temperature" && brewKeys.has(flowSourceKey(f)));

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 border-b border-card-border flex items-center gap-2">
        <Thermometer className="w-4 h-4 text-muted-foreground" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Temperature control</h2>
            <ExperimentalBadge className="text-[10px] px-1.5" />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Hold the brew at its ideal fermentation, then conditioning, temperature with a heater, a cooler, or both.
          </p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {controlFlows.length > 0 ? (
          <ul className="divide-y divide-border">
            {controlFlows.map((f) => <ControlFlow key={f.id} flow={f} devices={devices} sensors={sensors} />)}
          </ul>
        ) : (
          <SetupForm session={session} sources={sources} devices={devices} />
        )}
        {session.status === "brew_day" && (
          <p className="text-[11px] text-muted-foreground">Control starts once the brew moves to fermenting.</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Targets come from this brew's ideal temperatures (or its recipe's); set them with Edit above. Without one, the relays stay off.
        </p>
      </div>
    </div>
  );
}

type Source = ReturnType<typeof tempSourceOptions>[number] & { sensor: SensorDeviceWithStatus };

function SetupForm({ session, sources, devices }: {
  session: { id: number; recipeId?: number | null; recipeName: string };
  sources: Source[];
  devices: OutputDevice[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const unit = useFermentTempUnit();
  // Prefer a probe already on this brew, and a Shelly probe (10 s readings) over an iSpindel.
  const preferred = [...sources].sort((a, b) =>
    Number(b.sensor.assignedBrewSessionId === session.id) - Number(a.sensor.assignedBrewSessionId === session.id)
    || Number(b.value.kind === "shelly") - Number(a.value.kind === "shelly"))[0];
  const [sourceKeyPick, setSourceKeyPick] = useState(preferred?.key ?? "");
  const [heatId, setHeatId] = useState("");
  const [coolId, setCoolId] = useState("");
  const [hysteresis, setHysteresis] = useState(String(Math.round(deltaToUnit(0.5, unit) * 10) / 10));
  const [saving, setSaving] = useState(false);

  const assign = useAssignSensorDevice();
  const create = useCreateFlow();
  const enable = useEnableFlow();

  const relays = devices.filter((d) => d.state.hasRelay && !d.controlledBy);
  const source = sources.find((s) => s.key === sourceKeyPick) ?? (sourceKeyPick ? undefined : preferred);

  if (sources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No temperature probe yet. Add The Pill (or another Shelly with a DS18B20) under{" "}
        <Link href={SETTINGS_LINK} className="text-primary underline underline-offset-2">Settings → System → Integrations</Link>.
      </p>
    );
  }
  if (relays.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {devices.some((d) => d.state.hasRelay) ? "Every relay is already controlled by a flow." : "No relay to switch yet."} Add a Shelly relay for your heater or
        fridge under <Link href={SETTINGS_LINK} className="text-primary underline underline-offset-2">Settings → System → Integrations</Link>.
      </p>
    );
  }

  const hy = Number(hysteresis);
  const valid = !!source && (heatId !== "" || coolId !== "") && heatId !== coolId && hy > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !source) return;
    const elsewhere = source.sensor.assignedBrewSessionId != null && source.sensor.assignedBrewSessionId !== session.id;
    if (elsewhere && !confirm(`${source.sensor.device.deviceName} is on ${source.sensor.assignedBrewName ?? "another brew"}. Move it to this brew?`)) return;

    setSaving(true);
    try {
      if (source.sensor.assignedBrewSessionId !== session.id) {
        await assign.mutateAsync({ id: source.sensor.device.id, data: { brewSessionId: session.id } });
      }
      const graph = brewTempControlTemplate({
        source: source.value as TempSourceChoice,
        heatRelayId: heatId ? Number(heatId) : null,
        coolRelayId: coolId ? Number(coolId) : null,
        hysteresisC: deltaFromUnit(hy, unit),
      });
      const flow = await create.mutateAsync({
        data: {
          name: `Temp control: ${session.recipeName}`.slice(0, 100),
          graph,
          // Linked, it stands by if a different brew is put on the probe.
          recipeIds: session.recipeId != null ? [session.recipeId] : undefined,
        },
      });
      try {
        await enable.mutateAsync({ id: flow.id });
        toast({ title: "Temperature control on" });
      } catch (err) {
        toast({ title: "Saved, but not turned on", description: apiError(err), variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Couldn't set up temperature control", description: apiError(err), variant: "destructive" });
    } finally {
      setSaving(false);
      qc.invalidateQueries({ queryKey: getListFlowsQueryKey() });
      qc.invalidateQueries({ queryKey: getListOutputDevicesQueryKey() });
      qc.invalidateQueries({ queryKey: getListSensorDevicesQueryKey() });
    }
  };

  const label = "text-xs text-muted-foreground mb-1 block";
  const select = "w-full text-sm bg-background border border-border rounded-md px-2 h-9 text-foreground";
  const relayOptions = (exclude: string) =>
    relays.filter((d) => String(d.id) !== exclude).map((d) => <option key={d.id} value={d.id}>{d.name}</option>);

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div>
        <label className={label} htmlFor="tc-probe">Probe</label>
        <select id="tc-probe" className={select} value={source?.key ?? ""} onChange={(e) => setSourceKeyPick(e.target.value)}>
          {sources.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
              {s.sensor.assignedBrewSessionId === session.id ? " · on this brew" : s.sensor.assignedBrewName ? ` · on ${s.sensor.assignedBrewName}` : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className={label} htmlFor="tc-heat"><Flame className="w-3 h-3 inline mr-1 text-orange-500" />Heat with</label>
          <select id="tc-heat" className={select} value={heatId} onChange={(e) => setHeatId(e.target.value)}>
            <option value="">No heater</option>
            {relayOptions(coolId)}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="tc-cool"><Snowflake className="w-3 h-3 inline mr-1 text-sky-500" />Cool with</label>
          <select id="tc-cool" className={select} value={coolId} onChange={(e) => setCoolId(e.target.value)}>
            <option value="">No cooler</option>
            {relayOptions(heatId)}
          </select>
        </div>
      </div>
      <div>
        <label className={label} htmlFor="tc-band">Allowed drift either side of the target (°{unit})</label>
        <Input id="tc-band" type="number" min={0.1} step={0.1} value={hysteresis} onChange={(e) => setHysteresis(e.target.value)} className="h-9 w-28 text-sm" />
        <p className="text-[11px] text-muted-foreground mt-1">
          The heater comes on this far below the target and the cooler this far above it; both stop at the target.
        </p>
      </div>
      <Button type="submit" size="sm" disabled={!valid || saving}>
        {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}Turn on temperature control
      </Button>
    </form>
  );
}

const REASONS: Record<string, string> = {
  heating: "heating",
  cooling: "cooling",
  idle: "idle",
  holding_min_on: "finishing its minimum run",
  holding_min_off: "resting (compressor protection)",
};

function ControlFlow({ flow, devices, sensors }: { flow: Flow; devices: OutputDevice[]; sensors: SensorDeviceWithStatus[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const unit = useFermentTempUnit();
  const { data: status } = useGetFlowStatus(flow.id, {
    query: { enabled: flow.enabled, refetchInterval: 10_000, queryKey: getGetFlowStatusQueryKey(flow.id) },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListFlowsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFlowStatusQueryKey(flow.id) });
    qc.invalidateQueries({ queryKey: getListOutputDevicesQueryKey() });
  };
  const onError = (title: string) => (err: unknown) => toast({ title, description: apiError(err), variant: "destructive" });
  const enable = useEnableFlow({ mutation: { onSuccess: refresh, onError: onError("Couldn't turn temperature control on") } });
  const disable = useDisableFlow({ mutation: { onSuccess: refresh, onError: onError("Couldn't turn temperature control off") } });
  const remove = useDeleteFlow({
    mutation: { onSuccess: () => { refresh(); toast({ title: "Temperature control removed" }); }, onError: onError("Couldn't remove it") },
  });

  // The thermostats reached on the last tick: one per relay for the current stage.
  const active = flow.graph.nodes
    .filter((n) => n.type === "control.thermostat" && status?.nodes[n.id]?.active)
    .map((n) => {
      const cfg = n.data.config as { outputDeviceId: number; mode: "heat" | "cool" };
      return { id: n.id, ...cfg, state: status!.nodes[n.id]!, device: devices.find((d) => d.id === cfg.outputDeviceId) };
    });

  // The source device's other probes (say, the room beside the wort), for context.
  const source = flowSource(flow);
  const sourceDevice = source?.kind === "shelly" ? devices.find((d) => d.id === source.outputDeviceId) : undefined;
  const otherProbes = (sourceDevice?.state.probes ?? [])
    .filter((p) => (source?.kind === "shelly" && source.probeId != null ? p.id !== source.probeId : !p.isControl))
    .map((p) => ({
      id: p.id,
      name: sensors.find((s) => s.device.id === p.sensorDeviceId)?.device.deviceName ?? `Probe ${p.id}`,
      tempC: p.tempC,
    }));

  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <Workflow className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <Link href={`/flows/${flow.id}`} className="text-sm font-medium text-foreground hover:underline">{flow.name}</Link>
          <div className="text-xs text-muted-foreground mt-0.5">
            {flow.enabled ? <FlowStatusLine status={status} unit={unit} /> : flow.problems.length > 0 ? "Needs attention before it can run" : "Paused: relays are off"}
          </div>
        </div>
        <Switch
          checked={flow.enabled}
          disabled={enable.isPending || disable.isPending}
          title={flow.enabled ? "Pause" : "Resume"}
          onChange={() => (flow.enabled ? disable.mutate({ id: flow.id }) : enable.mutate({ id: flow.id }))}
        />
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive mt-0.5"
          title="Remove temperature control"
          onClick={() => { if (confirm(`Remove "${flow.name}"? Its relays will be switched off.`)) remove.mutate({ id: flow.id }); }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {flow.enabled && !status?.failsafe && !status?.standby && active.length > 0 && (
        <div className="mt-2 ml-7 space-y-1">
          {status?.tempC != null && active[0]?.state.targetC != null && (
            <p className="text-sm text-foreground">
              <span className="text-lg font-semibold tabular-nums">{formatTemp(status.tempC, unit)}</span>
              <span className="text-muted-foreground"> · target {formatTemp(active[0].state.targetC, unit)}</span>
            </p>
          )}
          {otherProbes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {otherProbes.map((p) => `${p.name} ${p.tempC != null ? formatTemp(p.tempC, unit) : "no reading"}`).join(" · ")}
            </p>
          )}
          {active.map((t) => (
            <p key={t.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
              {t.mode === "heat" ? <Flame className="w-3.5 h-3.5 text-orange-500" /> : <Snowflake className="w-3.5 h-3.5 text-sky-500" />}
              <span className="text-foreground">{t.device?.name ?? `Relay ${t.outputDeviceId}`}</span>
              <span className={t.state.relayOn ? "text-green-600 dark:text-green-400 font-medium" : ""}>{t.state.relayOn ? "on" : "off"}</span>
              {t.state.reason && <span>· {REASONS[t.state.reason] ?? t.state.reason.replace(/_/g, " ")}</span>}
            </p>
          ))}
        </div>
      )}
    </li>
  );
}
