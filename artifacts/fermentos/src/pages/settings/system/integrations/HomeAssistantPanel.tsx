import { CheckCircle, Copy, Home } from "lucide-react";
import { useCopyToClipboard } from "../../useCopyToClipboard";
import { plainHttpOrigin } from "../../shared";

export function HomeAssistantPanel() {
  const { copiedKey, copy } = useCopyToClipboard();

  const endpointUrl = `${plainHttpOrigin()}/api/ha/status`;

  // /api/ha/status returns an array of your configured sensor devices, not a
  // single "current brew" object — replace iSpindel001 below with the
  // deviceName shown for your device in the iSpindel Integration panel.
  const restSensorYaml = `rest:
  - resource: ${endpointUrl}
    scan_interval: 60
    sensor:
      - name: "FermentOS iSpindel001 Gravity"
        unique_id: fermentos_ispindel001_gravity
        value_template: >-
          {% set d = value_json | selectattr('deviceName','eq','iSpindel001') | first %}
          {{ d.latestReading.gravity if d and d.latestReading else '' }}
        state_class: measurement
      - name: "FermentOS iSpindel001 Temperature"
        unique_id: fermentos_ispindel001_temperature
        value_template: >-
          {% set d = value_json | selectattr('deviceName','eq','iSpindel001') | first %}
          {{ d.latestReading.temperature if d and d.latestReading else '' }}
        state_class: measurement
      - name: "FermentOS iSpindel001 Connection"
        unique_id: fermentos_ispindel001_connection
        value_template: >-
          {% set d = value_json | selectattr('deviceName','eq','iSpindel001') | first %}
          {{ d.connectionStatus if d else 'unknown' }}
      - name: "FermentOS iSpindel001 Assigned Brew"
        unique_id: fermentos_ispindel001_brew
        value_template: >-
          {% set d = value_json | selectattr('deviceName','eq','iSpindel001') | first %}
          {{ d.assignedBrewName if d and d.assignedBrewName else 'Unassigned' }}
      - name: "FermentOS iSpindel001 Fermentation Status"
        unique_id: fermentos_ispindel001_fermentation_status
        value_template: >-
          {% set d = value_json | selectattr('deviceName','eq','iSpindel001') | first %}
          {{ d.insights.fermentationStatus if d and d.insights else 'unknown' }}`;

  const lovelaceCardYaml = `type: markdown
title: 🍺 FermentOS
content: >-
  {% if states('sensor.fermentos_ispindel001_connection') != 'unknown' %}
  ## {{ states('sensor.fermentos_ispindel001_assigned_brew') }}

  **Connection:** {{ states('sensor.fermentos_ispindel001_connection') | title }}

  **Fermentation:** {{ states('sensor.fermentos_ispindel001_fermentation_status') | replace('_', ' ') | title }}

  {% if states('sensor.fermentos_ispindel001_gravity') != '' %}
  **Gravity:** {{ states('sensor.fermentos_ispindel001_gravity') }}
  {% endif %}

  {% if states('sensor.fermentos_ispindel001_temperature') != '' %}
  **Temp:** {{ states('sensor.fermentos_ispindel001_temperature') }}
  {% endif %}
  {% else %}
  *iSpindel001 hasn't reported yet.*
  {% endif %}`;

  return (
    <div className="bg-card border border-card-border rounded-lg">
      <div className="px-4 py-3 border-b border-card-border flex items-center gap-2">
        <Home className="w-4 h-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Home Assistant</h2>
          <p className="text-xs text-muted-foreground mt-0.5">REST sensor endpoint for HA dashboards and automations.</p>
        </div>
      </div>
      <div className="p-4 space-y-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status Endpoint</p>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <code className="text-[11px] font-mono flex-1 truncate text-foreground">{endpointUrl}</code>
            <button
              onClick={() => copy("url", endpointUrl)}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              title="Copy URL"
            >
              {copiedKey === "url" ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Always accessible — no Bearer token needed even when API auth is enabled.
            Returns a JSON array of your configured sensor devices, each with its latest reading, connection status, assigned brew, and fermentation insights (<code className="font-mono">[]</code> if no devices are registered yet).
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">REST Sensor Config <span className="normal-case font-normal">(configuration.yaml)</span></p>
            <button
              onClick={() => copy("sensor", restSensorYaml)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {copiedKey === "sensor" ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              Copy
            </button>
          </div>
          <pre className="text-[10px] font-mono leading-relaxed bg-muted/40 rounded-md border border-border px-3 py-2.5 overflow-x-auto whitespace-pre text-foreground/80">{restSensorYaml}</pre>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lovelace Card</p>
            <button
              onClick={() => copy("card", lovelaceCardYaml)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {copiedKey === "card" ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              Copy
            </button>
          </div>
          <pre className="text-[10px] font-mono leading-relaxed bg-muted/40 rounded-md border border-border px-3 py-2.5 overflow-x-auto whitespace-pre text-foreground/80">{lovelaceCardYaml}</pre>
        </div>
      </div>
    </div>
  );
}
