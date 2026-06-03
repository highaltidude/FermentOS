import { useState } from "react";
import { Calculator, Droplets, Scale, DollarSign, FlaskConical } from "lucide-react";

const comingSoon = [
  {
    icon: Droplets,
    name: "Water Chemistry",
    description: "Calculate salt additions to match your target water profile for any beer style",
  },
  {
    icon: Scale,
    name: "Recipe Scaling",
    description: "Scale any recipe up or down by batch size with automatic ingredient recalculation",
  },
  {
    icon: DollarSign,
    name: "Batch Cost",
    description: "Track ingredient costs and calculate cost per pint for any batch",
  },
];

function calcAbv(og: number, fg: number) {
  const abv = (og - fg) * 131.25;
  const attenuation = ((og - fg) / (og - 1.0)) * 100;
  // ASBC calorie method (Brewer's Friend / Reiss 1994)
  const ogP = (og - 1) * 250;
  const fgP = (fg - 1) * 250;
  const re  = 0.1808 * ogP + 0.8192 * fgP;
  const abw = (ogP - re) / (2.0665 - 0.010665 * ogP);
  const calories = (6.9 * abw + 4.0 * Math.max(0, re - 0.1)) * fg * 3.55;
  return { abv, attenuation, calories };
}

export default function Calculators() {
  const [og, setOg] = useState("");
  const [fg, setFg] = useState("");

  const ogVal = parseFloat(og);
  const fgVal = parseFloat(fg);
  const valid =
    !isNaN(ogVal) && !isNaN(fgVal) &&
    ogVal > 1.0 && fgVal > 1.0 &&
    ogVal > fgVal && ogVal < 1.2 && fgVal < 1.2;

  const results = valid ? calcAbv(ogVal, fgVal) : null;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Calculator className="w-6 h-6 text-foreground" />
          <h1 className="text-2xl font-bold text-foreground">Calculators</h1>
        </div>
        <p className="text-sm text-muted-foreground">Brewing tools to help you perfect every batch</p>
      </div>

      {/* Gravity & ABV — live calculator */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground">Gravity &amp; ABV</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Original Gravity (OG)</label>
            <input
              type="number"
              value={og}
              onChange={e => setOg(e.target.value)}
              placeholder="1.052"
              step="0.001"
              min="1.000"
              max="1.200"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Final Gravity (FG)</label>
            <input
              type="number"
              value={fg}
              onChange={e => setFg(e.target.value)}
              placeholder="1.010"
              step="0.001"
              min="1.000"
              max="1.200"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        {results ? (
          <div className="bg-muted/50 rounded-md p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">ABV</p>
                <p className="text-xl font-bold text-foreground">{results.abv.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Apparent Attenuation</p>
                <p className="text-xl font-bold text-foreground">{results.attenuation.toFixed(1)}%</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-3">
              <div>
                <p className="text-xs text-muted-foreground">Calories / 12 oz</p>
                <p className="text-lg font-semibold text-foreground">{Math.round(results.calories)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gravity</p>
                <p className="text-sm font-medium text-foreground">
                  {ogVal.toFixed(3)} → {fgVal.toFixed(3)}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Enter OG and FG above to see results.
          </p>
        )}
      </div>

      {/* Remaining placeholders */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
          Coming Soon
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {comingSoon.map(({ icon: Icon, name, description }) => (
            <div
              key={name}
              className="rounded-lg border border-border bg-card p-4 space-y-3 opacity-60"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground">{name}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
