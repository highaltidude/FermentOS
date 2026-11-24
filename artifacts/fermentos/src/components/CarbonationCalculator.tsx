import { useState, type ReactNode } from "react";
import { Beer } from "lucide-react";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFermentTempUnit } from "@/hooks/useFermentTempUnit";
import { useWaterVolumeUnit } from "@/hooks/useWaterVolumeUnit";
import {
  CARB_STYLE_PRESETS,
  SUGARS,
  SUGAR_LABELS,
  cToF,
  forceCarbPsi,
  gramsToOz,
  primingSugar,
  psiToBar,
} from "@/lib/carbonation";
import { LITRES_PER_GALLON } from "@/lib/waterChemistry";

type Mode = "bottle" | "keg";
const CUSTOM = "custom";
const DEFAULT_PRESET = CARB_STYLE_PRESETS.find((p) => p.id === "american-ale")!;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export function CarbonationCalculator() {
  const volumeUnit = useWaterVolumeUnit();
  const tempUnit = useFermentTempUnit();
  const metric = volumeUnit === "L";

  const [mode, setMode] = useState<Mode>("bottle");
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET.id);
  const [target, setTarget] = useState(String(DEFAULT_PRESET.target));
  const [volume, setVolume] = useState("");
  const [temp, setTemp] = useState("");

  const preset = CARB_STYLE_PRESETS.find((p) => p.id === presetId);

  const choosePreset = (id: string) => {
    setPresetId(id);
    const p = CARB_STYLE_PRESETS.find((x) => x.id === id);
    if (p) setTarget(String(p.target));
  };

  const targetVol = parseFloat(target);
  const volumeVal = parseFloat(volume);
  const tempVal = parseFloat(temp);
  const tempF = Number.isFinite(tempVal) ? (tempUnit === "C" ? cToF(tempVal) : tempVal) : NaN;
  const volumeL = metric ? volumeVal : volumeVal * LITRES_PER_GALLON;

  const targetOk = Number.isFinite(targetVol) && targetVol > 0 && targetVol <= 6;
  const tempOk = Number.isFinite(tempF) && tempF >= 28 && tempF <= 100;
  const volumeOk = Number.isFinite(volumeL) && volumeL > 0;

  const bottle = mode === "bottle" && targetOk && tempOk && volumeOk
    ? primingSugar({ volumeL, tempF, targetVol })
    : null;
  const psi = mode === "keg" && targetOk && tempOk ? forceCarbPsi({ tempF, targetVol }) : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Beer className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground">Carbonation</span>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Packaging">
          <FilterChip active={mode === "bottle"} aria-pressed={mode === "bottle"} onClick={() => setMode("bottle")}>
            Bottling
          </FilterChip>
          <FilterChip active={mode === "keg"} aria-pressed={mode === "keg"} onClick={() => setMode("keg")}>
            Kegging
          </FilterChip>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Style">
          <Select value={presetId} onValueChange={choosePreset}>
            <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CARB_STYLE_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
              <SelectItem value={CUSTOM}>Custom</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={preset ? `Target CO₂ (volumes, style range ${preset.min}–${preset.max})` : "Target CO₂ (volumes)"}>
          <Input
            type="number"
            value={target}
            onChange={(e) => { setTarget(e.target.value); setPresetId(CUSTOM); }}
            step="0.1"
            min="0"
            max="6"
          />
        </Field>
        {mode === "bottle" && (
          <Field label={`Batch volume (${volumeUnit})`}>
            <Input
              type="number"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              placeholder={metric ? "19" : "5"}
              step={metric ? "0.5" : "0.25"}
              min="0"
            />
          </Field>
        )}
        <Field label={mode === "bottle" ? `Warmest beer temp after fermentation (°${tempUnit})` : `Keg temperature (°${tempUnit})`}>
          <Input
            type="number"
            value={temp}
            onChange={(e) => setTemp(e.target.value)}
            placeholder={mode === "bottle" ? (tempUnit === "C" ? "20" : "68") : (tempUnit === "C" ? "3" : "38")}
            step={tempUnit === "C" ? "0.5" : "1"}
          />
        </Field>
      </div>

      {mode === "bottle" && bottle && (
        <div className="bg-muted/50 rounded-md p-3 space-y-3">
          {bottle.grams ? (
            <div className="grid grid-cols-2 gap-3">
              {SUGARS.map((s) => (
                <div key={s}>
                  <p className="text-xs text-muted-foreground">{SUGAR_LABELS[s]}</p>
                  <p className="text-lg font-semibold text-foreground">
                    {Math.round(bottle.grams[s])} g
                    {!metric && (
                      <span className="text-sm font-normal text-muted-foreground"> · {gramsToOz(bottle.grams[s]).toFixed(1)} oz</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground">
              The beer already holds about {bottle.residual.toFixed(2)} volumes, at or above the target. No priming sugar needed.
            </p>
          )}
          <p className="text-xs text-muted-foreground border-t border-border/50 pt-3">
            Use one sugar, not all of them. Residual CO₂ already in the beer: {bottle.residual.toFixed(2)} volumes.
          </p>
        </div>
      )}

      {mode === "keg" && psi !== null && (
        <div className="bg-muted/50 rounded-md p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Regulator pressure</p>
              <p className="text-xl font-bold text-foreground">
                {metric ? `${psiToBar(psi).toFixed(2)} bar` : `${psi.toFixed(1)} psi`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{metric ? "In psi" : "In bar"}</p>
              <p className="text-lg font-semibold text-foreground">
                {metric ? `${psi.toFixed(1)} psi` : `${psiToBar(psi).toFixed(2)} bar`}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground border-t border-border/50 pt-3">
            Hold this pressure at this temperature; the beer reaches the target in about 1–2 weeks.
          </p>
        </div>
      )}

      {((mode === "bottle" && !bottle) || (mode === "keg" && psi === null)) && (
        <p className="text-xs text-muted-foreground">
          {mode === "bottle"
            ? "Enter the batch volume and temperature to see how much priming sugar to add."
            : "Enter the keg temperature to see the regulator pressure."}
        </p>
      )}
    </div>
  );
}
