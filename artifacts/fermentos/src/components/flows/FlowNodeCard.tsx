import { createContext, useContext } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  AlertTriangle, ArrowDownUp, Beer, Bell, CalendarClock, CalendarDays, Clock, Gauge, Hourglass, Power, Thermometer, type LucideIcon,
} from "lucide-react";
import type { FlowGraphNodeType, FlowNodeState, OutputDevice, SensorDeviceWithStatus } from "@workspace/api-client-react";
import { NODE_LABELS, describeNode, formatTemp, hasInput, hasOutput, nodeCategory, type NodeCategory, type TempUnit } from "@/lib/flows";
import { cn } from "@/lib/utils";

export type FlowNodeData = { config: Record<string, unknown> };
export type FlowCanvasNode = Node<FlowNodeData, FlowGraphNodeType>;

/** What every node on the canvas needs besides its own config. */
export type FlowCanvasInfo = {
  devices: OutputDevice[];
  sensors: SensorDeviceWithStatus[];
  unit: TempUnit;
  /** Live state per node; only set while the flow is on. */
  live: Record<string, FlowNodeState> | null;
  tempC: number | null;
  problems: Map<string, string[]>;
};

export const FlowCanvasContext = createContext<FlowCanvasInfo | null>(null);

export const NODE_ICONS: Record<FlowGraphNodeType, LucideIcon> = {
  "trigger.schedule": Clock,
  "trigger.temperature": Thermometer,
  "condition.compare": ArrowDownUp,
  "condition.timeWindow": CalendarClock,
  "condition.brewStatus": Beer,
  "condition.stageAge": CalendarDays,
  "control.thermostat": Gauge,
  "action.relay": Power,
  "action.notify": Bell,
  "action.delay": Hourglass,
};

export const CATEGORY_STYLES: Record<NodeCategory, { bar: string; icon: string }> = {
  trigger: { bar: "bg-sky-500", icon: "text-sky-600 dark:text-sky-400" },
  condition: { bar: "bg-amber-500", icon: "text-amber-600 dark:text-amber-400" },
  control: { bar: "bg-rose-500", icon: "text-rose-600 dark:text-rose-400" },
  action: { bar: "bg-emerald-500", icon: "text-emerald-600 dark:text-emerald-400" },
};

const handleClass = "!w-3 !h-3 !bg-card !border-2 !border-muted-foreground";

export function FlowNodeCard({ id, type, data, selected }: NodeProps<FlowCanvasNode>) {
  const info = useContext(FlowCanvasContext)!;
  const category = nodeCategory(type);
  const Icon = NODE_ICONS[type];
  const live = info.live?.[id];
  const problems = info.problems.get(id) ?? [];
  const node = { id, type, position: { x: 0, y: 0 }, data };

  let liveText: string | null = null;
  if (live?.active) {
    if (type === "trigger.temperature" && info.tempC != null) liveText = `Now ${formatTemp(info.tempC, info.unit)}`;
    else if (live.relayOn !== undefined) liveText = `Relay ${live.relayOn ? "on" : "off"}${live.reason ? ` · ${live.reason.replace(/_/g, " ")}` : ""}`;
    else if (live.reason) liveText = live.reason.replace(/_/g, " ");
  }

  return (
    <div
      className={cn(
        "relative w-60 rounded-lg border bg-card text-card-foreground shadow-sm",
        problems.length > 0 ? "border-destructive" : selected ? "border-primary" : "border-card-border",
        selected && "ring-2 ring-primary/30",
      )}
    >
      {hasInput(type) && <Handle type="target" position={Position.Top} className={handleClass} />}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-lg", CATEGORY_STYLES[category].bar)} />
      <div className="pl-3.5 pr-3 py-2">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("w-3.5 h-3.5 shrink-0", CATEGORY_STYLES[category].icon)} />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{NODE_LABELS[type]}</span>
          {info.live && (
            <span
              className={cn("ml-auto w-2 h-2 rounded-full", live?.active ? "bg-green-500" : "bg-muted-foreground/30")}
              title={live?.active ? "Reached on the last check" : "Not reached on the last check"}
            />
          )}
        </div>
        <p className="text-xs text-foreground mt-1 leading-snug">{describeNode(node, info)}</p>
        {liveText && <p className="text-[11px] text-green-700 dark:text-green-400 mt-1">{liveText}</p>}
        {problems.map((p, i) => (
          <p key={i} className="text-[11px] text-destructive mt-1 flex items-start gap-1">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />{p}
          </p>
        ))}
      </div>
      {hasOutput(type) && <Handle type="source" position={Position.Bottom} className={handleClass} />}
    </div>
  );
}

/** Every node type renders with the same card; xyflow looks components up by `type`. */
export const nodeTypes = Object.fromEntries(Object.keys(NODE_LABELS).map((t) => [t, FlowNodeCard]));
