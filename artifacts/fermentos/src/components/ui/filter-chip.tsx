import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const filterChipVariants = cva(
  "text-xs px-3 py-1.5 rounded-full border transition-colors",
  {
    variants: {
      active: {
        true: "bg-primary text-primary-foreground border-primary",
        false: "border-border text-muted-foreground hover:border-primary hover:text-primary",
      },
    },
    defaultVariants: {
      active: false,
    },
  }
)

export interface FilterChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof filterChipVariants> {}

/** Pill toggle for list filters (All / status / type / category). */
function FilterChip({ className, active, type = "button", ...props }: FilterChipProps) {
  return <button type={type} className={cn(filterChipVariants({ active, className }))} {...props} />
}

export { FilterChip, filterChipVariants }
