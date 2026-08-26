import * as React from "react"
import { Star } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Tasting-scorecard inputs. Built from plain buttons rather than a slider or
 * radio group because neither @radix-ui/react-slider nor react-radio-group is
 * a dependency of this app.
 */

interface StarScoreProps {
  /** 1-5, or null when unscored. */
  value: number | null
  onChange: (value: number | null) => void
  label: string
  hint?: string
  disabled?: boolean
}

/** The 1-5 sensory sub-score. Clicking the current value clears it. */
export function StarScore({ value, onChange, label, hint, disabled }: StarScoreProps) {
  const current = value ?? 0
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <label className="text-xs font-medium text-foreground">{label}</label>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      <div className="flex items-center gap-1 h-9">
        {Array.from({ length: 5 }).map((_, i) => {
          const val = i + 1
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              aria-label={`${label}: ${val} of 5`}
              aria-pressed={val === current}
              onClick={() => onChange(current === val ? null : val)}
              className="p-0.5 transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-50"
            >
              <Star
                className={cn(
                  "w-5 h-5",
                  val <= current
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/30 hover:text-amber-300",
                )}
              />
            </button>
          )
        })}
        {value != null && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="text-xs text-muted-foreground ml-1 hover:text-destructive"
          >
            clear
          </button>
        )}
      </div>
    </div>
  )
}

interface ScoreScaleProps {
  /** 1-10, or null when unscored. */
  value: number | null
  onChange: (value: number | null) => void
  label: string
  hint?: string
  disabled?: boolean
}

/** The 1-10 overall score. Clicking the current value clears it. */
export function ScoreScale({ value, onChange, label, hint, disabled }: ScoreScaleProps) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <label className="text-xs font-medium text-foreground">{label}</label>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1 mt-1">
        {Array.from({ length: 10 }).map((_, i) => {
          const val = i + 1
          const selected = value === val
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              aria-label={`Overall: ${val} of 10`}
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : val)}
              className={cn(
                "w-8 h-8 rounded-md border text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
              )}
            >
              {val}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const scoreBadgeVariants = cva(
  "inline-flex items-center gap-1 font-semibold rounded-full border tabular-nums",
  {
    variants: {
      size: {
        sm: "text-xs px-2 py-0.5",
        lg: "text-sm px-2.5 py-1",
      },
      tone: {
        high: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
        mid: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
        low: "bg-muted text-muted-foreground border-border",
      },
    },
    defaultVariants: { size: "sm", tone: "mid" },
  },
)

interface ScoreBadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children">,
    Omit<VariantProps<typeof scoreBadgeVariants>, "tone"> {
  /** 1-10. Renders nothing when null, so callers can drop it in unguarded. */
  value: number | null | undefined
  /** Appended after the score, e.g. "3 rated". */
  suffix?: string
}

/** Read-only 1-10 score, used on the list, recipe and dashboard surfaces. */
export function ScoreBadge({ value, suffix, size, className, ...props }: ScoreBadgeProps) {
  if (value == null) return null
  const tone = value >= 8 ? "high" : value >= 5 ? "mid" : "low"
  // Whole numbers render as "8", averages as "7.4".
  const display = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return (
    <span className={cn(scoreBadgeVariants({ size, tone, className }))} {...props}>
      <Star className="w-3 h-3 fill-current" />
      {display}
      <span className="font-normal opacity-70">/10</span>
      {suffix && <span className="font-normal opacity-70">· {suffix}</span>}
    </span>
  )
}

interface ScoreReadoutProps {
  label: string
  value: number | null | undefined
  outOf: number
}

/** Read-only "4 / 5" cell for one scorecard dimension. */
export function ScoreReadout({ label, value, outOf }: ScoreReadoutProps) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium tabular-nums">
        {value == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            {value}
            <span className="text-muted-foreground font-normal"> / {outOf}</span>
          </>
        )}
      </div>
    </div>
  )
}

export const OFF_FLAVOR_LABELS: Record<string, string> = {
  diacetyl: "Diacetyl (buttery)",
  acetaldehyde: "Acetaldehyde (green apple)",
  dms: "DMS (cooked corn)",
  phenolic: "Phenolic (clove, band-aid)",
  oxidized: "Oxidized (cardboard, sherry)",
  astringent: "Astringent (drying, tannic)",
  sour: "Sour / tart",
  solvent: "Solvent / fusel (hot)",
  sulfur: "Sulfur (struck match)",
  light_struck: "Light-struck (skunky)",
}

export const BREW_AGAIN_LABELS: Record<string, string> = {
  as_is: "Yes — as-is",
  with_tweaks: "Yes — with tweaks",
  no: "No",
}

interface OffFlavorTagsProps {
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}

/** Multi-select off-flavor tags. "None" is the empty selection, not a tag. */
export function OffFlavorTags({ value, onChange, disabled }: OffFlavorTagsProps) {
  const toggle = (tag: string) =>
    onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag])

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <label className="text-xs font-medium text-foreground">Off-flavors</label>
        <span className="text-[10px] text-muted-foreground">
          {value.length === 0 ? "none detected" : `${value.length} selected`}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {Object.entries(OFF_FLAVOR_LABELS).map(([tag, label]) => {
          const selected = value.includes(tag)
          return (
            <button
              key={tag}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => toggle(tag)}
              className={cn(
                "text-xs px-2 py-0.5 rounded-full border transition-colors disabled:pointer-events-none disabled:opacity-50",
                selected
                  ? "bg-destructive/15 text-destructive border-destructive/30"
                  : "bg-muted text-muted-foreground border-border hover:border-destructive/40",
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
