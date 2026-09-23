import { Badge } from "@/components/ui/badge";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/brewStatus";
import { cn } from "@/lib/utils";

export function BrewStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant={null} className={cn(STATUS_COLORS[status], className)}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
