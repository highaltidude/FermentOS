import { Calculator, Droplets, Scale, DollarSign, FlaskConical } from "lucide-react";

const calculators = [
  {
    icon: Droplets,
    name: "Water Chemistry",
    description: "Calculate salt additions to match your target water profile for any beer style",
  },
  {
    icon: FlaskConical,
    name: "Gravity & ABV",
    description: "Calculate ABV from original and final gravity, with attenuation and calories",
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

export default function Calculators() {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Calculator className="w-6 h-6 text-foreground" />
          <h1 className="text-2xl font-bold text-foreground">Calculators</h1>
        </div>
        <p className="text-sm text-muted-foreground">Brewing tools to help you perfect every batch</p>
      </div>

      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
        Coming Soon
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {calculators.map(({ icon: Icon, name, description }) => (
          <div
            key={name}
            className="rounded-lg border border-border bg-card p-4 space-y-3 opacity-60"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium text-foreground">{name}</span>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border shrink-0">
                Coming soon
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
