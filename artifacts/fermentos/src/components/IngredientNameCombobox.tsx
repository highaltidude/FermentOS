import { useState } from "react";
import { Input } from "@/components/ui/input";

export interface IngredientSuggestion {
  name: string;
  type: string;
  unit: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelect: (item: IngredientSuggestion) => void;
  suggestions: IngredientSuggestion[];
  className?: string;
  placeholder?: string;
}

export function IngredientNameCombobox({
  value,
  onChange,
  onSelect,
  suggestions,
  className,
  placeholder = "Ingredient name",
}: Props) {
  const [open, setOpen] = useState(false);

  const lower = value.toLowerCase();
  const seen = new Set<string>();
  const filtered = suggestions
    .filter((s) => {
      const key = s.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return key.includes(lower);
    })
    .slice(0, 8);

  return (
    <div className={`relative${className ? ` ${className}` : ""}`}>
      <Input
        className="text-sm w-full"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 bg-popover border border-border rounded-md shadow-md max-h-52 overflow-y-auto">
          {filtered.map((item) => (
            <button
              key={item.name}
              type="button"
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent text-left gap-3"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
                setOpen(false);
              }}
            >
              <span className="truncate">{item.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {item.type.replace("_", " ")} · {item.unit}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
