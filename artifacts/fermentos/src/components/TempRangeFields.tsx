import { Input } from "@/components/ui/input";

type Prefix = "fermentTemp" | "conditionTemp";
type RangeKey<P extends Prefix> = `${P}Min` | `${P}Ideal` | `${P}Max`;

const DEFAULT_PLACEHOLDERS: Record<Prefix, [string, string, string]> = {
  fermentTemp: ["e.g., 65", "e.g., 68", "e.g., 72"],
  conditionTemp: ["e.g., 33", "e.g., 36", "e.g., 40"],
};

/**
 * Min / ideal / max inputs for one temperature range. Reads and writes the flat
 * `<prefix>Min` / `<prefix>Ideal` / `<prefix>Max` keys the recipe and brew forms
 * already use, so a page passes its form state straight in and merges the patch.
 */
export function TempRangeFields<P extends Prefix>({ prefix, values, onChange, unit, placeholders }: {
  prefix: P;
  values: Partial<Record<RangeKey<P>, string | undefined>>;
  onChange: (patch: Partial<Record<RangeKey<P>, string>>) => void;
  unit: string;
  placeholders?: [string, string, string];
}) {
  const [minPh, idealPh, maxPh] = placeholders ?? DEFAULT_PLACEHOLDERS[prefix];
  const fields: [RangeKey<P>, string, string][] = [
    [`${prefix}Min` as RangeKey<P>, "Min", minPh],
    [`${prefix}Ideal` as RangeKey<P>, "Ideal", idealPh],
    [`${prefix}Max` as RangeKey<P>, "Max", maxPh],
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {fields.map(([key, label, ph]) => (
        <div key={key}>
          <label className="text-xs text-muted-foreground mb-1 block">{label} (°{unit})</label>
          <Input
            type="number"
            step="0.1"
            value={values[key] ?? ""}
            onChange={(e) => onChange({ [key]: e.target.value } as Partial<Record<RangeKey<P>, string>>)}
            placeholder={ph}
          />
        </div>
      ))}
    </div>
  );
}
