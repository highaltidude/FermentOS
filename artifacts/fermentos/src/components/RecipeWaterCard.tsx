import { useState } from "react";
import { Link } from "wouter";
import { Droplets, Pencil, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSourceWater,
  getGetSourceWaterQueryKey,
  useUpdateRecipe,
  getGetRecipeQueryKey,
  getGetRecipeHistoryQueryKey,
  type Recipe,
  type RecipeWater,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WaterChemistryCalculator } from "@/components/WaterChemistryCalculator";
import { useToast } from "@/hooks/use-toast";
import { useWaterVolumeUnit } from "@/hooks/useWaterVolumeUnit";
import { getErrorMessage } from "@/lib/utils";
import { IONS, LITRES_PER_GALLON, applySalts, ratioBand, sulfateChlorideRatio, type Ion } from "@/lib/waterChemistry";
import { additions, fromLitres, ionsOf, saltName, saltsOf } from "@/lib/recipeWater";

const SHORT_ION: Record<Ion, string> = {
  calcium: "Ca", magnesium: "Mg", sodium: "Na", sulfate: "SO₄", chloride: "Cl", bicarbonate: "HCO₃",
};
const BAND_TEXT = { malty: "malty", balanced: "balanced", hoppy: "hoppy" } as const;


/** A recipe's water: what it aims for, the salts that get there, and editing it in the calculator. */
export function RecipeWaterCard({ recipe }: { recipe: Recipe }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const unit = useWaterVolumeUnit();
  const water = recipe.water ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RecipeWater | null>(null);

  const { data: tap } = useGetSourceWater({ query: { queryKey: getGetSourceWaterQueryKey() } });
  const save = useUpdateRecipe({
    mutation: {
      onSuccess: (_r, vars) => {
        qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(recipe.id) });
        qc.invalidateQueries({ queryKey: getGetRecipeHistoryQueryKey(recipe.id) });
        setEditing(false);
        toast({ title: vars.data.water ? "Water saved" : "Water removed" });
      },
      onError: (err: unknown) => toast({ title: "Couldn't save the water", description: getErrorMessage(err), variant: "destructive" }),
    },
  });

  const open = () => { setDraft(water); setEditing(true); };
  const result = water && tap?.profile ? applySalts(tap.profile, saltsOf(water), water.volumeLitres) : null;
  const ratio = result ? sulfateChlorideRatio(result) : null;
  const band = ratioBand(ratio);
  const target = water ? ionsOf(water) : null;

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Droplets className="w-4 h-4 text-muted-foreground" />Water
        </h2>
        <Button size="sm" variant="outline" onClick={open}>
          {water ? <><Pencil className="w-3.5 h-3.5 mr-1" />Edit</> : <><Plus className="w-3.5 h-3.5 mr-1" />Add water</>}
        </Button>
      </div>
      <div className="p-4">
        {!water ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No water saved. Add it to keep this recipe's target profile and salt additions, worked out in the water calculator.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-foreground">
                Target: <span className="font-medium">{water.target.name}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                For {fromLitres(water.volumeLitres, unit)} {unit} total water
              </p>
            </div>
            {additions(water).length === 0 ? (
              <p className="text-sm text-muted-foreground">No salt additions.</p>
            ) : (
              <ul className="text-sm space-y-1">
                {additions(water).map(({ salt, grams }) => (
                  <li key={salt} className="flex justify-between gap-2">
                    <span className="text-foreground">{saltName(salt)}</span>
                    <span className="font-medium text-foreground">{grams} g</span>
                  </li>
                ))}
              </ul>
            )}
            {result && target ? (
              <div className="bg-muted/50 rounded-md p-3 space-y-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left font-normal pb-1">ppm</th>
                        {IONS.map((ion) => <th key={ion} className="text-right font-normal pb-1">{SHORT_ION[ion]}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-border/50">
                        <td className="py-1 text-muted-foreground">Target</td>
                        {IONS.map((ion) => <td key={ion} className="py-1 text-right text-muted-foreground">{Math.round(target[ion])}</td>)}
                      </tr>
                      <tr className="border-t border-border/50">
                        <td className="py-1 text-foreground">With your water</td>
                        {IONS.map((ion) => <td key={ion} className="py-1 text-right font-medium text-foreground">{Math.round(result[ion])}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sulfate : chloride {ratio == null ? "—" : ratio.toFixed(2)}{band ? ` (${BAND_TEXT[band]})` : ""}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Save your tap water in <Link href="/calculators" className="underline">Calculators</Link> to see the profile these additions give.
              </p>
            )}
          </div>
        )}
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{water ? "Edit water" : "Add water"}</DialogTitle>
            <DialogDescription>
              Pick the target, set the total water for a {recipe.batchSizeGallons} gal batch, and the salts to add.
              Brews of a different size scale the salts to match.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <WaterChemistryCalculator
              embedded
              initial={water}
              defaultLitres={recipe.batchSizeGallons * LITRES_PER_GALLON}
              onChange={setDraft}
            />
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {water ? (
              <Button variant="ghost" className="text-destructive" disabled={save.isPending}
                onClick={() => save.mutate({ id: recipe.id, data: { water: null } })}>
                Remove water
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button disabled={!draft || save.isPending} onClick={() => draft && save.mutate({ id: recipe.id, data: { water: draft } })}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
