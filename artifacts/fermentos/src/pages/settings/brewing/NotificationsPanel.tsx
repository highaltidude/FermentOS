import { useState, useEffect } from "react";
import { Check, Bell } from "lucide-react";
import {
  useGetNotificationSettings,
  useSetNotificationSettings,
  useSendTestNotification,
  getGetNotificationSettingsQueryKey,
  type NotificationSettings,
  type NotificationChannel,
  type NotificationTestResult,
  type AlertType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const ALERT_TYPE_LABELS: { value: AlertType; label: string; desc: string }[] = [
  { value: "temp_out_of_range", label: "Temperature out of range", desc: "Reading outside the session's ferment temp range" },
  { value: "gravity_stalled", label: "Fermentation stalled", desc: "Gravity unchanged for 24+ hours" },
  { value: "device_offline", label: "Sensor offline", desc: "iSpindel has stopped reporting" },
  { value: "battery_low", label: "Sensor battery low", desc: "iSpindel battery under 20%" },
];

const REPEAT_OPTIONS = [1, 3, 6, 12, 24] as const;

// Unlike most neighbouring panels, which still call their endpoints with raw
// fetch (even where a generated hook now exists), this uses the generated hooks.
// The config is a multi-field object, so the typed client genuinely helps here.
export function NotificationsPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useGetNotificationSettings();
  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const saveMutation = useSetNotificationSettings({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetNotificationSettingsQueryKey() });
        toast({ title: "Notification settings saved" });
      },
      onError: (e: unknown) =>
        toast({ title: "Failed to save", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
    },
  });

  const testMutation = useSendTestNotification({
    mutation: {
      onSuccess: (result: NotificationTestResult) => {
        // 200 with ok:false is the normal "misconfigured" path, not an error.
        if (result.ok) toast({ title: "Test notification sent", description: "Check your device." });
        else toast({ title: "Test failed", description: result.error ?? "Unknown error", variant: "destructive" });
      },
      onError: (e: unknown) =>
        toast({ title: "Test failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
      onSettled: () => setTesting(false),
    },
  });

  if (isLoading || !draft) return <Skeleton className="h-40 rounded-md" />;

  const toggleType = (t: AlertType) =>
    setDraft({ ...draft, types: draft.types.includes(t) ? draft.types.filter((x) => x !== t) : [...draft.types, t] });

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Channel</label>
        <Select value={draft.channel} onValueChange={(v) => setDraft({ ...draft, channel: v as NotificationChannel })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Off</SelectItem>
            <SelectItem value="ntfy">ntfy</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {draft.channel === "ntfy" && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Server</label>
            <Input value={draft.ntfyServer} onChange={(e) => setDraft({ ...draft, ntfyServer: e.target.value })} placeholder="https://ntfy.sh" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Topic</label>
            <Input value={draft.ntfyTopic} onChange={(e) => setDraft({ ...draft, ntfyTopic: e.target.value })} placeholder="fermentos-a8f3k2" />
          </div>
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            Install the ntfy app and subscribe to this topic. Anyone who knows the topic name can read your alerts, so pick something unguessable.
          </p>
        </div>
      )}

      {draft.channel === "webhook" && (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Webhook URL</label>
          <Input value={draft.webhookUrl} onChange={(e) => setDraft({ ...draft, webhookUrl: e.target.value })} placeholder="https://..." />
          <p className="text-xs text-muted-foreground mt-1">Receives a JSON POST. Works with Discord and Slack incoming webhooks.</p>
        </div>
      )}

      {draft.channel !== "none" && (
        <>
          <div>
            <div className="text-xs text-muted-foreground mb-1.5">Notify me about</div>
            <div className="space-y-1.5">
              {ALERT_TYPE_LABELS.map((t) => {
                const on = draft.types.includes(t.value);
                return (
                  <div key={t.value}>
                  <button
                    type="button"
                    onClick={() => toggleType(t.value)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md border text-left transition-colors ${
                      on ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/50"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground">{t.label}</div>
                      <div className="text-xs text-muted-foreground">{t.desc}</div>
                    </div>
                    <div className={`h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center ${on ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
                      {on && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                  </button>
                  {t.value === "temp_out_of_range" && on && (
                    <div className="mt-1.5 ml-3 pl-3 border-l border-border max-w-xs">
                      <label className="text-xs text-muted-foreground mb-1 block">Re-notify about this every</label>
                      <Select
                        value={draft.tempRepeatHours == null ? "default" : String(draft.tempRepeatHours)}
                        onValueChange={(v) => setDraft({ ...draft, tempRepeatHours: v === "default" ? null : Number(v) })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Use default ({draft.repeatHours === 1 ? "1 hour" : `${draft.repeatHours} hours`})</SelectItem>
                          {REPEAT_OPTIONS.map((h) => (
                            <SelectItem key={h} value={String(h)}>{h === 1 ? "1 hour" : `${h} hours`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDraft({ ...draft, boilAlerts: draft.boilAlerts === false })}
            className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md border text-left transition-colors ${
              draft.boilAlerts !== false ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/50"
            }`}
          >
            <div>
              <div className="text-sm font-medium text-foreground">Boil additions</div>
              <div className="text-xs text-muted-foreground">Each hop addition and flameout while a boil timer runs — sent on time, not on the 5-minute check</div>
            </div>
            <div className={`h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center ${draft.boilAlerts !== false ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
              {draft.boilAlerts !== false && <Check className="w-3 h-3 text-primary-foreground" />}
            </div>
          </button>

          <div className="max-w-xs">
            <label className="text-xs text-muted-foreground mb-1 block">Re-notify at most every (default)</label>
            <Select value={String(draft.repeatHours)} onValueChange={(v) => setDraft({ ...draft, repeatHours: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPEAT_OPTIONS.map((h) => (
                  <SelectItem key={h} value={String(h)}>{h === 1 ? "1 hour" : `${h} hours`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={() => saveMutation.mutate({ data: draft })} disabled={saveMutation.isPending}>
          <Check className="w-3.5 h-3.5 mr-1" />Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={draft.channel === "none" || testing || saveMutation.isPending}
          onClick={() => { setTesting(true); testMutation.mutate(); }}
        >
          <Bell className="w-3.5 h-3.5 mr-1" />{testing ? "Sending…" : "Send test"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Save before testing — the test uses the saved settings. Checks run every 5 minutes; only brews with a live sensor are monitored, and packaged batches are never alerted on. Temperature alerts also wait for the number of consecutive out-of-range readings set by Temperature Alert Threshold above.
      </p>
    </div>
  );
}
