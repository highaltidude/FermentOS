import { useState } from "react";
import { Plus, Search, Wrench, Pencil, Trash2, Check, X } from "lucide-react";
import {
  useListEquipment,
  useCreateEquipment,
  useUpdateEquipment,
  useDeleteEquipment,
  getListEquipmentQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = [
  "Kettle", "Fermenter", "Mash Tun", "Chiller", "Pump", "Keg", "Tap System",
  "Hydrometer", "Thermometer", "pH Meter", "Scale", "Filter", "Cleaning", "Other",
];

const CONDITIONS = ["new", "good", "fair", "poor"] as const;

const CONDITION_COLORS: Record<string, string> = {
  new: "bg-green-100 text-green-800 border-green-200",
  good: "bg-blue-100 text-blue-800 border-blue-200",
  fair: "bg-yellow-100 text-yellow-800 border-yellow-200",
  poor: "bg-red-100 text-red-800 border-red-200",
};

const emptyForm = () => ({
  name: "", brand: "", model: "", category: "Other",
  purchasedDate: "", purchasePrice: "", condition: "" as string,
  serialNumber: "", notes: "",
});

type EquipmentFormData = ReturnType<typeof emptyForm>;

// Parse a YYYY-MM-DD date string as local midnight to prevent UTC offset shifting.
function formatDate(d: string | null | undefined) {
  if (!d) return null;
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, day ?? 1).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface EquipmentFormProps {
  form: EquipmentFormData;
  setForm: (f: EquipmentFormData) => void;
  isEdit?: boolean;
  isPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

function EquipmentForm({ form, setForm, isEdit = false, isPending, onSubmit, onCancel }: EquipmentFormProps) {
  return (
    <form onSubmit={onSubmit} className="bg-muted/50 rounded-lg p-4 space-y-3 border border-border">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
          <Input placeholder="e.g., Blichmann Brewtus" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Brand</label>
          <Input placeholder="e.g., Blichmann" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Model</label>
          <Input placeholder="e.g., Brewtus IV" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Category *</label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
            <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Condition</label>
          <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
            <SelectTrigger className="text-sm h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not specified</SelectItem>
              {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Purchase Date</label>
          <Input type="date" value={form.purchasedDate} onChange={(e) => setForm({ ...form, purchasedDate: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Purchase Price</label>
          <Input placeholder="e.g., $349.99" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">Serial Number</label>
          <Input placeholder="Optional" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
          <Textarea placeholder="Any additional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="w-3.5 h-3.5" />
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          <Check className="w-3.5 h-3.5 mr-1" />{isEdit ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  );
}

export default function Equipment() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: items, isLoading } = useListEquipment({
    search: search || undefined,
    category: categoryFilter,
  });

  const createMutation = useCreateEquipment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEquipmentQueryKey() });
        setShowAdd(false);
        setForm(emptyForm());
        toast({ title: "Equipment added" });
      },
    },
  });

  const updateMutation = useUpdateEquipment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEquipmentQueryKey() });
        setEditingId(null);
        toast({ title: "Equipment updated" });
      },
    },
  });

  const deleteMutation = useDeleteEquipment({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEquipmentQueryKey() });
        toast({ title: "Equipment removed" });
      },
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.category) return;
    createMutation.mutate({
      data: {
        name: form.name,
        brand: form.brand || undefined,
        model: form.model || undefined,
        category: form.category,
        purchasedDate: form.purchasedDate || undefined,
        purchasePrice: form.purchasePrice || undefined,
        condition: (form.condition && form.condition !== "none" ? form.condition as any : undefined),
        serialNumber: form.serialNumber || undefined,
        notes: form.notes || undefined,
      },
    });
  };

  const handleUpdate = (id: number) => (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      id,
      data: {
        name: form.name,
        brand: form.brand || undefined,
        model: form.model || undefined,
        category: form.category,
        purchasedDate: form.purchasedDate || undefined,
        purchasePrice: form.purchasePrice || undefined,
        condition: (form.condition && form.condition !== "none" ? form.condition as any : undefined),
        serialNumber: form.serialNumber || undefined,
        notes: form.notes || undefined,
      },
    });
  };

  const startEdit = (item: any) => {
    setForm({
      name: item.name,
      brand: item.brand ?? "",
      model: item.model ?? "",
      category: item.category,
      purchasedDate: item.purchasedDate ?? "",
      purchasePrice: item.purchasePrice ?? "",
      condition: item.condition ?? "",
      serialNumber: item.serialNumber ?? "",
      notes: item.notes ?? "",
    });
    setEditingId(item.id);
    setShowAdd(false);
  };

  const handleCancel = () => { setShowAdd(false); setEditingId(null); };

  const categories = items ? [...new Set(items.map((i) => i.category))].sort() : [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Equipment</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{items?.length ?? 0} items in your brewery</p>
        </div>
        <Button size="sm" onClick={() => { setShowAdd(true); setEditingId(null); setForm(emptyForm()); }}>
          <Plus className="w-4 h-4 mr-1.5" />Add Equipment
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 text-sm h-9" placeholder="Search equipment..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setCategoryFilter(undefined)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!categoryFilter ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
            All
          </button>
          {categories.map((c) => (
            <button key={c} onClick={() => setCategoryFilter(c === categoryFilter ? undefined : c)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${categoryFilter === c ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {showAdd && (
        <EquipmentForm
          form={form}
          setForm={setForm}
          isPending={createMutation.isPending}
          onSubmit={handleCreate}
          onCancel={handleCancel}
        />
      )}

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
        ) : items && items.length > 0 ? (
          items.map((item) => (
            <div key={item.id}>
              {editingId === item.id ? (
                <EquipmentForm
                  form={form}
                  setForm={setForm}
                  isEdit
                  isPending={updateMutation.isPending}
                  onSubmit={handleUpdate(item.id)}
                  onCancel={handleCancel}
                />
              ) : (
                <div className="bg-card border border-card-border rounded-lg px-4 py-3.5 flex items-start gap-4 hover:border-primary/30 transition-colors group">
                  <div className="p-2 rounded-md bg-muted shrink-0 mt-0.5">
                    <Wrench className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{item.name}</span>
                      <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">{item.category}</span>
                      {item.condition && (
                        <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${CONDITION_COLORS[item.condition]}`}>{item.condition}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {(item.brand || item.model) && (
                        <span className="font-medium text-foreground/80">
                          {[item.brand, item.model].filter(Boolean).join(" ")}
                        </span>
                      )}
                      {item.purchasedDate && <span>Purchased {formatDate(item.purchasedDate)}</span>}
                      {item.purchasePrice && <span>{item.purchasePrice}</span>}
                      {item.serialNumber && <span>S/N: {item.serialNumber}</span>}
                    </div>
                    {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                  </div>
                  <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => startEdit(item)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { if (confirm("Remove this equipment?")) deleteMutation.mutate({ id: item.id }); }} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="bg-card border border-card-border rounded-lg py-16 text-center">
            <Wrench className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-foreground mb-1">No equipment yet</p>
            <p className="text-xs text-muted-foreground mb-4">Track your kettles, fermenters, and gear</p>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-1.5" />Add First Item
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
