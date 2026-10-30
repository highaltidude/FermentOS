import { useEffect, useState } from "react";
import { Droplets, Save, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSourceWater,
  useSetSourceWater,
  getGetSourceWaterQueryKey,
  useGetUnitSystem,
  getGetUnitSystemQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  IONS,
  ION_LABELS,
  RO_WATER,
  SALTS,
  SALT_LABELS,
  TARGET_PROFILES,
  applySalts,
  isFar,
  needsChalk,
  ratioBand,
  residualAlkalinity,
  suggestSalts,
  sulfateChlorideRatio,
  toLitres,
  type Ion,
  type Profile,
  type Salt,
  type SaltAmounts,
} from "@/lib/waterChemistry";

type IonFields = Record<Ion, string>;
type SaltFields = Record<Salt, string>;

const toFields = (p: Profile): IonFields =>
  Object.fromEntries(IONS.map((ion) => [ion, String(p[ion])])) as IonFields;
const toProfile = (f: IonFields): Profile =>
  Object.fromEntries(IONS.map((ion) => [ion, Math.max(0, parseFloat(f[ion]) || 0)])) as Profile;
const emptySalts = (): SaltFields =>
  Object.fromEntries(SALTS.map((s) => [s, ""])) as SaltFields;
const toAmounts = (f: SaltFields): SaltAmounts =>
  Object.fromEntries(SALTS.map((s) => [s, Math.max(0, parseFloat(f[s]) || 0)])) as SaltAmounts;

const SHORT_ION: Record<Ion, string> = {
  calcium: "Ca", magnesium: "Mg", sodium: "Na", sulfate: "SO₄", chloride: "Cl", bicarbonate: "HCO₃",
};

const BAND_TEXT = {
  malty: "Malty — chloride-forward, fuller and rounder",
  balanced: "Balanced",
  hoppy: "Hoppy — sulfate-forward, drier and crisper bitterness",
} as const;

function IonInputs({ values, onChange }: { values: IonFields; onChange: (v: IonFields) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {IONS.map((ion) => (
        <div key={ion} className="space-y-1">
          <label className="text-xs text-muted-foreground">{ION_LABELS[ion]}</label>
          <Input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            value={values[ion]}
            onChange={(e) => onChange({ ...values, [ion]: e.target.value })}
            className="text-sm"
          />
        </div>
      ))}
    </div>
  );
}

