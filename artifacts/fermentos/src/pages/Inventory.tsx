import { useState } from "react";
import { Plus, Search, Package, Pencil, Trash2, Check, X } from "lucide-react";
import { useListInventory, useCreateInventoryItem, useUpdateInventoryItem, useDeleteInventoryItem, getListInventoryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const INGREDIENT_TYPES = ["malt", "hop", "yeast", "adjunct", "water_agent", "other"];
const TYPE_COLORS: Record<string, string> = {
  malt: "bg-amber-100 text-amber-800 border-amber-200",
  hop: "bg-green-100 text-green-800 border-green-200",
  yeast: "bg-yellow-100 text-yellow-800 border-yellow-200",
  adjunct: "bg-orange-100 text-orange-800 border-orange-200",
  water_agent: "bg-blue-100 text-blue-800 border-blue-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

const emptyForm = () => ({
  name: "", type: "malt", amount: "", unit: "lbs", purchasedDate: "", expiryDate: "", supplier: "", notes: "",
});

type InventoryFormData = ReturnType<typeof emptyForm>;

function isExpiringSoon(expiryDate: string | null | undefined) {
  if (!expiryDate) return false;
  const diff = new Date(expiryDate).getTime() - Date.now();
  return diff > 0 && diff < 1000 * 60 * 60 * 24 * 30;
}

function isExpired(expiryDate: string | null | undefined) {
  if (!expiryDate) return false;
  return new Date(expiryDate).getTime() < Date.now();
}

interface InventoryFormProps {
  form: InventoryFormData;
  setForm: (f: InventoryFormData) => void;
  isEdit?: boolean;
  isPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

function InventoryForm({ form, setForm, isEdit = false, isPending, onSubmit, onCancel }: InventoryFormProps) {
  return (
    <form onSubmit={onSubmit} className="bg-muted/50 rounded-lg p-3 space-y-3 border border-border">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="text-sm col-span-2" />
        <div className="flex gap-2">
          <Input placeholder="Amount *" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="text-sm w-24" />
          <Input placeholder="Unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="text-sm w-20" />
        </div>
        <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
          <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{INGREDIENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}</SelectContent>
        </Select>
        <div><label className="text-xs text-muted-foreground mb-1 block">Purchased</label><Input type="date" value={form.purchasedDate} onChange={(e) => setForm({ ...form, purchasedDate: e.target.value })} className="text-sm" /></div>
        <div><label className="text-xs text-muted-foreground mb-1 block">Expiry</label><Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className="text-sm" /></div>
        <Input placeholder="Supplier (optional)" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="text-sm col-span-2" />
        <Input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="text-sm col-span-2" />
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}><X className="w-3.5 h-3.5" /></Button>
        <Button type="submit" size="sm" disabled={isPending}>
          <Check className="w-3.5 h-3.5 mr-1" />{isEdit ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  );
}

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: items, isLoading } = useListInventory({ search, type: typeFilter as any });

  const createMutation = useCreateInventoryItem({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListInventoryQueryKey() }); setShowAdd(false); setForm(emptyForm()); toast({ title: "Item added to inventory" }); },
    },
  });

  const updateMutation = useUpdateInventoryItem({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListInventoryQueryKey() }); setEditingId(null); toast({ title: "Item updated" }); },
    },
  });

  const deleteMutation = useDeleteInventoryItem({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListInventoryQueryKey() }); toast({ title: "Item removed" }); },
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.amount) return;
    createMutation.mutate({
      data: {
        name: form.name,
        type: form.type as any,
        amount: Number(form.amount),
        unit: form.unit,
        purchasedDate: form.purchasedDate || undefined,
        expiryDate: form.expiryDate || undefined,
        supplier: form.supplier || undefined,
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
        type: form.type as any,
        amount: Number(form.amount),
        unit: form.unit,
        purchasedDate: form.purchasedDate || undefined,
        expiryDate: form.expiryDate || undefined,
        supplier: form.supplier || undefined,
        notes: form.notes || undefined,
      },
    });
  };

  const startEdit = (item: any) => {
    setForm({
      name: item.name, type: item.type, amount: String(item.amount), unit: item.unit,
      purchasedDate: item.purchasedDate ?? "", expiryDate: item.expiryDate ?? "",
      supplier: item.supplier ?? "", notes: item.notes ?? "",
    });
    setEditingId(item.id);
    setShowAdd(false);
  };

  const handleCancel = () => { setShowAdd(false); setEditingId(null); };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{items?.length ?? 0} items on hand</p>
        </div>
        <Button size="sm" onClick={() => { setShowAdd(true); setEditingId(null); setForm(emptyForm()); }}>
          <Plus className="w-4 h-4 mr-1.5" />Add Item
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 text-sm h-9" placeholder="Search inventory..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setTypeFilter(undefined)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!typeFilter ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>All</button>
          {INGREDIENT_TYPES.map((t) => (
            <button key={t} onClick={() => setTypeFilter(t === typeFilter ? undefined : t)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${typeFilter === t ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
              {t.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {showAdd && (
        <InventoryForm
          form={form}
          setForm={setForm}
          isPending={createMutation.isPending}
          onSubmit={handleCreate}
          onCancel={handleCancel}
        />
      )}

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)
        ) : items && items.length > 0 ? (
          items.map((item) => (
            <div key={item.id}>
              {editingId === item.id ? (
                <InventoryForm
                  form={form}
                  setForm={setForm}
                  isEdit
                  isPending={updateMutation.isPending}
                  onSubmit={handleUpdate(item.id)}
                  onCancel={handleCancel}
                />
              ) : (
                <div className="bg-card border border-card-border rounded-lg px-4 py-3 flex items-center gap-4 hover:border-primary/30 transition-colors group">
                  <div className="p-2 rounded-md bg-muted">
                    <Package className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-foreground">{item.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 ${TYPE_COLORS[item.type]}`}>{item.type.replace("_", " ")}</span>
                      {isExpired(item.expiryDate) && <span className="text-xs text-destructive font-medium">Expired</span>}
                      {!isExpired(item.expiryDate) && isExpiringSoon(item.expiryDate) && <span className="text-xs text-amber-600 font-medium">Expiring soon</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{item.amount} {item.unit}</span>
                      {item.supplier && <span>{item.supplier}</span>}
                      {item.expiryDate && <span>Exp: {new Date(item.expiryDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>}
                      {item.notes && <span className="truncate">{item.notes}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(item)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteMutation.mutate({ id: item.id })} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="bg-card border border-card-border rounded-lg py-16 text-center">
            <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-foreground mb-1">Inventory is empty</p>
            <p className="text-xs text-muted-foreground mb-4">Track your malts, hops, yeast, and more</p>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="w-4 h-4 mr-1.5" />Add First Item
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
