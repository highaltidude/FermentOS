import type { ReactNode } from "react";
import { AlertTriangle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ResourceEvaluation } from "@/lib/systemHealth";

export function ResourceStatusCard({
  icon,
  label,
  evaluation,
  children,
}: {
  icon: ReactNode;
  label: string;
  evaluation?: ResourceEvaluation;
  children: ReactNode;
}) {
  return (
    <div className="bg-background border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
          {icon}
          {label}
        </div>
        {evaluation && evaluation.status !== "ok" && (
          <Badge variant={evaluation.status === "critical" ? "destructive" : "warning"}>
            {evaluation.status === "critical" ? (
              <AlertCircle className="w-3 h-3" />
            ) : (
              <AlertTriangle className="w-3 h-3" />
            )}
            {evaluation.status === "critical" ? "Critical" : "Warning"}
          </Badge>
        )}
      </div>
      {children}
      {evaluation?.guidance && (
        <div className="text-xs text-muted-foreground pt-1 border-t border-border">{evaluation.guidance}</div>
      )}
    </div>
  );
}
