import { Link } from "wouter";
import { Droplets } from "lucide-react";
import { useGetRecipe, getGetRecipeQueryKey } from "@workspace/api-client-react";
import { useWaterVolumeUnit } from "@/hooks/useWaterVolumeUnit";
import { additions, fromLitres, saltName, scaleWater } from "@/lib/recipeWater";

/**
 * Brew day's salt additions: the recipe's water, scaled to this batch's size.
 * Follows the live recipe, like the rest of a running batch. Nothing shows
 * when the recipe has no water saved.
 */
export function BrewWaterCard({ recipeId, batchSizeGallons }: { recipeId: number; batchSizeGallons: number }) {
  const unit = useWaterVolumeUnit();
  const { data: recipe } = useGetRecipe(recipeId, { query: { queryKey: getGetRecipeQueryKey(recipeId) } });
  const saved = recipe?.water;
  if (!recipe || !saved) return null;

  const factor = batchSizeGallons / recipe.batchSizeGallons;
  const water = scaleWater(saved, factor);
  const scaled = water !== saved;
  const salts = additions(water);

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 border-b border-card-border flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Droplets className="w-4 h-4 text-muted-foreground" />Water
        </h2>
        <span className="text-xs text-muted-foreground">Target: {water.target.name}</span>
      </div>
      <div className="p-4 space-y-2">
        <p className="text-sm text-foreground">
          Treat {fromLitres(water.volumeLitres, unit)} {unit} of water (mash and sparge){salts.length > 0 ? " with:" : "."}
        </p>
        {salts.length === 0 ? (
          <p className="text-sm text-muted-foreground">The recipe adds no salts.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {salts.map(({ salt, grams }) => (
              <li key={salt} className="flex justify-between gap-2">
                <span className="text-foreground">{saltName(salt)}</span>
                <span className="font-medium text-foreground">{grams} g</span>
              </li>
            ))}
          </ul>
        )}
        {scaled && (
          <p className="text-xs text-muted-foreground">
            Scaled from the <Link href={`/recipes/${recipeId}`} className="underline">recipe's</Link>{" "}
            {recipe.batchSizeGallons} gal to this {batchSizeGallons} gal batch.
          </p>
        )}
      </div>
    </div>
  );
}
