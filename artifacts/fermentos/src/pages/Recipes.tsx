import { useState } from "react";
import { Link } from "wouter";
import { Plus, Search, BookOpen, ChevronRight, Beaker, Clock, Star, FlaskConical } from "lucide-react";
import { useListRecipes, useGetRecipeStyles } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const STYLE_COLORS: Record<string, string> = {
  "American IPA": "bg-amber-100 text-amber-800",
  "Imperial Stout": "bg-gray-900 text-gray-100",
  "German Wheat": "bg-yellow-50 text-yellow-800",
};

function getStyleColor(style: string) {
  return STYLE_COLORS[style] ?? "bg-primary/10 text-primary";
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{rating.toFixed(1)}</span>
    </span>
  );
}

export default function Recipes() {
  const [search, setSearch] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<string | undefined>();

  const { data: recipes, isLoading } = useListRecipes({ search, style: selectedStyle });
  const { data: styles } = useGetRecipeStyles();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Recipes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{recipes?.length ?? 0} recipes in your book</p>
        </div>
        <Link href="/recipes/new">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1.5" />
            New Recipe
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-8 text-sm h-9"
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setSelectedStyle(undefined)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              !selectedStyle ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"
            }`}
          >
            All
          </button>
          {styles?.map((s) => (
            <button
              key={s.style}
              onClick={() => setSelectedStyle(s.style === selectedStyle ? undefined : s.style)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                selectedStyle === s.style ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              {s.style} ({s.count})
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
        ) : recipes && recipes.length > 0 ? (
          recipes.map((recipe) => {
            const totalDays = [
              recipe.daysPlanned,
              recipe.daysBrewing,
              recipe.daysFermenting,
              recipe.daysConditioning,
              recipe.daysPackaged,
            ].reduce<number>((s, d) => s + (d ?? 0), 0);

            return (
              <Link key={recipe.id} href={`/recipes/${recipe.id}`}>
                <div className="bg-card border border-card-border rounded-lg px-4 py-3.5 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer flex items-center gap-4">
                  <div className="p-2 rounded-md bg-muted shrink-0">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-foreground truncate">{recipe.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${getStyleColor(recipe.style)}`}>
                        {recipe.style}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>{recipe.batchSizeGallons} gal</span>
                      {recipe.abv && <span>{recipe.abv.toFixed(1)}% ABV</span>}
                      {recipe.ibu && <span>{recipe.ibu} IBU</span>}
                      {totalDays > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          ~{totalDays} days
                        </span>
                      )}
                      {(recipe.batchCount ?? 0) > 0 && (
                        <span className="flex items-center gap-1">
                          <FlaskConical className="w-3 h-3" />
                          {recipe.batchCount} {recipe.batchCount === 1 ? "batch" : "batches"}
                        </span>
                      )}
                    </div>
                    {recipe.avgRating != null && (
                      <div className="mt-1.5">
                        <StarRating rating={recipe.avgRating} />
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            );
          })
        ) : (
          <div className="bg-card border border-card-border rounded-lg py-16 text-center">
            <Beaker className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm font-medium text-foreground mb-1">No recipes yet</p>
            <p className="text-xs text-muted-foreground mb-4">Add your first homebrew recipe</p>
            <Link href="/recipes/new">
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1.5" />
                Create Recipe
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
