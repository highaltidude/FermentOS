import { useState } from "react";
import { Link } from "wouter";
import { Plus, Unlink, Workflow } from "lucide-react";
import {
  useListFlows,
  getListFlowsQueryKey,
  useUpdateFlow,
  useEnableFlow,
  useDisableFlow,
  useGetFlowStatus,
  getGetFlowStatusQueryKey,
  getListOutputDevicesQueryKey,
  useListOutputDevices,
  type Flow,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useFermentTempUnit } from "@/hooks/useFermentTempUnit";
import { apiError, NewFlowDialog } from "@/pages/Flows";
import { FlowStatusLine } from "./FlowStatusLine";

/**
 * Flows linked to a recipe. A linked flow only acts while a brew of this recipe
 * is on its sensor, so one flow (say, "Fermenter 1 fridge") can be linked to
 * several recipes and pick up each batch as it's assigned.
 */
export function RecipeFlowsCard({ recipeId, recipeName, hasFermentTemp }: { recipeId: number; recipeName: string; hasFermentTemp: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [pick, setPick] = useState("");
  const { data: flows = [] } = useListFlows({ query: { queryKey: getListFlowsQueryKey() } });
  const { data: devices = [] } = useListOutputDevices({ query: { queryKey: getListOutputDevicesQueryKey() } });

  const linked = flows.filter((f) => f.recipeIds.includes(recipeId));
  // Only temperature flows have a brew to match; a flow still being built (no kind yet) can be linked and finished later.
  const linkable = flows.filter((f) => !f.recipeIds.includes(recipeId) && f.kind !== "schedule");

  const update = useUpdateFlow({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListFlowsQueryKey() }),
      onError: (err) => toast({ title: "Couldn't update the flow", description: apiError(err), variant: "destructive" }),
    },
  });
  const setLinks = (flow: Flow, recipeIds: number[]) => update.mutate({ id: flow.id, data: { recipeIds } });

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 border-b border-card-border flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Brew Flows</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Automations that run while a batch of this recipe is on their sensor</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowNew(true)} disabled={devices.length === 0}>
          <Plus className="w-3.5 h-3.5 mr-1" />New
        </Button>
      </div>
      <div className="p-4 space-y-3">
        {devices.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Flows switch Shelly relays. Add one under{" "}
            <Link href="/settings?tab=system&section=connectivity" className="text-primary underline underline-offset-2">Settings → System → Integrations</Link> first.
          </p>
        )}
        {linked.length === 0 ? (
          devices.length > 0 && (
            <p className="text-sm text-muted-foreground">
              No flows linked. Create one to hold this recipe's fermentation temperature, or link one you already have.
            </p>
          )
        ) : (
          <ul className="divide-y divide-border">
            {linked.map((f) => (
              <LinkedFlow key={f.id} flow={f} onUnlink={() => setLinks(f, f.recipeIds.filter((id) => id !== recipeId))} />
            ))}
          </ul>
        )}

        {linkable.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              className="flex-1 text-sm bg-background border border-border rounded-md px-2 h-8 text-foreground"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              aria-label="Flow to link"
            >
              <option value="">Link an existing flow…</option>
              {linkable.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={!pick || update.isPending}
              onClick={() => {
                const flow = flows.find((f) => f.id === Number(pick));
                if (flow) setLinks(flow, [...flow.recipeIds, recipeId]);
                setPick("");
              }}
            >
              Link
            </Button>
          </div>
        )}

        {!hasFermentTemp && (
          <p className="text-[11px] text-muted-foreground">
            Flows that follow the brew's temperatures need an ideal fermentation temperature — set one with Edit above.
          </p>
        )}
      </div>

      {showNew && <NewFlowDialog open onClose={() => setShowNew(false)} recipe={{ id: recipeId, name: recipeName }} />}
    </div>
  );
}

function LinkedFlow({ flow, onUnlink }: { flow: Flow; onUnlink: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const unit = useFermentTempUnit();
  const { data: status } = useGetFlowStatus(flow.id, {
    query: { enabled: flow.enabled, refetchInterval: 10_000, queryKey: getGetFlowStatusQueryKey(flow.id) },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListFlowsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFlowStatusQueryKey(flow.id) });
    qc.invalidateQueries({ queryKey: getListOutputDevicesQueryKey() });
  };
  const onError = (title: string) => (err: unknown) => toast({ title, description: apiError(err), variant: "destructive" });
  const enable = useEnableFlow({ mutation: { onSuccess: refresh, onError: onError("Couldn't turn the flow on") } });
  const disable = useDisableFlow({ mutation: { onSuccess: refresh, onError: onError("Couldn't turn the flow off") } });

  return (
    <li className="py-2 first:pt-0 last:pb-0 flex items-start gap-3">
      <Workflow className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <Link href={`/flows/${flow.id}`} className="text-sm font-medium text-foreground hover:underline">{flow.name}</Link>
        <div className="text-xs text-muted-foreground mt-0.5">
          {flow.enabled ? <FlowStatusLine status={status} unit={unit} /> : flow.problems.length > 0 ? "Needs attention before it can run" : "Off"}
        </div>
      </div>
      <Switch
        checked={flow.enabled}
        disabled={enable.isPending || disable.isPending}
        title={flow.enabled ? "Turn off" : "Turn on"}
        onChange={() => (flow.enabled ? disable.mutate({ id: flow.id }) : enable.mutate({ id: flow.id }))}
      />
      <button type="button" onClick={onUnlink} className="text-muted-foreground hover:text-destructive mt-0.5" title="Unlink from this recipe">
        <Unlink className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}