export function WaterChemistryCalculator() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: saved } = useGetSourceWater({ query: { queryKey: getGetSourceWaterQueryKey() } });
  const { data: unitData } = useGetUnitSystem({ query: { queryKey: getGetUnitSystemQueryKey() } });
  const saveMutation = useSetSourceWater({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetSourceWaterQueryKey() });
        toast({ title: "Saved as your water" });
      },
      onError: () => toast({ title: "Couldn't save your water", variant: "destructive" }),
    },
  });

  const [source, setSource] = useState<IonFields>(() => toFields(RO_WATER));
  const [sourceEdited, setSourceEdited] = useState(false);
  const [targetId, setTargetId] = useState("balanced");
  const [custom, setCustom] = useState<IonFields>(() => toFields(TARGET_PROFILES.find((t) => t.id === "balanced")!.profile));
  const [volume, setVolume] = useState("");
  const [unit, setUnit] = useState<"gal" | "L">("gal");
  const [salts, setSalts] = useState<SaltFields>(emptySalts);

  // Prefill from the saved report once it arrives, unless the brewer has
  // already started typing.
  useEffect(() => {
    if (saved?.profile && !sourceEdited) setSource(toFields(saved.profile));
  }, [saved, sourceEdited]);

  const system = unitData?.system;
  useEffect(() => {
    if (system === "metric") setUnit("L");
    if (system === "imperial") setUnit("gal");
  }, [system]);

  const sourceProfile = toProfile(source);
  const target = targetId === "custom"
    ? toProfile(custom)
    : TARGET_PROFILES.find((t) => t.id === targetId)?.profile ?? RO_WATER;
  const litres = toLitres(parseFloat(volume) || 0, unit);
  const amounts = toAmounts(salts);
  const result = applySalts(sourceProfile, amounts, litres);
  const ratio = sulfateChlorideRatio(result);
  const band = ratioBand(ratio);
  const dilute = IONS.filter((ion) => sourceProfile[ion] > target[ion] && isFar(sourceProfile[ion], target[ion]));

  const editSource = (v: IonFields) => { setSource(v); setSourceEdited(true); };

  const handleSuggest = () => {
    const { grams } = suggestSalts(sourceProfile, target, litres);
    setSalts(Object.fromEntries(SALTS.map((s) => [s, grams[s] ? String(grams[s]) : ""])) as SaltFields);
  };

  const handleSave = () => {
    saveMutation.mutate({ data: { profile: { name: saved?.profile?.name ?? null, ...sourceProfile } } });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Droplets className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium text-foreground">Water Chemistry</span>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your water (ppm)</h3>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => editSource(toFields(RO_WATER))}>
              Use RO water
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleSave} disabled={saveMutation.isPending}>
              <Save className="w-3.5 h-3.5 mr-1.5" />Save as my water
            </Button>
          </div>
        </div>
        <IonInputs values={source} onChange={editSource} />
        <p className="text-xs text-muted-foreground">
          {saved?.profile ? "Filled in from your saved water." : "From your water report. Leave at zero for RO or distilled water."}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Target</h3>
        <Select value={targetId} onValueChange={setTargetId}>
          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["Style", "Historic city"] as const).map((group) => (
              <SelectGroup key={group}>
                <SelectLabel>{group === "Style" ? "By style" : "Historic city (approximate)"}</SelectLabel>
                {TARGET_PROFILES.filter((t) => t.group === group).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectGroup>
            ))}
            <SelectGroup>
              <SelectLabel>Your own</SelectLabel>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        {targetId === "custom" && <IonInputs values={custom} onChange={setCustom} />}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total water</h3>
        <div className="flex gap-2 max-w-xs">
          <Input
            type="number"
            min="0"
            step="0.1"
            inputMode="decimal"
            placeholder={unit === "gal" ? "e.g. 7.5" : "e.g. 28"}
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className="text-sm"
          />
          {system === "both" || system === undefined ? (
            <Select value={unit} onValueChange={(v) => setUnit(v as "gal" | "L")}>
              <SelectTrigger className="text-sm w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gal">gal</SelectItem>
                <SelectItem value="L">L</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <span className="self-center text-sm text-muted-foreground">{unit}</span>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Salt additions (g)</h3>
          <Button type="button" size="sm" onClick={handleSuggest} disabled={!(litres > 0)}>
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />Suggest additions
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SALTS.map((salt) => (
            <div key={salt} className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground flex-1">{SALT_LABELS[salt]}</label>
              <Input
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                placeholder="0"
                value={salts[salt]}
                onChange={(e) => setSalts({ ...salts, [salt]: e.target.value })}
                className="text-sm w-24"
              />
            </div>
          ))}
        </div>
        {!(litres > 0) && <p className="text-xs text-muted-foreground">Enter the total water volume to work out additions.</p>}
      </section>

      <section className="bg-muted/50 rounded-md p-3 space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-normal pb-1">ppm</th>
                <th className="text-right font-normal pb-1">Yours</th>
                <th className="text-right font-normal pb-1">Target</th>
                <th className="text-right font-normal pb-1">Result</th>
              </tr>
            </thead>
            <tbody>
              {IONS.map((ion) => {
                const far = isFar(result[ion], target[ion]);
                return (
                  <tr key={ion} className="border-t border-border/50">
                    <td className="py-1 text-foreground">{SHORT_ION[ion]}</td>
                    <td className="py-1 text-right text-muted-foreground">{Math.round(sourceProfile[ion])}</td>
                    <td className="py-1 text-right text-muted-foreground">{Math.round(target[ion])}</td>
                    <td className={`py-1 text-right font-medium ${far ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                      {Math.round(result[ion])}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Sulfate : chloride</p>
            <p className="text-lg font-semibold text-foreground">{ratio == null ? "—" : ratio.toFixed(2)}</p>
            {band && <p className="text-xs text-muted-foreground">{BAND_TEXT[band]}</p>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Residual alkalinity</p>
            <p className="text-lg font-semibold text-foreground">{Math.round(residualAlkalinity(result))} ppm</p>
            <p className="text-xs text-muted-foreground">as CaCO₃. Higher suits darker beers.</p>
          </div>
        </div>
        {litres > 0 && needsChalk(result, target) && (
          <p className="text-xs text-muted-foreground border-t border-border/50 pt-3">
            This target's calcium and bicarbonate are usually reached with chalk (calcium carbonate),
            or by letting dark malts bring the acidity down instead. Chalk isn't suggested here because it
            barely dissolves without acid or CO₂, and making up the bicarbonate with baking soda alone would
            make the water salty.
          </p>
        )}
        {dilute.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400 border-t border-border/50 pt-3">
            Your water already has more {dilute.map((ion) => SHORT_ION[ion]).join(", ")} than this target.
            Salts can only add minerals; to get closer, mix in RO or distilled water.
          </p>
        )}
      </section>
    </div>
  );
}
