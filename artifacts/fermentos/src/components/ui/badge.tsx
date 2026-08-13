import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border",
  {
    variants: {
      variant: {
        success: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
        warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
        destructive: "bg-destructive/15 text-destructive border-destructive/30",
        muted: "bg-muted text-muted-foreground border-border",
      },
    },
    defaultVariants: {
      variant: "muted",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />
}

export { Badge, badgeVariants }
