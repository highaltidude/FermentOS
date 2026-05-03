import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Check, X, Thermometer, Droplets, History, Camera, ImageOff, NotebookPen, Star, Play } from "lucide-react";
import {
  useGetBrewSession,
  useUpdateBrewSession,
  useDeleteBrewSession,
  useAddFermentationReading,
  useDeleteFermentationReading,
  useDeleteStatusLogEntry,
  getGetBrewSessionQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-slate-100 text-slate-700 border-slate-200",
  brewing: "bg-amber-100 text-amber-800 border-amber-200",
  fermenting: "bg-green-100 text-green-800 border-green-200",
  conditioning: "bg-blue-100 text-blue-800 border-blue-200",
  packaged: "bg-purple-100 text-purple-800 border-purple-200",
  complete: "bg-gray-100 text-gray-600 border-gray-200",
};

// Full set of statuses (for the edit-form select).
const STATUSES = ["scheduled", "brewing", "fermenting", "conditioning", "packaged", "complete"];
// Stage progression bar — "scheduled" is excluded because it's a pre-brew
// state, not an active stage of the brew. Scheduled sessions show a dedicated
// "Start brew" CTA instead.
const STATUS_ORDER = ["brewing", "fermenting", "conditioning", "packaged", "complete"];

function StatusProgress({ status, onStatusChange, isPending }: { status: string; onStatusChange: (s: string) => void; isPending?: boolean }) {
  const idx = STATUS_ORDER.indexOf(status);
  return (
    <div className="flex items-center gap-1 text-xs">
      {STATUS_ORDER.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <button
            disabled={isPending || s === status}
            onClick={() => onStatusChange(s)}
            className={`flex items-center gap-1 rounded px-1 py-0.5 transition-colors group ${s === status ? "cursor-default" : "hover:bg-muted cursor-pointer"} ${isPending ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className={`w-2 h-2 rounded-full transition-colors ${i <= idx ? "bg-primary" : "bg-muted-foreground/30"} ${s !== status && !isPending ? "group-hover:bg-primary/60" : ""}`} />
            <span className={`${i <= idx ? "text-foreground font-medium" : "text-muted-foreground"} ${s !== status && !isPending ? "group-hover:text-foreground" : ""}`}>{s}</span>
          </button>
          {i < STATUS_ORDER.length - 1 && <div className={`w-4 h-px ${i < idx ? "bg-primary" : "bg-muted-foreground/30"}`} />}
        </div>
      ))}
    </div>
  );
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatReadingTime(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function BrewSessionDetail() {
  const [, params] = useRoute("/brew-sessions/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id);
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [showReadingForm, setShowReadingForm] = useState(false);
  const [readingForm, setReadingForm] = useState({ readingAt: new Date().toISOString().slice(0, 16), temperatureFahrenheit: "", gravity: "", ph: "", notes: "" });
  const [editForm, setEditForm] = useState<any>({});
  const [tastingNotes, setTastingNotes] = useState("");
  const [tastingEditing, setTastingEditing] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoLightboxOpen, setPhotoLightboxOpen] = useState(false);
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

  const { data: session, isLoading } = useGetBrewSession(id, { query: { enabled: !!id, queryKey: getGetBrewSessionQueryKey(id) } });

  const updateMutation = useUpdateBrewSession({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(id) }); setEditing(false); toast({ title: "Session updated" }); },
    },
  });

  const quickStatusMutation = useUpdateBrewSession({
    mutation: {
      onSuccess: (data) => { qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(id) }); toast({ title: `Status → ${data.status}` }); },
    },
  });

  const handleStatusClick = (newStatus: string) => {
    if (!session || newStatus === session.status) return;
    quickStatusMutation.mutate({
      id,
      data: {
        recipeName: session.recipeName,
        status: newStatus as any,
        brewDate: session.brewDate,
        batchSizeGallons: session.batchSizeGallons,
        originalGravityActual: session.originalGravityActual ?? undefined,
        finalGravityActual: session.finalGravityActual ?? undefined,
        abvActual: session.abvActual ?? undefined,
        rating: session.rating ?? undefined,
        notes: session.notes ?? undefined,
      },
    });
  };

  // Transition a "scheduled" session into "brewing". The previously scheduled
  // brewDate is preserved in plannedDate so analytics can compare intent vs
  // actual; brewDate is overwritten with today (the real start) so duration
  // math anchors on when fermentables actually hit the kettle.
  const handleStartBrew = () => {
    if (!session) return;
    if (!confirm(`Start this brew now?\n\nThe brew date will be set to today and the original planned date (${formatDate(session.brewDate)}) will be saved for reference.`)) return;
    const today = new Date().toISOString().split("T")[0]!;
    quickStatusMutation.mutate({
      id,
      data: {
        recipeName: session.recipeName,
        status: "brewing" as any,
        brewDate: today,
        plannedDate: session.brewDate,
        batchSizeGallons: session.batchSizeGallons,
        originalGravityActual: session.originalGravityActual ?? undefined,
        finalGravityActual: session.finalGravityActual ?? undefined,
        abvActual: session.abvActual ?? undefined,
        rating: session.rating ?? undefined,
        notes: session.notes ?? undefined,
      },
    });
  };

  const deleteMutation = useDeleteBrewSession({
    mutation: {
      onSuccess: () => { navigate("/brew-sessions"); toast({ title: "Session deleted" }); },
    },
  });

  const addReadingMutation = useAddFermentationReading({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(id) }); setShowReadingForm(false); toast({ title: "Reading logged" }); },
    },
  });

  const deleteReadingMutation = useDeleteFermentationReading({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(id) }),
    },
  });

  const deleteStatusLogMutation = useDeleteStatusLogEntry({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(id) }),
    },
  });

  const tastingMutation = useUpdateBrewSession({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(id) });
        setTastingEditing(false);
        toast({ title: "Tasting notes saved" });
      },
    },
  });

  useEffect(() => {
    if (session?.tastingNotes != null) setTastingNotes(session.tastingNotes);
  }, [session?.tastingNotes]);

  const handleSaveTasting = () => {
    if (!session) return;
    tastingMutation.mutate({
      id,
      data: {
        recipeName: session.recipeName,
        status: session.status,
        brewDate: session.brewDate,
        batchSizeGallons: session.batchSizeGallons,
        originalGravityActual: session.originalGravityActual ?? undefined,
        finalGravityActual: session.finalGravityActual ?? undefined,
        abvActual: session.abvActual ?? undefined,
        rating: session.rating ?? undefined,
        notes: session.notes ?? undefined,
        tastingNotes: tastingNotes || undefined,
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
      toast({ title: "Photo upload failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
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
      rating: session.rating != null ? String(session.rating) : "",
      notes: session.notes ?? "",
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
        rating: editForm.rating ? Number(editForm.rating) : undefined,
        notes: editForm.notes || undefined,
      },
    });
  };

  const handleAddReading = (e: React.FormEvent) => {
    e.preventDefault();
    addReadingMutation.mutate({
      id,
      data: {
        readingAt: readingForm.readingAt,
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
    date: formatReadingTime(r.readingAt),
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
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[session.status]}`}>{session.status}</span>
              {session.rating && (
                <span className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < session.rating! ? "fill-amber-400 text-amber-400" : "text-muted-foreground/25"}`} />
                  ))}
                </span>
              )}
            </div>
            {session.status === "scheduled" ? (
              <div className="mb-3 flex items-start gap-3 rounded-md border border-dashed border-border bg-muted/30 p-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">Not started yet</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Scheduled for {formatDate(session.brewDate)}. Start the brew to begin the stage timeline — today's date will be saved as the actual brew date.
                  </div>
                </div>
                <Button size="sm" onClick={handleStartBrew} disabled={quickStatusMutation.isPending} className="shrink-0">
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  Start brew
                </Button>
              </div>
            ) : (
              <div className="mb-3 overflow-x-auto">
                <StatusProgress status={session.status} onStatusChange={handleStatusClick} isPending={quickStatusMutation.isPending} />
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div>
                <div className="text-xs text-muted-foreground">{session.status === "scheduled" ? "Scheduled For" : "Brew Date"}</div>
                <div className="text-sm font-medium">{formatDate(session.brewDate)}</div>
                {session.plannedDate && session.status !== "scheduled" && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">planned {formatDate(session.plannedDate)}</div>
                )}
              </div>
              <div><div className="text-xs text-muted-foreground">Batch Size</div><div className="text-sm font-medium">{session.batchSizeGallons} gal</div></div>
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
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Brew Date</label><Input type="date" value={editForm.brewDate} onChange={(e) => setEditForm({ ...editForm, brewDate: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">Batch Size (gal)</label><Input type="number" step="0.1" value={editForm.batchSizeGallons} onChange={(e) => setEditForm({ ...editForm, batchSizeGallons: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">OG (actual)</label><Input type="number" step="0.001" value={editForm.originalGravityActual} onChange={(e) => setEditForm({ ...editForm, originalGravityActual: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">FG (actual)</label><Input type="number" step="0.001" value={editForm.finalGravityActual} onChange={(e) => setEditForm({ ...editForm, finalGravityActual: e.target.value })} /></div>
              <div><label className="text-xs text-muted-foreground mb-1 block">ABV % (actual)</label><Input type="number" step="0.1" value={editForm.abvActual} onChange={(e) => setEditForm({ ...editForm, abvActual: e.target.value })} /></div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Rating</label>
                <div className="flex items-center gap-1 h-9">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const val = i + 1;
                    const current = editForm.rating ? Number(editForm.rating) : 0;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setEditForm({ ...editForm, rating: current === val ? "" : String(val) })}
                        className="p-0.5 transition-transform hover:scale-110"
                      >
                        <Star className={`w-5 h-5 ${val <= current ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30 hover:text-amber-300"}`} />
                      </button>
                    );
                  })}
                  {editForm.rating && (
                    <button type="button" onClick={() => setEditForm({ ...editForm, rating: "" })} className="text-xs text-muted-foreground ml-1 hover:text-destructive">clear</button>
                  )}
                </div>
              </div>
            </div>
            <div><label className="text-xs text-muted-foreground mb-1 block">Notes</label><Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} /></div>
          </div>
        )}
      </div>

      {/* Tasting Notes & Photo */}
      <div className="bg-card border border-card-border rounded-lg">
        <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <NotebookPen className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Tasting Notes &amp; Photo</h2>
          </div>
          {!tastingEditing && (
            <Button size="sm" variant="outline" onClick={() => setTastingEditing(true)}>
              {tastingNotes ? "Edit Notes" : "Add Notes"}
            </Button>
          )}
        </div>
        <div className="p-4 space-y-4">
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
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
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
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
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
          {/* Tasting Notes */}
          {tastingEditing ? (
            <div className="space-y-2">
              <Textarea
                value={tastingNotes}
                onChange={(e) => setTastingNotes(e.target.value)}
                rows={4}
                placeholder="Aroma, flavour, mouthfeel, appearance, overall impressions…"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => { setTastingEditing(false); setTastingNotes(session.tastingNotes ?? ""); }}>
                  <X className="w-3.5 h-3.5 mr-1" />Cancel
                </Button>
                <Button size="sm" onClick={handleSaveTasting} disabled={tastingMutation.isPending}>
                  <Check className="w-3.5 h-3.5 mr-1" />Save
                </Button>
              </div>
            </div>
          ) : tastingNotes ? (
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{tastingNotes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No tasting notes yet.</p>
          )}
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
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${STATUS_COLORS[entry.status]}`}>{entry.status}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.changedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
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

      {/* Fermentation Chart */}
      {chartData.length > 1 && (
        <div className="bg-card border border-card-border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4">Fermentation Chart</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="temp" orientation="left" domain={["auto", "auto"]} tick={{ fontSize: 11 }} unit="°F" />
              <YAxis yAxisId="gravity" orientation="right" domain={["auto", "auto"]} tick={{ fontSize: 11 }} tickFormatter={(v) => v.toFixed(3)} />
              <Tooltip
                formatter={(value: number, name: string) =>
                  name === "temp" ? [`${value}°F`, "Temperature"] : [value?.toFixed(3), "Gravity"]
                }
              />
              <Legend formatter={(v) => v === "temp" ? "Temperature" : "Gravity"} />
              <Line yAxisId="temp" type="monotone" dataKey="temp" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="gravity" type="monotone" dataKey="gravity" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Fermentation Readings */}
      <div className="bg-card border border-card-border rounded-lg">
        <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Fermentation Readings</h2>
          <Button size="sm" variant="outline" onClick={() => setShowReadingForm(!showReadingForm)}>
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

          {session.readings && session.readings.length > 0 ? (
            <div className="space-y-1">
              {[...session.readings].reverse().map((reading) => (
                <div key={reading.id} className="flex items-center gap-3 text-sm py-2 px-2 rounded hover:bg-muted group">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{formatDate(reading.readingAt)}</span>
                  <div className="flex items-center gap-3 flex-1">
                    {reading.temperatureFahrenheit != null && (
                      <span className="flex items-center gap-1 text-amber-700">
                        <Thermometer className="w-3.5 h-3.5" />{reading.temperatureFahrenheit}°F
                      </span>
                    )}
                    {reading.gravity != null && (
                      <span className="flex items-center gap-1 text-blue-700">
                        <Droplets className="w-3.5 h-3.5" />{reading.gravity.toFixed(3)}
                      </span>
                    )}
                    {reading.ph != null && <span className="text-muted-foreground">pH {reading.ph.toFixed(2)}</span>}
                    {reading.notes && <span className="text-muted-foreground text-xs truncate">{reading.notes}</span>}
                  </div>
                  <button onClick={() => deleteReadingMutation.mutate({ id: reading.id })} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : !showReadingForm ? (
            <p className="text-sm text-muted-foreground text-center py-4">No readings logged yet</p>
          ) : null}
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
    </div>
  );
}
