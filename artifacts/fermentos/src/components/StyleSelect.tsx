import { useState } from "react";
import { X } from "lucide-react";
import { useListBeerStyles } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Beer style picker backed by the styles list in Settings, with a free-text
 * fallback. `fallbackPlaceholder` is shown when no styles are configured.
 */
export function StyleSelect({ value, onChange, fallbackPlaceholder }: {
  value: string;
  onChange: (v: string) => void;
  fallbackPlaceholder: string;
}) {
  const { data: styles } = useListBeerStyles();
  const [useCustom, setUseCustom] = useState(false);

  if (!styles || styles.length === 0) {
    return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={fallbackPlaceholder} />;
  }

  const knownNames = styles.map((s) => s.name);
  const valueInList = knownNames.includes(value);

  if (useCustom || (!valueInList && value)) {
    return (
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type a style" className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={() => { setUseCustom(false); onChange(""); }}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={(v) => { if (v === "__custom__") { setUseCustom(true); onChange(""); } else onChange(v); }}>
      <SelectTrigger><SelectValue placeholder="Select a style…" /></SelectTrigger>
      <SelectContent>
        {styles.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
        <SelectItem value="__custom__">Other (type manually)…</SelectItem>
      </SelectContent>
    </Select>
  );
}
