import { useState, useEffect } from "react";
import { Check, X, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import {
  useUpsertBrewRating,
  useDeleteBrewRating,
  getGetBrewSessionQueryKey,
  type BrewSession,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StarScore, ScoreScale, OffFlavorTags, BREW_AGAIN_LABELS } from "@/components/ui/score-picker";
import { useToast } from "@/hooks/use-toast";

interface Draft {
  appearanceAromaScore: number | null;
  flavorBalanceScore: number | null;
  mouthfeelScore: number | null;
  overallScore: number | null;
  offFlavors: string[];
  brewAgain: string | null;
  tastingNotes: string;
}

const EMPTY_DRAFT: Draft = {
  appearanceAromaScore: null,
  flavorBalanceScore: null,
  mouthfeelScore: null,
  overallScore: null,
  offFlavors: [],
  brewAgain: null,
  tastingNotes: "",
};

function draftFromSession(session: BrewSession): Draft {
  return {
    appearanceAromaScore: session.appearanceAromaScore ?? null,
    flavorBalanceScore: session.flavorBalanceScore ?? null,
    mouthfeelScore: session.mouthfeelScore ?? null,
    overallScore: session.overallScore ?? null,
    offFlavors: session.offFlavors ?? [],
    brewAgain: session.brewAgain ?? null,
    tastingNotes: session.tastingNotes ?? "",
  };
}

const STAR_LEGEND = "1 = flawed · 3 = solid · 5 = excellent";

const STEPS = [
  {
    title: "Appearance & aroma",
    guidance:
      "Pour into a clean glass and hold it to the light — clarity, head retention, colour. Then nose it: malt sweetness, hop character, yeast esters, and anything that smells off.",
    legend: STAR_LEGEND,
  },
  {
    title: "Flavor & balance",
    guidance:
      "Take a real sip and let it coat your palate. Are malt and hops in balance for the style you were going for? How does it finish — dry, sweet, lingering bitterness?",
    legend: STAR_LEGEND,
  },
  {
    title: "Mouthfeel & carbonation",
    guidance:
      "Body: thin, medium, or full? Carbonation: flat, lively, or over-fizzy? Note any alcohol warmth or drying astringency that pulls at the back of your tongue.",
    legend: STAR_LEGEND,
  },
  {
    title: "Overall",
    guidance:
      "Forget the style guidelines for a moment — how much did you actually enjoy drinking it? This is the score that rolls up to the recipe, so it's what you'll compare batches on later.",
    legend: "1 = drain pour · 10 = best thing I've brewed",
  },
  {
    title: "Anything else?",
    guidance:
      "All optional. Off-flavor tags are worth setting even on a batch you liked — they're how you spot a process problem repeating across brews.",
    legend: "",
  },
] as const;

const LAST_STEP = STEPS.length - 1;

interface RateBatchWizardProps {
  session: BrewSession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RateBatchWizard({ session, open, onOpenChange }: RateBatchWizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const qc = useQueryClient();
  const { toast } = useToast();

  // Reseed every time the dialog opens, so reopening starts from what's
  // saved and closing throws away in-progress edits.
  useEffect(() => {
    if (!open) return;
    setDraft(draftFromSession(session));
    setStep(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const saveMutation = useUpsertBrewRating({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(session.id) });
        onOpenChange(false);
        toast({ title: "Rating saved" });
      },
      onError: () =>
        toast({
          title: "Failed to save rating",
          description: "Please check your scores and try again.",
          variant: "destructive",
        }),
    },
  });

  const clearMutation = useDeleteBrewRating({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(session.id) });
        onOpenChange(false);
        toast({ title: "Rating cleared" });
      },
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      id: session.id,
      data: {
        appearanceAromaScore: draft.appearanceAromaScore,
        flavorBalanceScore: draft.flavorBalanceScore,
        mouthfeelScore: draft.mouthfeelScore,
        overallScore: draft.overallScore,
        offFlavors: draft.offFlavors as any,
        brewAgain: draft.brewAgain as any,
        tastingNotes: draft.tastingNotes || null,
      },
    });
  };

  const handleClear = () => {
    if (!confirm("Clear the rating for this batch? Tasting notes are kept.")) return;
    clearMutation.mutate({ id: session.id });
  };

  const busy = saveMutation.isPending || clearMutation.isPending;
  const current = STEPS[step]!;

  // Enter advances, or saves on the last step. Ignored inside the notes
  // textarea so newlines still work there.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
    e.preventDefault();
    if (busy) return;
    if (step === LAST_STEP) handleSave();
    else setStep(step + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              Step {step + 1} of {STEPS.length}
            </span>
            <span className="flex items-center gap-1 ml-auto mr-6">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? "w-5 bg-primary" : i < step ? "w-1.5 bg-primary/50" : "w-1.5 bg-muted"
                  }`}
                />
              ))}
            </span>
          </div>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription className="leading-relaxed">{current.guidance}</DialogDescription>
        </DialogHeader>

        <div className="py-2 min-h-[8.5rem]">
          {current.legend && (
            <p className="text-[11px] text-muted-foreground mb-2">{current.legend}</p>
          )}

          {step === 0 && (
            <StarScore
              label="Appearance & aroma"
              value={draft.appearanceAromaScore}
              onChange={(v) => setDraft({ ...draft, appearanceAromaScore: v })}
            />
          )}
          {step === 1 && (
            <StarScore
              label="Flavor & balance"
              value={draft.flavorBalanceScore}
              onChange={(v) => setDraft({ ...draft, flavorBalanceScore: v })}
            />
          )}
          {step === 2 && (
            <StarScore
              label="Mouthfeel & carbonation"
              value={draft.mouthfeelScore}
              onChange={(v) => setDraft({ ...draft, mouthfeelScore: v })}
            />
          )}
          {step === 3 && (
            <ScoreScale
              label="Overall enjoyment"
              value={draft.overallScore}
              onChange={(v) => setDraft({ ...draft, overallScore: v })}
            />
          )}
          {step === LAST_STEP && (
            <div className="space-y-4">
              <OffFlavorTags
                value={draft.offFlavors}
                onChange={(v) => setDraft({ ...draft, offFlavors: v })}
              />
              <div className="max-w-xs">
                <label className="text-xs font-medium text-foreground mb-1 block">
                  Would you brew it again?
                </label>
                <Select
                  value={draft.brewAgain ?? "unset"}
                  onValueChange={(v) => setDraft({ ...draft, brewAgain: v === "unset" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Not answered</SelectItem>
                    {Object.entries(BREW_AGAIN_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Tasting notes</label>
                <Textarea
                  value={draft.tastingNotes}
                  onChange={(e) => setDraft({ ...draft, tastingNotes: e.target.value })}
                  rows={3}
                  placeholder="What stood out? What would you change next time?"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-3">
          {step === LAST_STEP && session.ratedAt && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={busy}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />Clear Rating
            </Button>
          )}
          <span className="ml-auto" />
          {step > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)} disabled={busy}>
              <ChevronLeft className="w-3.5 h-3.5 mr-1" />Back
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
              <X className="w-3.5 h-3.5 mr-1" />Cancel
            </Button>
          )}
          {step === LAST_STEP ? (
            <Button size="sm" onClick={handleSave} disabled={busy}>
              <Check className="w-3.5 h-3.5 mr-1" />Save Rating
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStep(step + 1)} disabled={busy}>
              Next<ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
