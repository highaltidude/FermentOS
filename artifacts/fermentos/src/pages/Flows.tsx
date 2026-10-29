import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import {
  Plus, Trash2, Play, ChevronDown, ChevronRight, Thermometer, Clock, AlertTriangle, Loader2, Workflow, Pencil, BookOpen,
} from "lucide-react";
import {
  useListFlows,
  getListFlowsQueryKey,
  useCreateFlow,
  useDeleteFlow,
  useEnableFlow,
  useDisableFlow,
  useRunFlow,
  useGetFlowStatus,
  getGetFlowStatusQueryKey,
  useListFlowRuns,
  getListFlowRunsQueryKey,
  useListOutputDevices,
  getListOutputDevicesQueryKey,
  useListSensorDevices,
  useListRecipes,
  type Flow,
  type FlowGraph,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { FlowStatusLine } from "@/components/flows/FlowStatusLine";
import { ExperimentalBadge } from "@/components/flows/ExperimentalBadge";
import { useToast } from "@/hooks/use-toast";
import { useFermentTempUnit } from "@/hooks/useFermentTempUnit";
import { getErrorMessage, cn } from "@/lib/utils";
import { formatShortDateTime } from "./settings/system/integrations/ispindelFormat";
import {
  DAY_LABELS,
  deltaFromUnit,
  describeNode,
  fermentationTemplate,
  fromUnit,
  outline,
  tempSourceOptions,
  timedRelayTemplate,
} from "@/lib/flows";

/** The server's own message (e.g. the list of problems) rather than "HTTP 400 …". */
export function apiError(err: unknown): string {
  const data = (err as { data?: { error?: unknown } } | null)?.data;
  return typeof data?.error === "string" ? data.error : getErrorMessage(err);
}

export default function Flows() {
  const [showNew, setShowNew] = useState(false);
  const { data: flows = [], isLoading } = useListFlows({ query: { refetchInterval: 30_000, queryKey: getListFlowsQueryKey() } });
  const { data: devices = [] } = useListOutputDevices({ query: { queryKey: getListOutputDevicesQueryKey() } });
  // A probe-only device (The Pill in OneWire mode) can feed a flow but not be switched by one.
  const hasRelays = devices.some((d) => d.state.hasRelay);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-xl font-bold text-foreground whitespace-nowrap">Brew Flows</h1>
            <ExperimentalBadge />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Automations that switch your relays from a temperature or on a schedule.</p>
        </div>
        <Button size="sm" onClick={() => setShowNew(true)} disabled={!hasRelays}>
          <Plus className="w-4 h-4" />New flow
        </Button>
      </div>

      {!hasRelays && (
        <div className="bg-card border border-card-border rounded-lg p-4 text-sm text-muted-foreground">
          Flows switch Shelly relays. Add one under{" "}
          <Link href="/settings?tab=system&section=connectivity" className="text-primary underline underline-offset-2">
            Settings → System → Integrations
          </Link>{" "}
          first.
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : flows.length === 0 && hasRelays ? (
        <div className="bg-card border border-card-border rounded-lg p-8 text-center">
          <Workflow className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No flows yet. Start from a template — hold a fermenter at temperature, or run a relay on a timer.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flows.map((f) => <FlowCard key={f.id} flow={f} />)}
        </div>
      )}

      <NewFlowDialog open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}

function FlowCard({ flow }: { flow: Flow }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const unit = useFermentTempUnit();
  const [open, setOpen] = useState(false);
  const { data: devices = [] } = useListOutputDevices({ query: { queryKey: getListOutputDevicesQueryKey() } });
  const { data: sensors = [] } = useListSensorDevices();
  const { data: recipes = [] } = useListRecipes({});
  const { data: status } = useGetFlowStatus(flow.id, {
    query: { enabled: flow.enabled, refetchInterval: 10_000, queryKey: getGetFlowStatusQueryKey(flow.id) },
  });
  const runsParams = { limit: 20 };
  const { data: runs = [] } = useListFlowRuns(flow.id, runsParams, {
    query: { enabled: open, refetchInterval: open ? 15_000 : false, queryKey: getListFlowRunsQueryKey(flow.id, runsParams) },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListFlowsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFlowStatusQueryKey(flow.id) });
    qc.invalidateQueries({ queryKey: getListFlowRunsQueryKey(flow.id, runsParams) });
    qc.invalidateQueries({ queryKey: getListOutputDevicesQueryKey() });
  };
  const onError = (title: string) => (err: unknown) => toast({ title, description: apiError(err), variant: "destructive" });
  const enable = useEnableFlow({ mutation: { onSuccess: refresh, onError: onError("Couldn't turn the flow on") } });
  const disable = useDisableFlow({ mutation: { onSuccess: refresh, onError: onError("Couldn't turn the flow off") } });
  const run = useRunFlow({
    mutation: { onSuccess: () => { toast({ title: "Flow started" }); setTimeout(refresh, 1500); }, onError: onError("Couldn't run the flow") },
  });
  const remove = useDeleteFlow({ mutation: { onSuccess: () => { refresh(); toast({ title: "Flow deleted" }); }, onError: onError("Couldn't delete the flow") } });

  const lookups = { devices, sensors, unit };
  const steps = outline(flow.graph);
  const busy = enable.isPending || disable.isPending;

  const statusLine = flow.enabled ? <FlowStatusLine status={status} unit={unit} /> : null;

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 flex items-start gap-3">
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-0.5 text-muted-foreground hover:text-foreground" title={open ? "Collapse" : "Expand"}>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {flow.kind === "schedule" ? <Clock className="w-4 h-4 text-muted-foreground" />
              : flow.kind === "temperature" ? <Thermometer className="w-4 h-4 text-muted-foreground" />
              : <Workflow className="w-4 h-4 text-muted-foreground" />}
            <button type="button" onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-foreground text-left">{flow.name}</button>
            {flow.recipeIds.map((rid) => {
              const r = recipes.find((x) => x.id === rid);
              return r ? <Link key={rid} href={`/recipes/${rid}`}><Badge variant="muted"><BookOpen className="w-3 h-3" />{r.name}</Badge></Link> : null;
            })}
            {flow.problems.length > 0 && <Badge variant="warning"><AlertTriangle className="w-3 h-3" />Needs attention</Badge>}
            {flow.enabled && status?.failsafe && <Badge variant="destructive">Fail-safe</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {(steps.length > 1 ? steps.slice(1) : steps).map((s) => describeNode(s.node, lookups)).join(" → ") || "No steps"}
          </p>
          {((flow.enabled && status) || flow.lastError) && (
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {statusLine}
              {flow.lastError && !status?.failsafe && <p className="text-destructive">Last error: {flow.lastError}</p>}
            </div>
          )}
        </div>
        <Switch
          checked={flow.enabled}
          disabled={busy}
          title={flow.enabled ? "Turn off" : "Turn on"}
          onChange={() => (flow.enabled ? disable.mutate({ id: flow.id }) : enable.mutate({ id: flow.id }))}
        />
      </div>

      {open && (
        <div className="border-t border-card-border px-4 py-3 space-y-4">
          {flow.problems.length > 0 && (
            <div className="space-y-0.5">
              {flow.problems.map((p, i) => (
                <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{p.message}
                </p>
              ))}
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Steps</p>
            <ol className="space-y-1">
              {steps.map(({ node, depth }) => {
                const live = status?.nodes[node.id];
                return (
                  <li key={node.id} className="flex items-center gap-2 text-sm" style={{ paddingLeft: depth * 16 }}>
                    <span
                      className={cn("w-1.5 h-1.5 rounded-full shrink-0", flow.enabled && live?.active ? "bg-green-500" : "bg-muted-foreground/40")}
                      title={flow.enabled && live?.active ? "Active" : "Not active"}
                    />
                    <span className="text-foreground">{describeNode(node, lookups)}</span>
                    {flow.enabled && live?.reason && (
                      <span className="text-xs text-muted-foreground">({live.reason.replace(/_/g, " ")})</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Recent activity</p>
            {runs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="space-y-1">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 text-xs">
                    <span className="text-muted-foreground shrink-0 w-28">{formatShortDateTime(r.startedAt)}</span>
                    <span className={cn(
                      r.status === "failsafe" || r.status === "error" ? "text-destructive" : r.status === "skipped" ? "text-muted-foreground" : "text-foreground",
                    )}>
                      {r.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <Link href={`/flows/${flow.id}`}>
              <Button size="sm" variant="outline"><Pencil className="w-3.5 h-3.5" />Open</Button>
            </Link>
            {flow.enabled && flow.kind === "schedule" && (
              <Button size="sm" variant="outline" onClick={() => run.mutate({ id: flow.id })} disabled={run.isPending}>
                <Play className="w-3.5 h-3.5" />Run now
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => { if (confirm(`Delete "${flow.name}"? Relays it controls will be switched off.`)) remove.mutate({ id: flow.id }); }}
            >
              <Trash2 className="w-3.5 h-3.5" />Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── New flow from a template ────────────────────────────────────────────────

type Template = "fermentation" | "timer";

/**
 * New flow from a template. Given a `recipe`, it goes straight to the
 * fermentation template, follows the brew's temperatures and links the flow to
 * that recipe.
 */
export function NewFlowDialog({ open, onClose, recipe }: { open: boolean; onClose: () => void; recipe?: { id: number; name: string } }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const unit = useFermentTempUnit();
  const { data: devices = [] } = useListOutputDevices({ query: { queryKey: getListOutputDevicesQueryKey() } });
  const { data: sensors = [] } = useListSensorDevices();
  const [, navigate] = useLocation();
  const [template, setTemplate] = useState<Template | null>(recipe ? "fermentation" : null);
  const [followBrew, setFollowBrew] = useState(!!recipe);
  const [name, setName] = useState("");
  const [enableNow, setEnableNow] = useState(true);
  // Fermentation
  const [source, setSource] = useState("");
  const [relayId, setRelayId] = useState("");
  const [mode, setMode] = useState<"heat" | "cool">("heat");
  const [setpoint, setSetpoint] = useState(unit === "F" ? "68" : "20");
  const [hysteresis, setHysteresis] = useState(unit === "F" ? "1" : "0.5");
  const [onlyFermenting, setOnlyFermenting] = useState(false);
  const [crash, setCrash] = useState(false);
  const [crashDays, setCrashDays] = useState("3");
  const [crashTemp, setCrashTemp] = useState(unit === "F" ? "34" : "1");
  const [crashNotify, setCrashNotify] = useState(true);
  // Timer
  const [scheduleKind, setScheduleKind] = useState<"daily" | "everyHours">("daily");
  const [time, setTime] = useState("06:00");
  const [days, setDays] = useState<number[]>([]);
  const [everyHours, setEveryHours] = useState("6");
  const [minutes, setMinutes] = useState("15");

  const reset = () => {
    setTemplate(recipe ? "fermentation" : null); setName(""); setSource(""); setRelayId(""); setOnlyFermenting(false); setCrash(false); setFollowBrew(!!recipe);
  };
  const close = () => { reset(); onClose(); };

  const enable = useEnableFlow();
  const create = useCreateFlow({
    mutation: {
      onSuccess: async (flow) => {
        if (enableNow) {
          try {
            await enable.mutateAsync({ id: flow.id });
          } catch (err) {
            toast({ title: "Flow saved, but not turned on", description: apiError(err), variant: "destructive" });
          }
        }
        qc.invalidateQueries({ queryKey: getListFlowsQueryKey() });
        qc.invalidateQueries({ queryKey: getListOutputDevicesQueryKey() });
        toast({ title: "Flow created" });
        close();
      },
      onError: (err) => toast({ title: "Couldn't create the flow", description: apiError(err), variant: "destructive" }),
    },
  });

  const sourceOptions = tempSourceOptions(sensors, devices);
  const relays = devices.filter((d) => d.state.hasRelay);
  const freeRelays = relays.filter((d) => !d.controlledBy);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    let graph: FlowGraph;
    if (template === "fermentation") {
      const src = sourceOptions.find((o) => o.key === source)?.value;
      const sp = Number(setpoint);
      const hy = Number(hysteresis);
      if (!src || !relayId || (!followBrew && !Number.isFinite(sp)) || !(hy > 0)) return;
      const cd = Number(crashDays);
      const ct = Number(crashTemp);
      if (crash && (!(cd >= 0) || !Number.isFinite(ct))) return;
      graph = fermentationTemplate({
        source: src,
        relayId: Number(relayId),
        mode: crash ? "cool" : mode,
        setpointC: fromUnit(Number.isFinite(sp) ? sp : unit === "F" ? 68 : 20, unit),
        hysteresisC: deltaFromUnit(hy, unit),
        onlyWhileFermenting: onlyFermenting,
        coldCrash: crash ? { afterDays: cd, crashC: fromUnit(ct, unit), notify: crashNotify } : null,
        followBrew,
      });
    } else {
      const m = Number(minutes);
      if (!relayId || !(m >= 1)) return;
      graph = timedRelayTemplate({
        schedule: scheduleKind === "daily" ? { kind: "daily", time, days } : { kind: "everyHours", hours: Number(everyHours) },
        relayId: Number(relayId),
        minutes: Math.round(m),
        notify: null,
      });
    }
    const relayName = devices.find((d) => d.id === Number(relayId))?.name ?? "relay";
    const fallback = template !== "fermentation" ? `${relayName} timer`
      : recipe ? `${recipe.name} on ${relayName}`
      : crash ? `${relayName} with cold crash`
      : `${mode === "heat" ? "Heat" : "Cool"} with ${relayName}`;
    create.mutate({ data: { name: name.trim() || fallback, graph, recipeIds: recipe ? [recipe.id] : undefined } });
  };

  const label = "text-xs text-muted-foreground mb-1 block";
  const select = "w-full text-sm bg-background border border-border rounded-md px-2 h-9 text-foreground";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{template === null ? "New flow" : template === "fermentation" ? "Fermentation temperature" : "Timed relay"}</DialogTitle>
        </DialogHeader>

        {template === null ? (
          <div className="grid gap-2">
            <button type="button" onClick={() => setTemplate("fermentation")} className="text-left border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors">
              <p className="text-sm font-medium flex items-center gap-1.5"><Thermometer className="w-4 h-4" />Fermentation temperature</p>
              <p className="text-xs text-muted-foreground mt-0.5">Hold a fermenter at a target by switching a heat wrap or a fridge, from an iSpindel or a Shelly probe.</p>
            </button>
            <button type="button" onClick={() => setTemplate("timer")} className="text-left border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors">
              <p className="text-sm font-medium flex items-center gap-1.5"><Clock className="w-4 h-4" />Timed relay</p>
              <p className="text-xs text-muted-foreground mt-0.5">Run a relay for a set time on a schedule — a recirculation pump, a crash-chill window.</p>
            </button>
            <button
              type="button"
              onClick={() => { close(); navigate("/flows/new"); }}
              className="hidden md:block text-left border border-dashed border-border rounded-lg p-3 hover:bg-muted/50 transition-colors"
            >
              <p className="text-sm font-medium flex items-center gap-1.5"><Workflow className="w-4 h-4" />Blank flow</p>
              <p className="text-xs text-muted-foreground mt-0.5">Build your own from triggers, conditions and actions on the canvas.</p>
            </button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={submit}>
            <div>
              <label className={label}>Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={recipe ? `${recipe.name} fermentation` : template === "fermentation" ? "Fermenter 1 heat" : "Morning recirculation"} className="text-sm" />
            </div>

            <div>
              <label className={label}>Relay</label>
              <select className={select} value={relayId} onChange={(e) => setRelayId(e.target.value)} required>
                <option value="">Choose a relay…</option>
                {freeRelays.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              {freeRelays.length < relays.length && (
                <p className="text-[11px] text-muted-foreground mt-1">Relays already used by an enabled flow aren't listed.</p>
              )}
            </div>

            {template === "fermentation" ? (
              <>
                <div>
                  <label className={label}>Temperature from</label>
                  <select className={select} value={source} onChange={(e) => setSource(e.target.value)} required>
                    <option value="">Choose a sensor…</option>
                    {sourceOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  {sourceOptions.length === 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">No sensors yet. An iSpindel appears after its first reading, a Shelly probe once it reports a temperature.</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={label}>Mode</label>
                    <select className={select} value={crash ? "cool" : mode} disabled={crash} onChange={(e) => setMode(e.target.value as "heat" | "cool")}>
                      <option value="heat">Heat</option>
                      <option value="cool">Cool</option>
                    </select>
                  </div>
                  {!followBrew && (
                    <div>
                      <label className={label}>Target °{unit}</label>
                      <Input type="number" step="0.1" value={setpoint} onChange={(e) => setSetpoint(e.target.value)} className="text-sm" required />
                    </div>
                  )}
                  <div>
                    <label className={label}>Swing °{unit}</label>
                    <Input type="number" step="0.1" min="0.1" value={hysteresis} onChange={(e) => setHysteresis(e.target.value)} className="text-sm" required />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={followBrew} onChange={(e) => setFollowBrew(e.target.checked)} />
                  Use the brew's own temperatures
                </label>
                <p className="text-[11px] text-muted-foreground">
                  {followBrew
                    ? "Targets the ideal fermentation temperature while the sensor's brew is fermenting and its conditioning temperature while conditioning — the brew's own, else its recipe's."
                    : mode === "heat" && !crash
                      ? `Turns on below ${(Number(setpoint) - Number(hysteresis)).toFixed(1)}°${unit} and off again at ${Number(setpoint).toFixed(1)}°${unit}.`
                      : `Turns on above ${(Number(setpoint) + Number(hysteresis)).toFixed(1)}°${unit} and off again at ${Number(setpoint).toFixed(1)}°${unit}.`}
                  {(mode === "cool" || crash) && " Stays off at least 5 minutes between runs to protect the compressor."}
                  {recipe && ` It will only run while a ${recipe.name} brew is on the sensor.`}
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={crash} onChange={(e) => setCrash(e.target.checked)} />
                  Cold crash after conditioning starts
                </label>
                {crash ? (
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm">
                      After
                      <Input type="number" min="0" max="365" step="0.5" value={crashDays} onChange={(e) => setCrashDays(e.target.value)} className="h-8 w-16 text-sm" required />
                      days in conditioning, cool to
                      <Input type="number" step="0.1" value={crashTemp} onChange={(e) => setCrashTemp(e.target.value)} className="h-8 w-16 text-sm" required />
                      °{unit}
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={crashNotify} onChange={(e) => setCrashNotify(e.target.checked)} />
                      Notify me when the crash starts
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                      Cold crashing needs a fridge, so the relay runs in Cool mode. It holds the target while the brew is fermenting and
                      for the first {Number(crashDays) || 0} days of conditioning, then crashes. Days count from when you move the brew
                      the sensor is assigned to into Conditioning.
                    </p>
                  </div>
                ) : !followBrew && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={onlyFermenting} onChange={(e) => setOnlyFermenting(e.target.checked)} />
                    Only while the sensor's brew is fermenting or conditioning
                  </label>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={label}>Repeat</label>
                    <select className={select} value={scheduleKind} onChange={(e) => setScheduleKind(e.target.value as "daily" | "everyHours")}>
                      <option value="daily">At a time of day</option>
                      <option value="everyHours">Every few hours</option>
                    </select>
                  </div>
                  {scheduleKind === "daily" ? (
                    <div>
                      <label className={label}>Time</label>
                      <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="text-sm" required />
                    </div>
                  ) : (
                    <div>
                      <label className={label}>Every</label>
                      <select className={select} value={everyHours} onChange={(e) => setEveryHours(e.target.value)}>
                        {[1, 2, 3, 4, 6, 8, 12].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? "s" : ""}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                {scheduleKind === "daily" && (
                  <div>
                    <label className={label}>Days <span className="font-normal">(none selected = every day)</span></label>
                    <div className="flex flex-wrap gap-1">
                      {DAY_LABELS.map((d, i) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))}
                          className={cn("text-xs px-2 py-1 rounded border", days.includes(i) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className={label}>Run for (minutes)</label>
                  <Input type="number" min="1" max="1440" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="text-sm w-28" required />
                  <p className="text-[11px] text-muted-foreground mt-1">The Shelly counts this down itself, so it switches off on time even if FermentOS restarts.</p>
                </div>
              </>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enableNow} onChange={(e) => setEnableNow(e.target.checked)} />
              Turn on now
            </label>

            <DialogFooter>
              {!recipe && <Button type="button" variant="ghost" size="sm" onClick={() => setTemplate(null)}>Back</Button>}
              <Button type="submit" size="sm" disabled={create.isPending}>
                {create.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Create flow
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
