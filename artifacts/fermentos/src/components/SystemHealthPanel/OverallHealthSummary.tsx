import { CheckCircle, AlertTriangle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ResourceEvaluation, SystemHealthEvaluation } from "@/lib/systemHealth";

export function OverallHealthSummary({ evaluation }: { evaluation: SystemHealthEvaluation }) {
  if (evaluation.overall === "ok") {
    return (
      <Badge variant="success">
        <CheckCircle className="w-3 h-3" />
        All systems normal
      </Badge>
    );
  }

  const resources: Array<[string, ResourceEvaluation | null]> = [
    ["CPU", evaluation.cpu],
    ["memory", evaluation.memory],
    ["disk", evaluation.disk],
    ["temperature", evaluation.temperature],
  ];
  const degraded = resources.filter(([, r]) => r && r.status !== "ok").map(([name]) => name);
  const Icon = evaluation.overall === "critical" ? AlertCircle : AlertTriangle;

  return (
    <Badge variant={evaluation.overall === "critical" ? "destructive" : "warning"}>
      <Icon className="w-3 h-3" />
      {degraded.length > 0
        ? `${degraded.join(" & ")} need${degraded.length === 1 ? "s" : ""} attention`
        : "Needs attention"}
    </Badge>
  );
}
