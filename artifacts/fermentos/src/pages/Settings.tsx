import { useState, useMemo } from "react";
import { useSearch } from "wouter";
import {
  Settings as SettingsIcon,
  RefreshCw,
  Clock,
  Database,
  Lock,
  Package,
  Beer,
  Server,
  Power,
  Activity,
  Webhook,
  Radio,
  Home,
  Droplets,
  Plug,
  Thermometer,
  Bell,
} from "lucide-react";
import { SystemHealthPanel } from "@/components/SystemHealthPanel";
import { BreweryNamePanel } from "./settings/brewing/BreweryNamePanel";
import { BeerStylesCard } from "./settings/brewing/BeerStylesCard";
import { UnitSystemPanel } from "./settings/brewing/UnitSystemPanel";
import { InventoryEnforcementPanel } from "./settings/brewing/InventoryEnforcementPanel";
import { DefaultReadingsShownPanel } from "./settings/brewing/DefaultReadingsShownPanel";
import { ReadingRetentionPanel } from "./settings/brewing/ReadingRetentionPanel";
import { FermentTempPanel } from "./settings/brewing/FermentTempPanel";
import { NotificationsPanel } from "./settings/brewing/NotificationsPanel";
import { SystemUpdatePanel } from "./settings/system/updates/SystemUpdatePanel";
import { ApiAccessPanel } from "./settings/system/ApiAccessPanel";
import { ISpindelPanel } from "./settings/system/integrations/ISpindelPanel";
import { HomeAssistantPanel } from "./settings/system/integrations/HomeAssistantPanel";
import { DatabaseBackupPanel } from "./settings/system/DatabaseBackupPanel";
import { RestartAppPanel } from "./settings/system/RestartAppPanel";
import { RebootPanel } from "./settings/system/RebootPanel";

type SettingsTab = "brewing" | "system";

