import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Brew Flows switch real relays and are still new, so they say so wherever they appear. */
export function ExperimentalBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="warning"
      className={cn("shrink-0", className)}
      title="Brew Flows are new. Watch your first batches and check the relay is doing what you expect."
    >
      <FlaskConical className="w-3 h-3" />Experimental
    </Badge>
  );
}
