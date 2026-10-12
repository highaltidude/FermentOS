import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Beer, Loader2 } from "lucide-react";
import { useCreateBrewSession, type Recipe, type RecipeVariant } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VariantSwitcher } from "@/components/VariantChips";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage, shortageLines } from "@/lib/inventoryShortage";
import { VARIANT_LABELS } from "@/lib/recipeVariants";

/**
 * Starting a brew from a recipe with several versions: asks which one, since
 * that decides what comes out of inventory and what the boil timer calls for.
 * A stock shortage is shown here rather than in a toast, so the brewer can
 * switch to a version they do have the ingredients for.
 */
export function StartBrewDialog({ recipe, variants, initialVariant, open, onOpenChange }: {
  recipe: Recipe;
  variants: readonly RecipeVariant[];
  initialVariant: RecipeVariant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [variant, setVariant] = useState<RecipeVariant>(initialVariant ?? variants[0]!);
  const [problem, setProblem] = useState<{ title: string; lines: string[] } | null>(null);

  useEffect(() => {
    if (open) {
      setVariant(initialVariant ?? variants[0]!);
      setProblem(null);
    }
    // Reset only when the dialog opens, not while a version is being chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const createMutation = useCreateBrewSession({
    mutation: {
      onSuccess: (session) => {
        onOpenChange(false);
        navigate(`/brew-sessions/${session.id}`);
        toast({ title: "Brew session started!" });
      },
      onError: (err: unknown) => {
        const shortages = shortageLines(err, 12);
        setProblem(
          shortages
            ? { title: `Not enough in inventory for the ${VARIANT_LABELS[variant]} version`, lines: shortages }
            : { title: "Failed to start session", lines: [apiErrorMessage(err) ?? "Please try again"] },
        );
      },
    },
  });

  const start = () => {
    setProblem(null);
    createMutation.mutate({
      data: {
        recipeId: recipe.id,
        recipeName: recipe.name,
        recipeVariant: variant,
        status: "brew_day",
        brewDate: new Date().toLocaleDateString("en-CA"),
        batchSizeGallons: recipe.batchSizeGallons,
        originalGravityActual: recipe.originalGravity ?? undefined,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Which version are you brewing?</DialogTitle>
          <DialogDescription>
            {recipe.name} comes in {variants.length} versions. Only the one you pick is taken from inventory and shown on the boil timer.
          </DialogDescription>
        </DialogHeader>

        <VariantSwitcher available={variants} value={variant} onChange={(v) => { if (v) { setVariant(v); setProblem(null); } }} />

        {problem && (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <div className="font-medium text-destructive">{problem.title}</div>
            <ul className="mt-1 space-y-0.5 text-foreground">
              {problem.lines.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={start} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Beer className="w-3.5 h-3.5 mr-1.5" />}
            Start {VARIANT_LABELS[variant]} Brew
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
