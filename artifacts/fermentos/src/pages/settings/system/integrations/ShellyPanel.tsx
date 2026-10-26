import { useState } from "react";
import { Plus, Trash2, Loader2, Power, ShieldCheck, Pencil, Check, X, XCircle, CheckCircle, AlertTriangle, ToggleRight } from "lucide-react";
import {
  useListOutputDevices,
  getListOutputDevicesQueryKey,
  useCreateOutputDevice,
  useProbeOutputDevice,
  useUpdateOutputDevice,
  useDeleteOutputDevice,
  useSetOutputDeviceRelay,
  useApplyOutputDeviceSafeDefaults,
  useListSensorDevices,
  getListSensorDevicesQueryKey,
  useAssignSensorDevice,
  useUnassignSensorDevice,
  useListBrewSessions,
  type OutputDevice,
  type ProbeOutputDeviceResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useFermentTempUnit } from "@/hooks/useFermentTempUnit";
import { getErrorMessage } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const emptyForm = { name: "", host: "", username: "", password: "" };

function formatTemp(tempC: number, unit: "C" | "F"): string {
  return unit === "F" ? `${(tempC * 9 / 5 + 32).toFixed(1)}°F` : `${tempC.toFixed(1)}°C`;
}

export function ShellyPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const unit = useFermentTempUnit();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [probe, setProbe] = useState<ProbeOutputDeviceResult | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [timedMinutes, setTimedMinutes] = useState<Record<number, string>>({});

  // Relay state changes on the device too (its button, its own timer), so keep the list fresh.
  const { data: devices = [] } = useListOutputDevices({ query: { refetchInterval: 10_000, queryKey: getListOutputDevicesQueryKey() } });
  const { data: sensors = [] } = useListSensorDevices();
  const { data: brewSessions = [] } = useListBrewSessions();
  const activeSessions = brewSessions.filter((s) => ["brew_day", "fermenting", "conditioning"].includes(s.status));

  const invalidate = () => qc.invalidateQueries({ queryKey: getListOutputDevicesQueryKey() });
  const onError = (title: string) => (err: unknown) =>
    toast({ title, description: getErrorMessage(err), variant: "destructive" });

  const closeAdd = () => { setShowAdd(false); setForm(emptyForm); setProbe(null); };

  const probeDevice = useProbeOutputDevice({
    mutation: { onSuccess: (r) => setProbe(r), onError: onError("Probe failed") },
  });
  const createDevice = useCreateOutputDevice({
    mutation: {
      onSuccess: () => { invalidate(); closeAdd(); toast({ title: "Relay added" }); },
      onError: onError("Could not add relay"),
    },
  });
  const updateDevice = useUpdateOutputDevice({
    mutation: { onSuccess: () => { invalidate(); setEditingId(null); }, onError: onError("Could not update relay") },
  });
  const deleteDevice = useDeleteOutputDevice({
    mutation: { onSuccess: () => { invalidate(); toast({ title: "Relay removed" }); }, onError: onError("Could not remove relay") },
  });
  const setRelay = useSetOutputDeviceRelay({
    mutation: { onSuccess: invalidate, onError: onError("Relay did not switch") },
  });
  const safeDefaults = useApplyOutputDeviceSafeDefaults({
    mutation: {
      onSuccess: () => toast({ title: "Safe default applied", description: "The relay will now come back off after a power cut." }),
      onError: onError("Could not apply safe default"),
    },
  });
  const sensorMutation = { mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListSensorDevicesQueryKey() }) } };
  const assignSensor = useAssignSensorDevice(sensorMutation);
  const unassignSensor = useUnassignSensorDevice(sensorMutation);

  const credentials = { username: form.username || null, password: form.password || null };

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 border-b border-card-border flex items-center gap-2">
        <ToggleRight className="w-4 h-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Shelly Relays</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Switch a heat wrap, fridge or pump with a Shelly 1 (SHSW-1) on your network. A temperature add-on probe is read too.</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Relays</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />Add relay
          </Button>
        </div>

        {devices.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">No relays yet. Add one by its IP address — you'll find it in the Shelly app or your router's device list.</p>
        )}

        <div className="space-y-2">
          {devices.map((d: OutputDevice) => {
            const sensor = sensors.find((s) => s.device.id === d.probeSensorDeviceId);
            const busy = setRelay.isPending && setRelay.variables?.id === d.id;
            // A flow owns this relay; switching by hand would be undone on its next tick.
            const locked = d.controlledBy != null;
            const minutes = timedMinutes[d.id] ?? "";
            return (
              <div key={d.id} className="bg-muted/30 rounded-lg p-3 border border-border">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {editingId === d.id ? (
                      <form
                        className="flex items-center gap-1.5"
                        onSubmit={(e) => { e.preventDefault(); if (editName.trim()) updateDevice.mutate({ id: d.id, data: { name: editName } }); }}
                      >
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 text-sm" autoFocus />
                        <Button type="submit" size="sm" variant="ghost" className="h-7 px-2"><Check className="w-3.5 h-3.5" /></Button>
                        <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)}><X className="w-3.5 h-3.5" /></Button>
                      </form>
                    ) : (
                      <div className="group flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.state.reachable ? "bg-green-500" : "bg-destructive"}`} />
                        <span className="text-sm font-medium text-foreground">{d.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">· {d.host}</span>
                        <button
                          type="button"
                          className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditingId(d.id); setEditName(d.name); }}
                          title="Rename relay"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      {d.state.reachable ? (
                        <span className={d.state.ison ? "text-green-600 dark:text-green-400 font-medium" : ""}>
                          {d.state.ison ? "On" : "Off"}
                        </span>
                      ) : (
                        <span className="text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />{d.state.lastError ?? "Unreachable"}
                        </span>
                      )}
                      {d.state.tempC != null && <span>{formatTemp(d.state.tempC, unit)}</span>}
                      {d.state.rssi != null && <span>📶 {d.state.rssi} dBm</span>}
                    </div>

                    {/* Manual control */}
                    {locked ? (
                      <p className="text-xs text-muted-foreground mt-2">
                        Controlled by the flow{" "}
                        <Link href="/flows" className="text-primary underline underline-offset-2">{d.controlledBy!.name}</Link>
                        . Turn the flow off to switch it by hand.
                      </p>
                    ) : (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={d.state.ison ? "default" : "outline"}
                        className="h-7"
                        disabled={!d.state.reachable || busy}
                        onClick={() => setRelay.mutate({ id: d.id, data: { on: !d.state.ison } })}
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                        {d.state.ison ? "Turn off" : "Turn on"}
                      </Button>
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const m = Number(minutes);
                          if (m > 0) setRelay.mutate({ id: d.id, data: { on: true, durationSec: Math.round(m * 60) } });
                        }}
                      >
                        <Input
                          type="number"
                          min={1}
                          max={1440}
                          value={minutes}
                          onChange={(e) => setTimedMinutes((t) => ({ ...t, [d.id]: e.target.value }))}
                          placeholder="min"
                          className="h-7 w-16 text-xs"
                          aria-label="Minutes"
                        />
                        <Button type="submit" size="sm" variant="outline" className="h-7" disabled={!d.state.reachable || busy || !(Number(minutes) > 0)}>
                          On for…
                        </Button>
                      </form>
                    </div>
                    )}

                    {/* The add-on probe is a sensor device, so it can feed a brew's chart and alerts. */}
                    {sensor && (
                      <div className="flex items-center gap-2 mt-2">
                        {sensor.assignedBrewSessionId ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">Probe → {sensor.assignedBrewName ?? "Active brew"}</span>
                            <button
                              type="button"
                              onClick={() => unassignSensor.mutate({ id: sensor.device.id })}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Unassign probe"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <select
                            className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground max-w-[220px]"
                            value=""
                            onChange={(e) => {
                              if (e.target.value) assignSensor.mutate({ id: sensor.device.id, data: { brewSessionId: Number(e.target.value) } });
                            }}
                          >
                            <option value="">Log probe to brew…</option>
                            {activeSessions.map((s) => (
                              <option key={s.id} value={s.id}>{s.recipeName}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <button
                      type="button"
                      onClick={() => safeDefaults.mutate({ id: d.id })}
                      disabled={!d.state.reachable}
                      className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                      title="Make the relay come back off after a power cut"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (confirm(`Remove "${d.name}"? The relay will be switched off.`)) deleteDevice.mutate({ id: d.id }); }}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove relay"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) closeAdd(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a Shelly relay</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (probe?.ok) {
                createDevice.mutate({ data: { name: form.name || probe.model || "Shelly relay", host: probe.host, ...credentials } });
              } else {
                probeDevice.mutate({ data: { host: form.host, ...credentials } });
              }
            }}
          >
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">IP address or hostname</label>
              <Input
                value={form.host}
                onChange={(e) => { setForm((f) => ({ ...f, host: e.target.value })); setProbe(null); }}
                placeholder="192.168.1.40"
                className="text-sm"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Fermenter heat wrap" className="text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Username <span className="font-normal">(if login is restricted)</span></label>
                <Input value={form.username} onChange={(e) => { setForm((f) => ({ ...f, username: e.target.value })); setProbe(null); }} className="text-sm" autoComplete="off" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Password</label>
                <Input type="password" value={form.password} onChange={(e) => { setForm((f) => ({ ...f, password: e.target.value })); setProbe(null); }} className="text-sm" autoComplete="new-password" />
              </div>
            </div>

            {probe && (
              probe.ok ? (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-start gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>
                    Found a {probe.model} at {probe.host}. Relay is {probe.ison ? "on" : "off"}
                    {probe.tempC != null ? `, probe reads ${formatTemp(probe.tempC, unit)}` : ", no temperature probe fitted"}.
                  </span>
                </p>
              ) : (
                <p className="text-xs text-destructive flex items-start gap-1.5">
                  <XCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>{probe.error}</span>
                </p>
              )
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={closeAdd}>Cancel</Button>
              <Button type="submit" size="sm" disabled={probeDevice.isPending || createDevice.isPending}>
                {(probeDevice.isPending || createDevice.isPending) && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
                {probe?.ok ? "Add relay" : "Check device"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
