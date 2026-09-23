import { Fragment, useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Check, X, Thermometer, Droplets, History, Camera, ImageOff, NotebookPen, Star, ChevronDown, ChevronRight, Activity, Wifi, WifiOff, Flame } from "lucide-react";
import {
  useGetBrewSession,
  useUpdateBrewSession,
  useDeleteBrewSession,
  useAddFermentationReading,
  useDeleteFermentationReading,
  useDeleteStatusLogEntry,
  getGetBrewSessionQueryKey,
  useGetBrewSensorTelemetry,
  getGetBrewSensorTelemetryQueryKey,
  useListSensorDevices,
  getListSensorDevicesQueryKey,
  useAssignSensorDevice,
  useGetDefaultReadingsShown,
  useGetTempAlertReadings,
  getGetTempAlertReadingsQueryKey,
  type BrewStatus,
  type PackagingMethod,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreBadge, ScoreReadout, OFF_FLAVOR_LABELS, BREW_AGAIN_LABELS } from "@/components/ui/score-picker";
import { useToast } from "@/hooks/use-toast";
import { useFermentTempUnit } from "@/hooks/useFermentTempUnit";
import { cn, getErrorMessage } from "@/lib/utils";
import { boilPhase } from "@/lib/boil";
import { BREW_STATUSES, STATUS_LABELS, PACKAGING_METHODS, PACKAGING_LABELS } from "@/lib/brewStatus";
import { formatDate, formatDateTime, formatDateTimeShort } from "@/lib/format";
import { estimateAbv, tempRangeToF } from "@/lib/brewMath";
import { connectionDotClass, connectionTextClass, batteryClass, formatSensorTemp } from "@/lib/sensorStatus";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RateBatchWizard } from "@/components/RateBatchWizard";
import { BrewStatusBadge } from "@/components/BrewStatusBadge";

