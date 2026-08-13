import * as React from "react"

import { cn } from "@/lib/utils"

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  percent: number
  color?: string
}

// Auto-escalates color at >60%/>85% regardless of the requested `color`, so
// a resource never reads as "fine" once it's actually in a warning/critical range.
function Progress({ percent, color = "bg-primary", className, ...props }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, percent))
  const barColor = pct > 85 ? "bg-destructive" : pct > 60 ? "bg-amber-500" : color
  return (
    <div className={cn("h-1.5 bg-muted rounded-full overflow-hidden", className)} {...props}>
      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export { Progress }