export default function Settings() {
  const search = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);
  const [tab, setTab] = useState<SettingsTab>(() => (searchParams.get("tab") === "system" ? "system" : "brewing"));
  const [systemSection, setSystemSection] = useState<"health" | "updates" | "backups" | "connectivity" | "power">(
    () => {
      const section = searchParams.get("section");
      const valid = ["health", "updates", "backups", "connectivity", "power"];
      return valid.includes(section ?? "") ? (section as any) : "health";
    },
  );

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: "brewing", label: "Brewing", icon: <Beer className="w-3.5 h-3.5" /> },
    { id: "system", label: "System", icon: <Server className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <SettingsIcon className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "brewing" && (
        <div className="space-y-5">
          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <Home className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Brewery Name</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Displayed as the heading on your dashboard. Leave blank to use the default "Brewery Overview".
              </p>
            </div>
            <div className="p-4">
              <BreweryNamePanel />
            </div>
          </div>

          <BeerStylesCard />

          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <Beer className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Unit System</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose which units appear in the ingredients form. Affects new entries only — existing ingredient items keep their current units.
              </p>
            </div>
            <div className="p-4">
              <UnitSystemPanel />
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Ingredient Enforcement</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Optionally require ingredients to be on hand (and deduct them) when starting a brew session from a recipe.
              </p>
            </div>
            <div className="p-4">
              <InventoryEnforcementPanel />
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Fermentation Readings</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure display settings for fermentation readings on brew session pages.
              </p>
            </div>
            <div className="p-4">
              <DefaultReadingsShownPanel />
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Reading Retention</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically delete old fermentation and sensor readings from packaged sessions to keep your database small.
              </p>
            </div>
            <div className="p-4">
              <ReadingRetentionPanel />
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Fermentation Temperature</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Unit and alert sensitivity for fermentation temperature range monitoring.
              </p>
            </div>
            <div className="p-4">
              <FermentTempPanel />
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-lg">
            <div className="px-4 py-3 border-b border-card-border">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Get alerted when a brew needs attention, even with the app closed.
              </p>
            </div>
            <div className="p-4">
              <NotificationsPanel />
            </div>
          </div>
        </div>
      )}

      {tab === "system" && (
        <div className="space-y-4">
          {/* System sub-tabs */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit flex-wrap">
            {(
              [
                { id: "health",       label: "Health",       icon: <Activity className="w-3.5 h-3.5" /> },
                { id: "updates",      label: "Updates",      icon: <RefreshCw className="w-3.5 h-3.5" /> },
                { id: "connectivity", label: "Integrations", icon: <Plug className="w-3.5 h-3.5" /> },
                { id: "backups",      label: "Backups",      icon: <Database className="w-3.5 h-3.5" /> },
                { id: "power",        label: "Power",        icon: <Power className="w-3.5 h-3.5" /> },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                onClick={() => setSystemSection(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  systemSection === s.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </div>

          {/* Health */}
          {systemSection === "health" && (
            <div className="bg-card border border-card-border rounded-lg">
              <div className="px-4 py-3 border-b border-card-border flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">System Health</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Live CPU, memory, disk, and network. Auto-refreshes every 5 s.</p>
                </div>
              </div>
              <div className="p-4">
                <SystemHealthPanel onGoToBackups={() => setSystemSection("backups")} />
              </div>
            </div>
          )}

          {/* Updates — version, update actions, release notes, rollback/history only */}
          {systemSection === "updates" && (
            <div className="bg-card border border-card-border rounded-lg">
              <div className="px-4 py-3 border-b border-card-border flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-muted-foreground" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">App Updates</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Current version, update check, release notes, rollback, and deployment history.</p>
                </div>
              </div>
              <div className="p-4">
                <SystemUpdatePanel />
              </div>
            </div>
          )}

          {/* Connectivity — API tokens, webhooks, MQTT, device integrations */}
          {systemSection === "connectivity" && (
            <div className="space-y-4">
              {/* API Access — functional today */}
              <div className="bg-card border border-card-border rounded-lg">
                <div className="px-4 py-3 border-b border-card-border flex items-center gap-2">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">API Access</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Manage bearer tokens for external clients — scripts, Home Assistant, mobile apps. Browser sessions from this UI are always allowed.</p>
                  </div>
                </div>
                <div className="p-4">
                  <ApiAccessPanel />
                </div>
              </div>

              {/* Webhooks — partially delivered: alert delivery ships in
                  Brewing → Notifications; generic brew-event callbacks do not
                  exist yet, so this stays a placeholder for that half only. */}
              <div className="bg-card border border-card-border rounded-lg opacity-60 pointer-events-none select-none">
                <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Webhook className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Webhooks</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Push brew events to any HTTP endpoint.</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground border border-border rounded px-1.5 py-0.5">Planned</span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">Fire HTTP callbacks when a stage changes or a session completes. Integrate with n8n, Make, Zapier, or your own automation scripts.</p>
                  <p className="text-xs text-muted-foreground mt-2">Alert notifications already deliver over webhooks today — configure them under Brewing → Notifications.</p>
                </div>
              </div>

              {/* MQTT — placeholder */}
              <div className="bg-card border border-card-border rounded-lg opacity-60 pointer-events-none select-none">
                <div className="px-4 py-3 border-b border-card-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">MQTT</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Publish sensor readings and events to a broker.</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground border border-border rounded px-1.5 py-0.5">Planned</span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">Connect to Mosquitto or any MQTT broker. Pair with Home Assistant MQTT discovery or Node-RED for real-time dashboard tiles and automations.</p>
                </div>
              </div>

              {/* iSpindel — functional panel */}
              <ISpindelPanel />

              {/* Home Assistant — REST sensor */}
              <HomeAssistantPanel />
            </div>
          )}

          {/* Backups */}
          {systemSection === "backups" && (
            <div className="bg-card border border-card-border rounded-lg">
              <div className="px-4 py-3 border-b border-card-border flex items-center gap-2">
                <Database className="w-4 h-4 text-muted-foreground" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Backups</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Manual exports, scheduled SFTP push, local save, retention, and restore. SFTP configuration is in "Configure Backup Destinations" below.</p>
                </div>
              </div>
              <div className="p-4">
                <DatabaseBackupPanel />
              </div>
            </div>
          )}

          {/* Power */}
          {systemSection === "power" && (
            <div className="space-y-4">
              <div className="bg-card border border-card-border rounded-lg border-amber-500/20">
                <div className="px-4 py-3 border-b border-card-border flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Restart App</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Restart only the fermentos service. No host reboot — app is back in ~15 seconds.</p>
                  </div>
                </div>
                <div className="p-4">
                  <RestartAppPanel />
                </div>
              </div>

              <div className="bg-card border border-card-border rounded-lg border-destructive/20">
                <div className="px-4 py-3 border-b border-card-border flex items-center gap-2">
                  <Power className="w-4 h-4 text-destructive" />
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Reboot Host</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Full host reboot. App will be offline for ~30–90 seconds. Use Restart App instead for most situations.</p>
                  </div>
                </div>
                <div className="p-4">
                  <RebootPanel />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