function StatusProgress({ status, onStatusChange, isPending }: { status: BrewStatus; onStatusChange: (s: BrewStatus) => void; isPending?: boolean }) {
  const idx = BREW_STATUSES.indexOf(status);
  return (
    <div className="flex items-center gap-1 text-xs">
      {BREW_STATUSES.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <button
            disabled={isPending || s === status}
            onClick={() => onStatusChange(s)}
            className={`flex items-center gap-1 rounded px-1 py-0.5 transition-colors group ${s === status ? "cursor-default" : "hover:bg-muted cursor-pointer"} ${isPending ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className={`w-2 h-2 rounded-full transition-colors ${i <= idx ? "bg-primary" : "bg-muted-foreground/30"} ${s !== status && !isPending ? "group-hover:bg-primary/60" : ""}`} />
            <span className={`${i <= idx ? "text-foreground font-medium" : "text-muted-foreground"} ${s !== status && !isPending ? "group-hover:text-foreground" : ""}`}>{STATUS_LABELS[s] ?? s}</span>
          </button>
          {i < BREW_STATUSES.length - 1 && <div className={`w-4 h-px ${i < idx ? "bg-primary" : "bg-muted-foreground/30"}`} />}
        </div>
      ))}
    </div>
  );
}

// datetime-local has no timezone, so we intentionally format local time for input
// and convert back to UTC on submit.

// Format a Date as YYYY-MM-DDTHH:mm in the user's local timezone for datetime-local inputs.
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Convert a datetime-local value (YYYY-MM-DDTHH:mm, no timezone) to a UTC ISO string.
function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}

export default function BrewSessionDetail() {
  const [, params] = useRoute("/brew-sessions/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id);
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const tempUnit = useFermentTempUnit();
  const { data: tempAlertReadings } = useGetTempAlertReadings({
    query: { staleTime: 0, queryKey: getGetTempAlertReadingsQueryKey() },
  });
  const tempAlertThreshold = tempAlertReadings?.count ?? 2;
  const tempAlertCount = useRef(0);
  const [globalAutoConditioning, setGlobalAutoConditioning] = useState(false);
  const autoAdvancedRef = useRef(false);
  const [showReadingForm, setShowReadingForm] = useState(false);
  const [readingForm, setReadingForm] = useState({ readingAt: toDatetimeLocalValue(new Date()), temperatureFahrenheit: "", gravity: "", ph: "", notes: "" });
  const [editForm, setEditForm] = useState<any>({});
  const [packagingPrompt, setPackagingPrompt] = useState<PackagingMethod>(null);
  const [ratingWizardOpen, setRatingWizardOpen] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoLightboxOpen, setPhotoLightboxOpen] = useState(false);
  const [showSensorHistory, setShowSensorHistory] = useState(false);
  const [expandedRawId, setExpandedRawId] = useState<number | null>(null);
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [assignDeviceId, setAssignDeviceId] = useState<string>("");
  const [readingFilter, setReadingFilter] = useState<"all" | "sensor" | "manual">("all");
  const [showAllReadings, setShowAllReadings] = useState(false);
  const [chartSeries, setChartSeries] = useState<"both" | "temp" | "gravity">("both");
  const [ogInputOpen, setOgInputOpen] = useState(false);
  const [ogValue, setOgValue] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photoLightboxOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPhotoLightboxOpen(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [photoLightboxOpen]);

  const { data: defaultReadingsData } = useGetDefaultReadingsShown();
  const defaultCount = defaultReadingsData?.count ?? 5;

  const { data: session, isLoading } = useGetBrewSession(id, { query: { enabled: !!id, queryKey: getGetBrewSessionQueryKey(id) } });

  const { data: telemetry } = useGetBrewSensorTelemetry(id, {
    query: { enabled: !!id, refetchInterval: 30_000, queryKey: getGetBrewSensorTelemetryQueryKey(id) },
  });

  const { data: sensorDevices } = useListSensorDevices({
    query: { queryKey: getListSensorDevicesQueryKey() },
  });

  const unassignedDevice = sensorDevices?.find(
    (d) => d.device.enabled && !d.assignedBrewSessionId,
  ) ?? null;

  const assignMutation = useAssignSensorDevice({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetBrewSensorTelemetryQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListSensorDevicesQueryKey() });
        setShowAssignPanel(false);
        setAssignDeviceId("");
        toast({ title: "iSpindel assigned", description: "Readings from this point forward will appear here." });
      },
      onError: () => toast({ title: "Failed to assign device", variant: "destructive" }),
    },
  });

  const handleAssignDevice = () => {
    if (!unassignedDevice) return;
    assignMutation.mutate({ id: unassignedDevice.device.id, data: { brewSessionId: id } });
  };

  const sensorConnStatus = (() => {
    if (!telemetry?.latestReading) return "unknown";
    const ms = Date.now() - new Date(telemetry.latestReading.receivedAt).getTime();
    if (ms < 30 * 60_000) return "connected";
    if (ms < 2 * 60 * 60_000) return "warning";
    return "offline";
  })();

  const updateMutation = useUpdateBrewSession({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(id) });
        setEditing(false);
        toast({ title: "Session updated" });
        if ((data as any).devicesUnassigned > 0) {
          toast({
            title: "Sensor device unassigned",
            description: `${(data as any).devicesUnassigned} sensor device${(data as any).devicesUnassigned > 1 ? "s have" : " has"} been unassigned now that this batch is packaged.`,
          });
        }
      },
    },
  });

  const quickStatusMutation = useUpdateBrewSession({
    mutation: {
      onSuccess: (data) => { qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(id) }); setPackagingPrompt(null); toast({ title: `Status → ${STATUS_LABELS[data.status] ?? data.status}` }); },
    },
  });

  // Advancing to Packaged asks how the batch was packaged first; every other
  // transition is immediate. Passing packagingMethod through on those keeps an
  // already-recorded method intact when the stage is corrected afterwards.
  const applyStatus = (newStatus: BrewStatus, packagingMethod?: PackagingMethod) => {
    if (!session) return;
    quickStatusMutation.mutate({
      id,
      data: {
        recipeName: session.recipeName,
        status: newStatus,
        brewDate: session.brewDate,
        batchSizeGallons: session.batchSizeGallons,
        originalGravityActual: session.originalGravityActual ?? undefined,
        finalGravityActual: session.finalGravityActual ?? undefined,
        abvActual: session.abvActual ?? undefined,
        notes: session.notes ?? undefined,
        packagingMethod: packagingMethod ?? session.packagingMethod ?? undefined,
      },
    });
  };

  const handleStatusClick = (newStatus: BrewStatus) => {
    if (!session || newStatus === session.status) return;
    if (newStatus === "packaged") {
      setPackagingPrompt(session.packagingMethod ?? "keg");
      return;
    }
    applyStatus(newStatus);
  };

  const deleteMutation = useDeleteBrewSession({
    mutation: {
      onSuccess: () => { navigate("/brew-sessions"); toast({ title: "Session deleted" }); },
    },
  });

  const addReadingMutation = useAddFermentationReading({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(id) }); setShowReadingForm(false); toast({ title: "Reading logged" }); },
      onError: () => toast({ title: "Failed to log reading", description: "Please check your values and try again.", variant: "destructive" }),
    },
  });

  const deleteReadingMutation = useDeleteFermentationReading({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(id) });
        qc.invalidateQueries({ queryKey: getGetBrewSensorTelemetryQueryKey(id) });
      },
    },
  });

  const deleteStatusLogMutation = useDeleteStatusLogEntry({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(id) }),
    },
  });

  // auto-conditioning isn't in the OpenAPI spec, so there's no generated hook for it.
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/settings/auto-conditioning`)
      .then((r) => r.json() as Promise<{ enabled: boolean }>)
      .then((autoData) => setGlobalAutoConditioning(autoData.enabled ?? false))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const alerts = telemetry?.alerts ?? [];
    const hasOutOfRange = (telemetry as any)?.isDeviceActive && alerts.some((a) => a.type === "temp_out_of_range");
    if (hasOutOfRange) {
      tempAlertCount.current += 1;
      if (tempAlertCount.current >= tempAlertThreshold) {
        const outAlert = alerts.find((a) => a.type === "temp_out_of_range");
        toast({ title: "Fermentation temp out of range", description: outAlert?.message ?? "Temperature is outside the configured range", variant: "destructive" });
        tempAlertCount.current = 0;
      }
    } else {
      tempAlertCount.current = 0;
    }
  }, [telemetry, tempAlertThreshold, toast]);

  useEffect(() => {
    const perBrew = session?.autoAdvanceToConditioning;
    const effectiveAutoAdvance = perBrew !== null && perBrew !== undefined ? perBrew : globalAutoConditioning;
    if (!effectiveAutoAdvance) return;
    if (session?.status !== "fermenting") { autoAdvancedRef.current = false; return; }
    if (telemetry?.insights?.fermentationStatus !== "possibly_complete") return;
    if (autoAdvancedRef.current || quickStatusMutation.isPending) return;
    autoAdvancedRef.current = true;
    handleStatusClick("conditioning");
  }, [telemetry, globalAutoConditioning, session]);

  const saveOgMutation = useUpdateBrewSession({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(id) });
        setOgInputOpen(false);
        setOgValue("");
        toast({ title: "OG saved" });
      },
    },
  });

  const handleSaveOg = () => {
    const og = parseFloat(ogValue);
    if (!session || isNaN(og) || og < 1.000 || og > 1.200) return;
    saveOgMutation.mutate({
      id,
      data: {
        recipeName: session.recipeName,
        status: session.status,
        brewDate: session.brewDate,
        batchSizeGallons: session.batchSizeGallons,
        originalGravityActual: og,
      },
    });
  };

  const compressImage = (file: File, maxPx = 1600, quality = 0.82): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = Math.max(img.width, img.height);
        if (!maxDim || !isFinite(maxDim)) {
          return reject(new Error("Invalid image dimensions"));
        }
        const scale = Math.min(1, maxPx / maxDim);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Compression failed")), "image/jpeg", quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
      img.src = url;
    });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("photo", compressed, "photo.jpg");
      const res = await fetch(`/api/brew-sessions/${id}/photo`, { method: "POST", body: formData });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`Server returned ${res.status}${msg ? `: ${msg}` : ""}`);
      }
      qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(id) });
      toast({ title: "Photo uploaded" });
    } catch (err) {
      toast({ title: "Photo upload failed", description: getErrorMessage(err), variant: "destructive" });
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handlePhotoDelete = async () => {
    if (!confirm("Remove this photo?")) return;
    try {
      const res = await fetch(`/api/brew-sessions/${id}/photo`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(id) });
      toast({ title: "Photo removed" });
    } catch {
      toast({ title: "Failed to remove photo", variant: "destructive" });
    }
  };

  const startEdit = () => {
    if (!session) return;
    setEditForm({
      recipeName: session.recipeName,
      status: session.status,
      brewDate: session.brewDate,
      batchSizeGallons: String(session.batchSizeGallons),
      originalGravityActual: session.originalGravityActual != null ? String(session.originalGravityActual) : "",
      finalGravityActual: session.finalGravityActual != null ? String(session.finalGravityActual) : "",
      abvActual: session.abvActual != null ? String(session.abvActual) : "",
      notes: session.notes ?? "",
      fermentTempMin: session.fermentTempMin != null ? String(session.fermentTempMin) : "",
      fermentTempMax: session.fermentTempMax != null ? String(session.fermentTempMax) : "",
      fermentTempIdeal: session.fermentTempIdeal != null ? String(session.fermentTempIdeal) : "",
      autoAdvanceToConditioning: session.autoAdvanceToConditioning ?? null,
      packagingMethod: session.packagingMethod ?? null,
    });
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate({
      id,
      data: {
        recipeName: editForm.recipeName,
        status: editForm.status,
        brewDate: editForm.brewDate,
        batchSizeGallons: Number(editForm.batchSizeGallons),
        originalGravityActual: editForm.originalGravityActual ? Number(editForm.originalGravityActual) : undefined,
        finalGravityActual: editForm.finalGravityActual ? Number(editForm.finalGravityActual) : undefined,
        abvActual: editForm.abvActual ? Number(editForm.abvActual) : undefined,
        notes: editForm.notes || undefined,
        fermentTempMin: editForm.fermentTempMin ? Number(editForm.fermentTempMin) : null,
        fermentTempMax: editForm.fermentTempMax ? Number(editForm.fermentTempMax) : null,
        fermentTempIdeal: editForm.fermentTempIdeal ? Number(editForm.fermentTempIdeal) : null,
        autoAdvanceToConditioning: editForm.autoAdvanceToConditioning,
        packagingMethod: editForm.packagingMethod,
      },
    });
  };

  const handleAddReading = (e: React.FormEvent) => {
    e.preventDefault();
    const readingAtIso = fromDatetimeLocalValue(readingForm.readingAt);
    addReadingMutation.mutate({
      id,
      data: {
        readingAt: readingAtIso,
        temperatureFahrenheit: readingForm.temperatureFahrenheit ? Number(readingForm.temperatureFahrenheit) : undefined,
        gravity: readingForm.gravity ? Number(readingForm.gravity) : undefined,
        ph: readingForm.ph ? Number(readingForm.ph) : undefined,
        notes: readingForm.notes || undefined,
      },
    });
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-8 w-48 mb-4" /><Skeleton className="h-64 w-full" /></div>;
  if (!session) return <div className="p-6 text-muted-foreground">Session not found.</div>;

  const chartData = (session.readings ?? []).map((r) => ({
    date: formatDateTime(r.readingAt),
    temp: r.temperatureFahrenheit,
    gravity: r.gravity,
  }));

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate("/brew-sessions")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        {!editing ? (
          <>
            <h1 className="text-xl font-bold text-foreground flex-1">{session.recipeName}</h1>
            <Button size="sm" onClick={() => setRatingWizardOpen(true)}>
              <Star className="w-3.5 h-3.5 mr-1.5" />Rate this Batch
            </Button>
            <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
            <Button variant="destructive" size="sm" onClick={() => { if (confirm("Delete this session?")) deleteMutation.mutate({ id }); }}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        ) : (
          <>
            <span className="text-sm font-semibold text-muted-foreground flex-1">Editing session</span>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5 mr-1" />Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}><Check className="w-3.5 h-3.5 mr-1" />Save</Button>
          </>
        )}
      </div>

      <div className="bg-card border border-card-border rounded-lg p-4">
        {!editing ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <BrewStatusBadge status={session.status} />
              <ScoreBadge value={session.overallScore} />
            </div>
            <div className="mb-3 overflow-x-auto">
              <StatusProgress status={session.status} onStatusChange={handleStatusClick} isPending={quickStatusMutation.isPending} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div>
                <div className="text-xs text-muted-foreground">Brew Date</div>
                <div className="text-sm font-medium">{formatDate(session.brewDate)}</div>
                {session.plannedDate && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">planned {formatDate(session.plannedDate)}</div>
                )}
              </div>
              <div><div className="text-xs text-muted-foreground">Batch Size</div><div className="text-sm font-medium">{session.batchSizeGallons} gal</div></div>
              {session.packagingMethod && <div><div className="text-xs text-muted-foreground">Packaged In</div><div className="text-sm font-medium">{PACKAGING_LABELS[session.packagingMethod] ?? session.packagingMethod}</div></div>}
              {session.originalGravityActual && <div><div className="text-xs text-muted-foreground">OG (actual)</div><div className="text-sm font-medium">{session.originalGravityActual.toFixed(3)}</div></div>}
              {session.finalGravityActual && <div><div className="text-xs text-muted-foreground">FG (actual)</div><div className="text-sm font-medium">{session.finalGravityActual.toFixed(3)}</div></div>}
              {session.abvActual && <div><div className="text-xs text-muted-foreground">ABV (actual)</div><div className="text-sm font-medium">{session.abvActual.toFixed(1)}%</div></div>}
            </div>
            {session.notes && <p className="text-sm text-muted-foreground border-t border-border pt-3 mt-3">{session.notes}</p>}
          </>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs text-muted-foreground mb-1 block">Recipe Name</label><Input value={editForm.recipeName} onChange={(e) => setEditForm({ ...editForm, recipeName: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Status</label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BREW_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Packaged In</label>
                <Select
                  value={editForm.packagingMethod ?? "none"}
                  onValueChange={(v) => setEditForm({ ...editForm, packagingMethod: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {PACKAGING_METHODS.map((m) => <SelectItem key={m} value={m}>{PACKAGING_LABELS[m] ?? m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Brew Date</label><Input type="date" value={editForm.brewDate} onChange={(e) => setEditForm({ ...editForm, brewDate: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Batch Size (gal)</label><Input type="number" step="0.1" value={editForm.batchSizeGallons} onChange={(e) => setEditForm({ ...editForm, batchSizeGallons: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">OG (actual)</label><Input type="number" step="0.001" value={editForm.originalGravityActual} onChange={(e) => setEditForm({ ...editForm, originalGravityActual: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">FG (actual)</label><Input type="number" step="0.001" value={editForm.finalGravityActual} onChange={(e) => setEditForm({ ...editForm, finalGravityActual: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">ABV % (actual)</label><Input type="number" step="0.1" value={editForm.abvActual} onChange={(e) => setEditForm({ ...editForm, abvActual: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Min Temp (°{tempUnit})</label>
                <Input type="number" step="0.1"
                  value={editForm.fermentTempMin ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, fermentTempMin: e.target.value })}
                  placeholder={session.fermentTempMin != null ? String(session.fermentTempMin) : "from recipe"} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Ideal Temp (°{tempUnit})</label>
                <Input type="number" step="0.1"
                  value={editForm.fermentTempIdeal ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, fermentTempIdeal: e.target.value })}
                  placeholder={session.fermentTempIdeal != null ? String(session.fermentTempIdeal) : "from recipe"} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Max Temp (°{tempUnit})</label>
                <Input type="number" step="0.1"
                  value={editForm.fermentTempMax ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, fermentTempMax: e.target.value })}
                  placeholder={session.fermentTempMax != null ? String(session.fermentTempMax) : "from recipe"} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Auto-advance to Conditioning</label>
              <Select
                value={editForm.autoAdvanceToConditioning === true ? "on" : editForm.autoAdvanceToConditioning === false ? "off" : "global"}
                onValueChange={(v) => setEditForm({ ...editForm, autoAdvanceToConditioning: v === "on" ? true : v === "off" ? false : null })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Use global setting</SelectItem>
                  <SelectItem value="on">Always auto-advance</SelectItem>
                  <SelectItem value="off">Never auto-advance (manual only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground mb-1 block">Notes</label><Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} /></div>
          </div>
        )}
      </div>

      {session.status === "packaged" && !session.ratedAt && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <span className="text-amber-500 shrink-0">🍺</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Rate this batch</p>
            <p className="text-xs text-muted-foreground mt-0.5">Four quick questions — it rolls up to the recipe so you can compare batches</p>
          </div>
          <Button size="sm" className="shrink-0" onClick={() => setRatingWizardOpen(true)}>
            Rate this Batch
          </Button>
        </div>
      )}

      {session.status === "brew_day" && (() => {
        const boil = boilPhase(session);
        return (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
            <Flame className="w-4 h-4 text-orange-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {boil === "idle" && "Boil timer"}
                {boil === "running" && "Boil in progress"}
                {boil === "paused" && "Boil paused"}
                {boil === "ended" && "Boil complete"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {boil === "ended"
                  ? "Reopen the timer to review the addition checklist"
                  : "Countdown with alerts at each hop addition and flameout"}
              </p>
            </div>
            <Button
              size="sm"
              variant={boil === "idle" || boil === "ended" ? "outline" : "default"}
              className="shrink-0"
              onClick={() => navigate(`/brew-sessions/${id}/boil`)}
            >
              {boil === "idle" ? "Start Boil" : boil === "ended" ? "View" : "Open Timer"}
            </Button>
          </div>
        );
      })()}

      {session.status === "brew_day" && session.originalGravityActual == null && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <span className="text-amber-500 shrink-0">🧪</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Enter your original gravity</p>
            <p className="text-xs text-muted-foreground mt-0.5">Record your OG reading to track attenuation and estimate ABV</p>
          </div>
          {ogInputOpen ? (
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="number"
                step="0.001"
                min="1.000"
                max="1.200"
                placeholder="1.050"
                value={ogValue}
                onChange={(e) => setOgValue(e.target.value)}
                className="w-24 text-sm border border-border rounded px-2 py-1 bg-background text-foreground"
                autoFocus
              />
              <Button size="sm" onClick={handleSaveOg} disabled={saveOgMutation.isPending}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOgInputOpen(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="shrink-0 border-amber-500/40 text-amber-600 hover:bg-amber-500/10" onClick={() => setOgInputOpen(true)}>
              Enter OG
            </Button>
          )}
        </div>
      )}

      {["brew_day", "fermenting", "conditioning"].includes(session.status) && unassignedDevice && !telemetry?.device && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <span className="text-blue-500 shrink-0">📡</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Unassigned iSpindel detected</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {unassignedDevice.device.deviceName} is not assigned to a brew. Assign it to start tracking gravity automatically.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-blue-500/40 text-blue-600 hover:bg-blue-500/10"
            onClick={handleAssignDevice}
            disabled={assignMutation.isPending}
          >
            Assign
          </Button>
        </div>
      )}

      {/* Tasting & Rating */}
      <div className="bg-card border border-card-border rounded-lg">
        <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <NotebookPen className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Tasting &amp; Rating</h2>
            <ScoreBadge value={session.overallScore} />
          </div>
        </div>
        <div className="p-4 space-y-4">
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUpload}
          />
          {/* Photo */}
          {session.photoPath ? (
            <div className="relative group w-full max-w-sm">
              <button
                type="button"
                onClick={() => setPhotoLightboxOpen(true)}
                className="block w-full rounded-lg overflow-hidden border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                title="Click to view full size"
              >
                <img
                  src={`/api/uploads/sessions/${session.photoPath}`}
                  alt="Brew session photo"
                  className="w-full object-cover max-h-64 cursor-zoom-in"
                />
              </button>
              <button
                onClick={handlePhotoDelete}
                className="absolute top-2 right-2 p-1.5 bg-background/80 backdrop-blur-sm rounded-full text-destructive hover:bg-destructive hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                title="Remove photo"
              >
                <ImageOff className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div>
              <Button
                variant="outline"
                size="sm"
                disabled={photoUploading}
                onClick={() => photoInputRef.current?.click()}
              >
                <Camera className="w-3.5 h-3.5 mr-1.5" />
                {photoUploading ? "Uploading…" : "Add Photo"}
              </Button>
            </div>
          )}
          {session.photoPath && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                disabled={photoUploading}
                onClick={() => photoInputRef.current?.click()}
              >
                <Camera className="w-3.5 h-3.5 mr-1.5" />
                {photoUploading ? "Uploading…" : "Replace Photo"}
              </Button>
            </div>
          )}
          {/* Scorecard */}
          <div className="space-y-3 border-t border-border pt-4">
            {session.ratedAt ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <ScoreReadout label="Appearance & aroma" value={session.appearanceAromaScore} outOf={5} />
                  <ScoreReadout label="Flavor & balance" value={session.flavorBalanceScore} outOf={5} />
                  <ScoreReadout label="Mouthfeel & carb" value={session.mouthfeelScore} outOf={5} />
                  <ScoreReadout label="Overall" value={session.overallScore} outOf={10} />
                </div>
                {session.offFlavors && session.offFlavors.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Off-flavors</div>
                    <div className="flex flex-wrap gap-1.5">
                      {session.offFlavors.map((tag) => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full border bg-destructive/15 text-destructive border-destructive/30">
                          {OFF_FLAVOR_LABELS[tag] ?? tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {session.brewAgain && (
                  <div>
                    <span className="text-xs text-muted-foreground">Brew again? </span>
                    <span className="text-sm font-medium text-foreground">{BREW_AGAIN_LABELS[session.brewAgain] ?? session.brewAgain}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not rated yet.</p>
            )}
            {session.tastingNotes ? (
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{session.tastingNotes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No tasting notes yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Response — Stage History */}
      <div className="bg-card border border-card-border rounded-lg">
        <div className="px-4 py-3 border-b border-card-border flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Response</h2>
          <span className="text-xs text-muted-foreground ml-1">— Stage History</span>
        </div>
        <div className="p-4">
          {!session.statusLog || session.statusLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stage changes recorded yet. Use the status bar above to move this session through its stages.</p>
          ) : (
            <div className="relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
              <div className="space-y-3">
                {[...session.statusLog].reverse().map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 pl-1 group">
                    <div className="w-3.5 h-3.5 rounded-full bg-primary border-2 border-background ring-1 ring-primary shrink-0 mt-0.5 z-10" />
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <BrewStatusBadge status={entry.status} className="shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(entry.changedAt)}
                      </span>
                    </div>
                    <button
                      onClick={() => deleteStatusLogMutation.mutate({ id: entry.id })}
                      disabled={deleteStatusLogMutation.isPending}
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sensor Telemetry */}
      {telemetry && !telemetry.device ? (
        <div className="bg-card border border-card-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <WifiOff className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">iSpindel</h2>
          </div>

          {!showAssignPanel ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">No iSpindel assigned to this batch.</p>
              <Button size="sm" variant="outline" onClick={() => setShowAssignPanel(true)}>
                <Wifi className="w-3.5 h-3.5 mr-1.5" />
                Assign iSpindel
              </Button>
              <p className="text-xs text-muted-foreground/70 leading-relaxed">
                Assign the iSpindel after the device is floating in the fermenter and sending stable readings.
                Previous test readings will remain in device history but will not be added to this batch.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Assign the iSpindel after the device is floating in the fermenter and sending stable readings.
                Previous test readings will remain in device history but will not be added to this batch.
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={assignDeviceId}
                  onChange={(e) => setAssignDeviceId(e.target.value)}
                  className="flex-1 text-xs bg-background border border-input rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select a device…</option>
                  {(sensorDevices ?? []).map((d) => (
                    <option key={d.device.id} value={String(d.device.id)}>
                      {d.device.deviceName}
                      {d.assignedBrewName ? ` (→ ${d.assignedBrewName})` : d.connectionStatus === "connected" ? " · live" : ""}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!assignDeviceId || assignMutation.isPending}
                  onClick={() => {
                    if (!assignDeviceId) return;
                    assignMutation.mutate({ id: Number(assignDeviceId), data: { brewSessionId: id } });
                  }}
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Assign
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowAssignPanel(false); setAssignDeviceId(""); }}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              {(sensorDevices ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No iSpindel devices registered yet. Add one in Settings → Integrations.</p>
              )}
            </div>
          )}
        </div>
      ) : telemetry?.device && (telemetry as any).isDeviceActive ? (
        <div className="bg-card border border-card-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${connectionDotClass(sensorConnStatus)}`} />
              <h2 className="text-sm font-semibold text-foreground">{telemetry.device.deviceName}</h2>
              <span className="text-xs text-muted-foreground font-mono">· {telemetry.device.deviceKey}</span>
              <span className={`text-xs capitalize ${connectionTextClass(sensorConnStatus)}`}>{sensorConnStatus}</span>
            </div>
            {telemetry.latestReading && (
              <span className="text-xs text-muted-foreground">
                {formatDateTimeShort(telemetry.latestReading.receivedAt)}
              </span>
            )}
          </div>

          {/* Current readings */}
          {telemetry.latestReading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {telemetry.latestReading.gravity != null && (
                <div className="bg-muted/40 rounded-lg px-3 py-2 text-center">
                  <p className="text-xs text-muted-foreground">Gravity</p>
                  <p className="text-base font-semibold text-blue-700 dark:text-blue-400">{Number(telemetry.latestReading.gravity).toFixed(3)}</p>
                </div>
              )}
              {telemetry.latestReading.temperature != null && (
                <div className="bg-muted/40 rounded-lg px-3 py-2 text-center">
                  <p className="text-xs text-muted-foreground">Temperature</p>
                  <p className="text-base font-semibold text-amber-700 dark:text-amber-400">
                    {formatSensorTemp(telemetry.latestReading.temperature, telemetry.latestReading.temperatureUnit)}
                  </p>
                </div>
              )}
              {telemetry.latestReading.battery != null && (
                <div className="bg-muted/40 rounded-lg px-3 py-2 text-center">
                  <p className="text-xs text-muted-foreground">Battery</p>
                  <p className={`text-base font-semibold ${batteryClass(telemetry.latestReading.batteryPercentEstimate, "text-foreground")}`}>
                    {Number(telemetry.latestReading.battery).toFixed(2)}V
                  </p>
                  {telemetry.latestReading.batteryPercentEstimate != null && (
                    <p className="text-xs text-muted-foreground">~{Math.round(telemetry.latestReading.batteryPercentEstimate)}%</p>
                  )}
                </div>
              )}
              {telemetry.latestReading.angle != null && (
                <div className="bg-muted/40 rounded-lg px-3 py-2 text-center">
                  <p className="text-xs text-muted-foreground">Angle</p>
                  <p className="text-base font-semibold text-foreground">{Number(telemetry.latestReading.angle).toFixed(1)}°</p>
                </div>
              )}
              {session.originalGravityActual != null && telemetry.latestReading.gravity != null && (
                <div className="bg-muted/40 rounded-lg px-3 py-2 text-center">
                  <p className="text-xs text-muted-foreground">Est. ABV</p>
                  <p className="text-base font-semibold text-emerald-700 dark:text-emerald-400">
                    {estimateAbv(session.originalGravityActual, Number(telemetry.latestReading.gravity)).toFixed(1)}%
                  </p>
                </div>
              )}
            </div>
          )}

          {session.status === "fermenting" && telemetry.insights?.fermentationStatus === "possibly_complete" && !quickStatusMutation.isPending && (
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 mb-3">
              <span className="text-amber-500 mt-0.5 shrink-0">⚗️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Fermentation may be complete</p>
                <p className="text-xs text-muted-foreground mt-0.5">Gravity has been stable for 24+ hours. Ready to move to conditioning?</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                onClick={() => handleStatusClick("conditioning")}
                disabled={quickStatusMutation.isPending}
              >
                Move to Conditioning
              </Button>
            </div>
          )}

          {/* Fermentation insights */}
          {telemetry.insights && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground border-t border-border pt-2">
              {telemetry.insights.fermentationStatus && (
                <span>Status: <span className="text-foreground font-medium capitalize">{String(telemetry.insights.fermentationStatus).replace(/_/g, " ")}</span></span>
              )}
              {telemetry.insights.attenuationPercent != null && (
                <span>Attenuation: <span className="text-foreground font-medium">{Number(telemetry.insights.attenuationPercent).toFixed(1)}%</span></span>
              )}
              {telemetry.insights.velocityLast24h != null && (
                <span>Δ 24h: <span className="text-foreground font-medium">{Number(telemetry.insights.velocityLast24h).toFixed(4)} SG/day</span></span>
              )}
              {telemetry.insights.gravityDrop != null && (
                <span>Drop: <span className="text-foreground font-medium">{Number(telemetry.insights.gravityDrop).toFixed(3)} SG</span></span>
              )}
            </div>
          )}

          {/* Alerts */}
          {telemetry.alerts && telemetry.alerts.length > 0 && (
            <div className="space-y-1">
              {telemetry.alerts.map((a: any, i: number) => (
                <div key={i} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded ${
                  a.severity === "critical" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                }`}>
                  <Thermometer className="w-3.5 h-3.5 shrink-0" />
                  {a.message}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* iSpindel Readings History */}
      {telemetry?.device && telemetry.readings && telemetry.readings.length > 0 && (
        <div className="bg-card border border-card-border rounded-lg">
          <button
            type="button"
            className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold text-foreground hover:bg-muted/20 transition-colors"
            onClick={() => setShowSensorHistory((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              iSpindel Readings
              <span className="text-xs text-muted-foreground font-normal">({telemetry.readings.length} for this brew)</span>
            </div>
            {showSensorHistory ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </button>
          {showSensorHistory && (
            <div className="border-t border-card-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Received</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground">Gravity</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground">Temp</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground">Angle</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground">Battery</th>
                    <th className="text-right px-2 py-2 font-medium text-muted-foreground">RSSI</th>
                    <th className="w-6 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...telemetry.readings].reverse().map((r) => (
                    <Fragment key={r.id}>
                      <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                          {formatDateTimeShort(r.receivedAt)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-blue-700 dark:text-blue-400">{r.gravity != null ? Number(r.gravity).toFixed(3) : "—"}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap text-amber-700 dark:text-amber-400">{r.temperature != null ? formatSensorTemp(r.temperature, r.temperatureUnit) : "—"}</td>
                        <td className="px-2 py-1.5 text-right">{r.angle != null ? `${Number(r.angle).toFixed(1)}°` : "—"}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          {r.battery != null ? (
                            <span className={batteryClass(r.batteryPercentEstimate)}>
                              {Number(r.battery).toFixed(2)}V{r.batteryPercentEstimate != null ? ` (~${Math.round(r.batteryPercentEstimate)}%)` : ""}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{r.rssi != null ? `${r.rssi} dBm` : "—"}</td>
                        <td className="px-2 py-1.5">
                          {r.rawPayload && (
                            <button type="button" onClick={() => setExpandedRawId(expandedRawId === r.id ? null : r.id)}
                              className="text-muted-foreground hover:text-foreground transition-colors" title="Raw payload">
                              {expandedRawId === r.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedRawId === r.id && r.rawPayload && (
                        <tr key={`${r.id}-raw`}>
                          <td colSpan={7} className="px-3 pb-2 bg-muted/10">
                            <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto text-muted-foreground">{JSON.stringify(r.rawPayload, null, 2)}</pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Fermentation Chart */}
      {chartData.length > 1 && (() => {
        const sortedLog = [...(session.statusLog ?? [])].sort(
          (a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime()
        );
        const fermStartEntry = sortedLog.find((e) => e.status === "fermenting");
        const fermEndEntry = (() => {
          if (!fermStartEntry) return undefined;
          return sortedLog.find(
            (e) =>
              e.status !== "fermenting" &&
              new Date(e.changedAt).getTime() > new Date(fermStartEntry.changedAt).getTime()
          );
        })();

        const fermStartLabel = fermStartEntry ? formatDateTimeShort(fermStartEntry.changedAt) : null;
        const fermEndLabel = fermEndEntry ? formatDateTimeShort(fermEndEntry.changedAt) : null;
        const tempRange = (telemetry as any)?.tempRange;

        const showTemp = chartSeries === "both" || chartSeries === "temp";
        const showGravity = chartSeries === "both" || chartSeries === "gravity";
        const isDense = chartData.length > 40;

        return (
          <div className="bg-card border border-card-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-foreground">Fermentation Chart</h2>
              <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5 text-xs">
                {(["both", "temp", "gravity"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setChartSeries(s)}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      chartSeries === s
                        ? "bg-background text-foreground shadow-sm font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s === "both" ? "Both" : s === "temp" ? "🌡 Temp" : "💧 Gravity"}
                  </button>
                ))}
              </div>
            </div>

            {(fermStartLabel || fermEndLabel) && (
              <div className="flex items-center gap-4 mb-3 flex-wrap">
                {fermStartLabel && (
                  <span className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    Fermentation started · {fermStartLabel}
                  </span>
                )}
                {fermEndLabel && (
                  <span className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400">
                    <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                    Fermentation ended · {fermEndLabel}
                  </span>
                )}
              </div>
            )}

            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                {showTemp && (
                  <YAxis
                    yAxisId="temp"
                    orientation="left"
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 10, fill: "#d97706" }}
                    tickLine={false}
                    axisLine={false}
                    unit="°F"
                    width={42}
                  />
                )}
                {showGravity && (
                  <YAxis
                    yAxisId="gravity"
                    orientation="right"
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 10, fill: "#2563eb" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => v.toFixed(3)}
                    width={52}
                  />
                )}
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    padding: "8px 12px",
                  }}
                  labelStyle={{ color: "var(--color-muted-foreground)", marginBottom: 4 }}
                  formatter={(value: number, name: string) =>
                    name === "temp"
                      ? [`${value.toFixed(1)}°F`, "Temperature"]
                      : [value?.toFixed(3), "Gravity"]
                  }
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  formatter={(v) => (
                    <span style={{ color: v === "temp" ? "#d97706" : "#2563eb" }}>
                      {v === "temp" ? "Temperature" : "Gravity"}
                    </span>
                  )}
                />
                {fermStartLabel && (
                  <ReferenceLine
                    x={fermStartLabel}
                    yAxisId={showTemp ? "temp" : "gravity"}
                    stroke="#22c55e"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{ value: "▶ Ferm start", position: "insideTopLeft", fontSize: 9, fill: "#22c55e", dy: -2 }}
                  />
                )}
                {fermEndLabel && (
                  <ReferenceLine
                    x={fermEndLabel}
                    yAxisId={showTemp ? "temp" : "gravity"}
                    stroke="#3b82f6"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{ value: "■ Ferm end", position: "insideTopRight", fontSize: 9, fill: "#3b82f6", dy: -2 }}
                  />
                )}
                {showTemp && tempRange?.ideal != null && (
                  <ReferenceLine
                    yAxisId="temp"
                    y={tempRangeToF(tempRange.ideal, tempRange.unit)}
                    stroke="#22c55e"
                    strokeDasharray="5 3"
                    strokeWidth={1.5}
                    label={{ value: "Ideal", position: "insideTopRight", fontSize: 9, fill: "#22c55e" }}
                  />
                )}
                {showTemp && tempRange?.min != null && (
                  <ReferenceLine
                    yAxisId="temp"
                    y={tempRangeToF(tempRange.min, tempRange.unit)}
                    stroke="#ef4444"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    label={{ value: "Min", position: "insideBottomRight", fontSize: 9, fill: "#ef4444" }}
                  />
                )}
                {showTemp && tempRange?.max != null && (
                  <ReferenceLine
                    yAxisId="temp"
                    y={tempRangeToF(tempRange.max, tempRange.unit)}
                    stroke="#ef4444"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    label={{ value: "Max", position: "insideTopRight", fontSize: 9, fill: "#ef4444" }}
                  />
                )}
                {showTemp && (
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="temp"
                    stroke="#d97706"
                    strokeWidth={2}
                    dot={isDense ? false : { r: 2, fill: "#d97706", strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                )}
                {showGravity && (
                  <Line
                    yAxisId="gravity"
                    type="monotone"
                    dataKey="gravity"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={isDense ? false : { r: 2, fill: "#2563eb", strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* Fermentation Readings */}
      <div className="bg-card border border-card-border rounded-lg">
        <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground">Fermentation Readings</h2>
            {session.readings && session.readings.length > 0 && (
              <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
                {(["all", "sensor", "manual"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setReadingFilter(f)}
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${
                      readingFilter === f
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f === "all" ? "All" : f === "sensor" ? "📡 Sensor" : "✍️ Manual"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => { setReadingForm((f) => ({ ...f, readingAt: toDatetimeLocalValue(new Date()) })); setShowReadingForm(!showReadingForm); }}>
            <Plus className="w-3.5 h-3.5 mr-1" />Log Reading
          </Button>
        </div>
        <div className="p-4 space-y-3">
          {showReadingForm && (
            <form onSubmit={handleAddReading} className="bg-muted/50 rounded-lg p-3 space-y-2 border border-border">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-muted-foreground mb-1 block">Date & Time</label>
                  <Input type="datetime-local" value={readingForm.readingAt} onChange={(e) => setReadingForm({ ...readingForm, readingAt: e.target.value })} className="text-sm" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">Temperature (°F)</label>
                  <Input type="number" step="0.1" value={readingForm.temperatureFahrenheit} onChange={(e) => setReadingForm({ ...readingForm, temperatureFahrenheit: e.target.value })} placeholder="68.0" className="text-sm" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">Gravity (SG)</label>
                  <Input type="number" step="0.001" value={readingForm.gravity} onChange={(e) => setReadingForm({ ...readingForm, gravity: e.target.value })} placeholder="1.038" className="text-sm" /></div>
                <div><label className="text-xs text-muted-foreground mb-1 block">pH (optional)</label>
                  <Input type="number" step="0.01" value={readingForm.ph} onChange={(e) => setReadingForm({ ...readingForm, ph: e.target.value })} placeholder="4.2" className="text-sm" /></div>
              </div>
              <Input placeholder="Notes (optional)" value={readingForm.notes} onChange={(e) => setReadingForm({ ...readingForm, notes: e.target.value })} className="text-sm" />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowReadingForm(false)}><X className="w-3.5 h-3.5" /></Button>
                <Button type="submit" size="sm" disabled={addReadingMutation.isPending}><Check className="w-3.5 h-3.5 mr-1" />Log</Button>
              </div>
            </form>
          )}

          {(() => {
            const allReadings = session.readings ?? [];
            const filtered = readingFilter === "all"
              ? allReadings
              : allReadings.filter((r) => r.source === (readingFilter === "sensor" ? "ispindel" : "manual"));
            const reversed = [...filtered].reverse();

            if (reversed.length === 0) {
              return !showReadingForm ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {readingFilter === "all" ? "No readings logged yet" : `No ${readingFilter === "sensor" ? "sensor" : "manual"} readings`}
                </p>
              ) : null;
            }

            const hasMore = reversed.length > defaultCount;
            const visible = showAllReadings ? reversed : reversed.slice(0, defaultCount);

            return (
              <>
                <div className="space-y-1">
                  {visible.map((reading) => {
                    const src = reading.source;
                    return (
                      <div key={reading.id} className="flex items-start gap-3 text-sm py-2 px-2 rounded hover:bg-muted group">
                        <div className="flex flex-col gap-0.5 shrink-0 min-w-[120px]">
                          <span className="text-xs text-muted-foreground">{formatDateTime(reading.readingAt)}</span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded w-fit ${
                            src === "ispindel"
                              ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {src === "ispindel" ? "📡 iSpindel" : "✍️ Manual"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 flex-1 flex-wrap">
                          {reading.temperatureFahrenheit != null && (() => {
                            const tr = (telemetry as any)?.tempRange;
                            const tempF = reading.temperatureFahrenheit;
                            let devEl: React.ReactNode = null;
                            if (tr?.ideal != null) {
                              const idealF = tempRangeToF(tr.ideal, tr.unit);
                              const dev = tempF - idealF;
                              const minF = tr.min != null ? tempRangeToF(tr.min, tr.unit) : null;
                              const maxF = tr.max != null ? tempRangeToF(tr.max, tr.unit) : null;
                              const outOfRange = (minF != null && tempF < minF) || (maxF != null && tempF > maxF);
                              const nearLimit = !outOfRange && ((minF != null && tempF - minF < 2) || (maxF != null && maxF - tempF < 2));
                              const color = outOfRange ? "text-red-600 dark:text-red-400" : nearLimit ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400";
                              devEl = <span className={`text-xs ${color}`}>{dev >= 0 ? "+" : ""}{dev.toFixed(1)}°F</span>;
                            }
                            return (
                              <>
                                <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                  <Thermometer className="w-3.5 h-3.5" />{tempF.toFixed(1)}°F
                                </span>
                                {devEl}
                              </>
                            );
                          })()}
                          {reading.gravity != null && (
                            <span className="flex items-center gap-1 text-blue-700 dark:text-blue-400">
                              <Droplets className="w-3.5 h-3.5" />{reading.gravity.toFixed(3)}
                            </span>
                          )}
                          {reading.ph != null && <span className="text-muted-foreground">pH {reading.ph.toFixed(2)}</span>}
                          {reading.notes && (
                            <span className={cn("text-muted-foreground text-xs truncate", src === "ispindel" && "font-mono")}>{reading.notes}</span>
                          )}
                        </div>
                        <button onClick={() => deleteReadingMutation.mutate({ id: reading.id })} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity mt-0.5">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {!showAllReadings && hasMore && (
                  <button
                    type="button"
                    onClick={() => setShowAllReadings(true)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-2 border border-dashed border-border rounded-md hover:border-primary/50"
                  >
                    Show all {reversed.length} readings
                  </button>
                )}
                {showAllReadings && hasMore && (
                  <button
                    type="button"
                    onClick={() => setShowAllReadings(false)}
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-2 border border-dashed border-border rounded-md hover:border-primary/50"
                  >
                    Show less
                  </button>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {photoLightboxOpen && session.photoPath && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setPhotoLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setPhotoLightboxOpen(false); }}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
            title="Close (Esc)"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={`/api/uploads/sessions/${session.photoPath}`}
            alt="Brew session photo"
            className="max-w-full max-h-full object-contain rounded shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <RateBatchWizard session={session} open={ratingWizardOpen} onOpenChange={setRatingWizardOpen} />

      <Dialog open={packagingPrompt !== null} onOpenChange={(open) => { if (!open) setPackagingPrompt(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>How did you package this batch?</DialogTitle>
            <DialogDescription>Recorded on the batch so you know how it was stored and served.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {PACKAGING_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPackagingPrompt(m)}
                className={`rounded-lg border px-4 py-6 text-sm font-medium transition-colors ${packagingPrompt === m ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {PACKAGING_LABELS[m] ?? m}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPackagingPrompt(null)}>Cancel</Button>
            <Button
              onClick={() => applyStatus("packaged", packagingPrompt)}
              disabled={quickStatusMutation.isPending}
            >
              <Check className="w-3.5 h-3.5 mr-1" />Mark Packaged
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
