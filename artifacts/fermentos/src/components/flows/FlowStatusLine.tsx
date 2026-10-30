import { CirclePause, ShieldAlert } from "lucide-react";
import type { FlowStatus } from "@workspace/api-client-react";
import { formatTemp, type TempUnit } from "@/lib/flows";
import { formatShortDateTime } from "@/pages/settings/system/integrations/ispindelFormat";

/** One line on what an enabled flow is doing right now, or null if there's nothing to say. */
export function FlowStatusLine({ status, unit }: { status: FlowStatus | undefined; unit: TempUnit }) {
  if (!status) return null;
  if (status.failsafe) {
    return (
      <span className="text-destructive flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5 shrink-0" />Relays off: {status.failsafe}</span>
    );
  }
  if (status.standby) return <span className="flex items-center gap-1"><CirclePause className="w-3.5 h-3.5 shrink-0" />{status.standby}</span>;
  if (status.waiting) return <span>Waiting for the first readings…</span>;
  if (status.kind === "temperature" && status.tempC != null) {
    const on = Object.values(status.nodes).some((n) => n.relayOn);
    return (
      <span>
        Now {formatTemp(status.tempC, unit)} · relay {on ? <span className="text-green-600 dark:text-green-400 font-medium">on</span> : "off"}
      </span>
    );
  }
  if (status.kind === "schedule" && status.nextRunAt) return <span>Next run {formatShortDateTime(status.nextRunAt)}</span>;
  return null;
}
