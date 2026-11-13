import { useQueryClient } from "@tanstack/react-query";
import {
  useSetSensorDeviceRole,
  getListSensorDevicesQueryKey,
  getGetBrewSensorTelemetryQueryKey,
  getGetBrewSessionQueryKey,
  type SensorDeviceWithStatus,
  type SensorAssignmentRole,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { connectionDotClass, formatSensorTemp } from "@/lib/sensorStatus";
import { getErrorMessage } from "@/lib/utils";

const ROLE_HINT: Record<SensorAssignmentRole, string> = {
  fermenter: "Fermentation chart, alerts and insights",
  reference: "Its own chart only (ice bath, room, chamber)",
};

/**
 * The sensors assigned to a brew, each with its role. A brew with more than one
 * sensor needs to know which is the beer: switching one to Reference gives it
 * its own chart and keeps it out of fermentation data and alerts.
 */
export function BrewSensorsCard({ brewSessionId, sensors, unit }: {
  brewSessionId: number;
  sensors: SensorDeviceWithStatus[];
  unit: "C" | "F";
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const setRole = useSetSensorDeviceRole({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSensorDevicesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetBrewSensorTelemetryQueryKey(brewSessionId) });
        qc.invalidateQueries({ queryKey: getGetBrewSessionQueryKey(brewSessionId) });
      },
      onError: (err) => toast({ title: "Couldn't change the sensor's role", description: getErrorMessage(err), variant: "destructive" }),
    },
  });

  const onBrew = sensors.filter((s) => s.assignedBrewSessionId === brewSessionId);
  // One fermenter sensor and nothing else is the common case; there's nothing to choose.
  if (onBrew.length < 2 && onBrew.every((s) => (s.assignedRole ?? "fermenter") === "fermenter")) return null;

  const change = (s: SensorDeviceWithStatus, role: SensorAssignmentRole) => {
    if (role === "reference" && !window.confirm(
      `Use ${s.device.deviceName} as a reference sensor?\n\nIts readings move out of this brew's fermentation chart and readings, and it stops counting for temperature alerts. They'll show on its own chart instead.`,
    )) return;
    setRole.mutate({ id: s.device.id, data: { role } });
  };

  return (
    <div className="bg-card border border-card-border rounded-lg p-4 space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Sensors on this brew</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Mark the sensor in the beer as Fermenter, and anything else, such as an ice bath, as Reference.</p>
      </div>
      <ul className="divide-y divide-border">
        {onBrew.map((s) => {
          const role = (s.assignedRole ?? "fermenter") as SensorAssignmentRole;
          const t = s.latestReading?.temperature;
          return (
            <li key={s.device.id} className="flex items-center gap-3 py-2 flex-wrap">
              <span className={`w-2 h-2 rounded-full shrink-0 ${connectionDotClass(s.connectionStatus)}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{s.device.deviceName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {s.device.deviceType === "shelly_probe" ? "Shelly probe" : "iSpindel"}
                  {t != null && ` · ${formatSensorTemp(t, s.latestReading!.temperatureUnit, unit)}`}
                  {` · ${ROLE_HINT[role]}`}
                </p>
              </div>
              <select
                aria-label={`Role of ${s.device.deviceName}`}
                className="text-xs bg-background border border-input rounded px-2 py-1.5 text-foreground"
                value={role}
                disabled={setRole.isPending}
                onChange={(e) => change(s, e.target.value as SensorAssignmentRole)}
              >
                <option value="fermenter">Fermenter</option>
                <option value="reference">Reference</option>
              </select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
