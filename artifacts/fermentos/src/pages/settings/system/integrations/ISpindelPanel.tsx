import { useState } from "react";
import {
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  AlertTriangle,
  History,
  ChevronDown,
  ChevronRight,
  Activity,
  Gauge,
  Eye,
  EyeOff,
  Check,
  X,
  Pencil,
} from "lucide-react";
import {
  useGetISpindelSettings,
  useUpdateISpindelSettings,
  getGetISpindelSettingsQueryKey,
  useListSensorDevices,
  useCreateSensorDevice,
  useUpdateSensorDevice,
  useDeleteSensorDevice,
  useAssignSensorDevice,
  useUnassignSensorDevice,
  useSimulateISpindelReading,
  getListSensorDevicesQueryKey,
  useListBrewSessions,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useCopyToClipboard } from "../../useCopyToClipboard";
import { plainHttpHost, plainHttpOrigin } from "../../shared";
import { batteryClass, connectionDotClass, formatShortDateTime } from "./ispindelFormat";
import { ISpindelDeviceDetail } from "./ISpindelDeviceDetail";

export function ISpindelPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { copiedKey, copy } = useCopyToClipboard();
  const [showToken, setShowToken] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [addDeviceForm, setAddDeviceForm] = useState({ deviceName: "", deviceKey: "" });
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null);
  const [editDeviceName, setEditDeviceName] = useState("");
  const [showSimulator, setShowSimulator] = useState(false);
  const [simForm, setSimForm] = useState({ deviceId: "", brewSessionId: "", gravity: "1.060", temperature: "20", battery: "85", angle: "35", rssi: "-70" });
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);

  const { data: settings } = useGetISpindelSettings();
  const { data: devices = [] } = useListSensorDevices();
  const { data: brewSessions = [] } = useListBrewSessions();

  const activeSessions = (brewSessions as any[]).filter((s: any) =>
    ["brew_day", "fermenting", "conditioning"].includes(s.status)
  );

  const updateSettings = useUpdateISpindelSettings({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getGetISpindelSettingsQueryKey() }) },
  });
  const createDevice = useCreateSensorDevice({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSensorDevicesQueryKey() });
        setShowAddDevice(false);
        setAddDeviceForm({ deviceName: "", deviceKey: "" });
        toast({ title: "Device registered" });
      },
    },
  });
  const updateDevice = useUpdateSensorDevice({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListSensorDevicesQueryKey() }); setEditingDeviceId(null); toast({ title: "Device renamed" }); } },
  });
  const deleteDevice = useDeleteSensorDevice({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListSensorDevicesQueryKey() }); toast({ title: "Device removed" }); } },
  });
  const assignDevice = useAssignSensorDevice({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListSensorDevicesQueryKey() }); toast({ title: "Device assigned" }); } },
  });
  const unassignDevice = useUnassignSensorDevice({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListSensorDevicesQueryKey() }); toast({ title: "Device unassigned" }); } },
  });
  const simulate = useSimulateISpindelReading({
    mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListSensorDevicesQueryKey() }); toast({ title: "Simulated reading sent" }); } },
  });

  const plainHttp = plainHttpHost();
  const endpointUrl = `${plainHttpOrigin()}/api/integrations/ispindel`;
  const enabled = settings?.enabled ?? true;

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">iSpindel Integration</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Receive Wi-Fi hydrometer readings directly from your iSpindel device.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => updateSettings.mutate({ data: { enabled: !enabled, token: settings?.token ?? null } })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${enabled ? "bg-primary" : "bg-muted border border-border"}`}
          role="switch"
          aria-checked={enabled}
          title={enabled ? "Disable" : "Enable"}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {selectedDeviceId != null && (() => {
          const sel = (devices as any[]).find((d: any) => d.device.id === selectedDeviceId);
          if (!sel) return null;
          return (
            <ISpindelDeviceDetail
              deviceId={selectedDeviceId}
              device={sel}
              onBack={() => setSelectedDeviceId(null)}
              brewSessions={brewSessions as any[]}
            />
          );
        })()}
        {selectedDeviceId != null ? null : <>
        {/* Endpoint URL */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">POST Endpoint — paste this into your iSpindel "Server" config</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono text-foreground overflow-x-auto whitespace-nowrap">{endpointUrl}</code>
            <button type="button" onClick={() => copy("url", endpointUrl)} className="shrink-0 p-2 rounded hover:bg-muted text-muted-foreground transition-colors" title="Copy URL">
              {copiedKey === "url" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">In the iSpindel web UI: Protocol → HTTP · Server Address → <code className="font-mono">{plainHttp.host}</code> · Port → {plainHttp.port} · URL → <code className="font-mono">/api/integrations/ispindel</code></p>
        </div>

        {/* Token */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Security Token <span className="font-normal">(optional)</span></p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={showToken ? "text" : "password"}
                value={newToken !== "" ? newToken : (settings?.token ?? "")}
                onChange={(e) => setNewToken(e.target.value)}
                placeholder="Leave blank to accept all requests"
                className="text-xs font-mono pr-8"
              />
              <button type="button" onClick={() => setShowToken((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <Button size="sm" variant="outline" onClick={() => {
              updateSettings.mutate({ data: { enabled, token: newToken || null } });
              toast({ title: "Token saved" });
              setNewToken("");
            }}>Save</Button>
            {settings?.token && (
              <Button size="sm" variant="ghost" onClick={() => {
                updateSettings.mutate({ data: { enabled, token: null } });
                toast({ title: "Token cleared" });
                setNewToken("");
              }}>Clear</Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">If set, readings must include this exact value in the <code className="font-mono">token</code> field. Leave blank to accept from any device on your network.</p>
        </div>

        {/* Devices */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Devices <span className="ml-1 text-foreground">{(devices as any[]).length}</span>
            </span>
            <Button size="sm" variant="outline" onClick={() => setShowAddDevice((v) => !v)}>
              <Plus className="w-3.5 h-3.5 mr-1" />Register
            </Button>
          </div>

          {showAddDevice && (
            <form
              className="bg-muted/40 rounded-lg p-3 space-y-2 mb-3 border border-border"
              onSubmit={(e) => { e.preventDefault(); createDevice.mutate({ data: addDeviceForm }); }}
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
                  <Input value={addDeviceForm.deviceName} onChange={(e) => setAddDeviceForm((f) => ({ ...f, deviceName: e.target.value }))} placeholder="My iSpindel" className="text-sm" required />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Device Key <span className="font-normal text-muted-foreground">(matches iSpindel "name" field)</span></label>
                  <Input value={addDeviceForm.deviceKey} onChange={(e) => setAddDeviceForm((f) => ({ ...f, deviceKey: e.target.value }))} placeholder="iSpindel-1234" className="text-sm" required />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddDevice(false)}><X className="w-3.5 h-3.5" /></Button>
                <Button type="submit" size="sm" disabled={createDevice.isPending}><Check className="w-3.5 h-3.5 mr-1" />Register</Button>
              </div>
            </form>
          )}

          {(devices as any[]).length === 0 && !showAddDevice && (
            <p className="text-xs text-muted-foreground py-2">No devices yet. Devices auto-register when they send their first reading, or register one manually above.</p>
          )}

          <div className="space-y-2">
            {(devices as any[]).map((d: any) => {
              const reading = d.latestReading;
              return (
                <div key={d.device.id} className="bg-muted/30 rounded-lg p-3 border border-border">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Name row */}
                      <div className="group flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connectionDotClass(d.connectionStatus)}`} />
                        <span className="text-sm font-medium text-foreground">{d.device.deviceName}</span>
                        <span className="text-xs text-muted-foreground font-mono">· {d.device.deviceKey}</span>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditingDeviceId(d.device.id); setEditDeviceName(d.device.deviceName); }}
                          title="Rename device"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Latest reading */}
                      {reading ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                          {reading.gravity != null && <span>SG {Number(reading.gravity).toFixed(3)}</span>}
                          {reading.temperature != null && <span>{Number(reading.temperature).toFixed(1)}{reading.temperatureUnit === "F" ? "°F" : "°C"}</span>}
                          {reading.battery != null && (
                            <span className={batteryClass(reading.batteryPercentEstimate)}>
                              🔋 {Number(reading.battery).toFixed(2)}V{reading.batteryPercentEstimate != null ? ` (~${Math.round(reading.batteryPercentEstimate)}%)` : ""}
                            </span>
                          )}
                          {reading.angle != null && <span>∠ {Number(reading.angle).toFixed(1)}°</span>}
                          {reading.rssi != null && <span>📶 {reading.rssi} dBm</span>}
                          <span className="text-muted-foreground/70">{formatShortDateTime(reading.receivedAt)}</span>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">No readings yet</p>
                      )}

                      {/* Assignment */}
                      <div className="flex items-center gap-2 mt-2">
                        {d.assignedBrewSessionId ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">→ {d.assignedBrewName ?? "Active brew"}</span>
                            <button
                              type="button"
                              onClick={() => unassignDevice.mutate({ id: d.device.id })}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Unassign"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <select
                            className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground max-w-[220px]"
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) assignDevice.mutate({ id: d.device.id, data: { brewSessionId: Number(e.target.value) } });
                            }}
                          >
                            <option value="">Assign to brew…</option>
                            {activeSessions.map((s: any) => (
                              <option key={s.id} value={s.id}>{s.recipeName}</option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Alerts */}
                      {d.alerts?.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {d.alerts.map((a: any, i: number) => (
                            <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0" />{a.message}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <button
                        type="button"
                        onClick={() => setSelectedDeviceId(d.device.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="View readings"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (confirm(`Remove "${d.device.deviceName}"?`)) deleteDevice.mutate({ id: d.device.id }); }}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove device"
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

        {/* Simulator */}
        <div>
          <button
            type="button"
            onClick={() => setShowSimulator((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showSimulator ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Developer: Simulate iSpindel Reading
          </button>
          {showSimulator && (
            <div className="mt-2 bg-muted/40 rounded-lg p-3 border border-border space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Device</label>
                  <select className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground" value={simForm.deviceId} onChange={(e) => setSimForm((f) => ({ ...f, deviceId: e.target.value }))}>
                    <option value="">Auto-create</option>
                    {(devices as any[]).map((d: any) => <option key={d.device.id} value={d.device.id}>{d.device.deviceName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Brew Session</label>
                  <select className="w-full text-xs bg-background border border-border rounded px-2 py-1.5 text-foreground" value={simForm.brewSessionId} onChange={(e) => setSimForm((f) => ({ ...f, brewSessionId: e.target.value }))}>
                    <option value="">None</option>
                    {(brewSessions as any[]).map((s: any) => <option key={s.id} value={s.id}>{s.recipeName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Gravity (SG)</label>
                  <Input type="number" step="0.001" value={simForm.gravity} onChange={(e) => setSimForm((f) => ({ ...f, gravity: e.target.value }))} className="text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Temp (°C)</label>
                  <Input type="number" step="0.1" value={simForm.temperature} onChange={(e) => setSimForm((f) => ({ ...f, temperature: e.target.value }))} className="text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Battery (%)</label>
                  <Input type="number" step="1" value={simForm.battery} onChange={(e) => setSimForm((f) => ({ ...f, battery: e.target.value }))} className="text-xs" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Angle (°)</label>
                  <Input type="number" step="0.1" value={simForm.angle} onChange={(e) => setSimForm((f) => ({ ...f, angle: e.target.value }))} className="text-xs" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={() => {
                  simulate.mutate({
                    data: {
                      ...(simForm.deviceId ? { deviceId: Number(simForm.deviceId) } : {}),
                      ...(simForm.brewSessionId ? { brewSessionId: Number(simForm.brewSessionId) } : {}),
                      gravity: Number(simForm.gravity),
                      temperature: Number(simForm.temperature),
                      temperatureUnit: "C",
                      battery: Number(simForm.battery),
                      angle: Number(simForm.angle),
                      rssi: Number(simForm.rssi),
                    },
                  });
                }} disabled={simulate.isPending}>
                  {simulate.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Activity className="w-3.5 h-3.5 mr-1" />}
                  Send Reading
                </Button>
                {simulate.isSuccess && <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" />Reading accepted</span>}
                {simulate.isError && <span className="text-xs text-destructive flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />Failed</span>}
              </div>
            </div>
          )}
        </div>
        </>}

        {editingDeviceId != null && (
          <Dialog open onOpenChange={(open) => { if (!open) setEditingDeviceId(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Rename Device</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateDevice.mutate({ id: editingDeviceId, data: { deviceName: editDeviceName } });
                }}
                className="space-y-4"
              >
                <Input
                  value={editDeviceName}
                  onChange={(e) => setEditDeviceName(e.target.value)}
                  className="text-sm"
                  autoFocus
                  required
                />
                <DialogFooter>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingDeviceId(null)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={updateDevice.isPending}>
                    {updateDevice.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
