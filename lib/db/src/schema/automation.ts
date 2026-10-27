import { pgTable, serial, text, integer, timestamp, jsonb, boolean, primaryKey } from "drizzle-orm/pg-core";
import { sensorDevicesTable } from "./sensors";
import { recipesTable } from "./recipes";

// Devices FermentOS switches (relays), as opposed to sensor_devices, which it
// only reads. The first driver is the Shelly Gen1 HTTP API (SHSW-1).
export const outputDeviceTypeEnum = ["shelly_gen1"] as const;

export type OutputDeviceState = {
  ison: boolean | null;
  tempC: number | null;
  rssi: number | null;
};

export const outputDevicesTable = pgTable("output_devices", {
  id: serial("id").primaryKey(),
  deviceType: text("device_type", { enum: outputDeviceTypeEnum }).notNull().default("shelly_gen1"),
  name: text("name").notNull(),
  // Hostname or IP on the LAN, without scheme (e.g. "192.168.1.40").
  host: text("host").notNull(),
  channel: integer("channel").notNull().default(0),
  // HTTP Basic credentials, only set when the device has restricted login on.
  // Stored in plaintext like the app's other secrets; never returned by the API.
  username: text("username"),
  password: text("password"),
  enabled: boolean("enabled").notNull().default(true),
  // The add-on DS18B20 probe, registered as a sensor device on first sight so
  // its readings flow through the normal sensor pipeline.
  probeSensorDeviceId: integer("probe_sensor_device_id").references(() => sensorDevicesTable.id, {
    onDelete: "set null",
  }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  lastState: jsonb("last_state").$type<OutputDeviceState>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OutputDevice = typeof outputDevicesTable.$inferSelect;

// ── Brew Flows ───────────────────────────────────────────────────────────────
// A flow is a trigger → condition → action graph. The graph is stored as one
// JSON document in the same node/edge shape the editor's canvas uses, so it
// round-trips without translation; the API server validates it.

export type FlowGraphNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { config: Record<string, unknown> };
};

export type FlowGraphEdge = { id: string; source: string; target: string };

export type FlowGraph = { version: 1; nodes: FlowGraphNode[]; edges: FlowGraphEdge[] };

export const flowsTable = pgTable("flows", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(false),
  graph: jsonb("graph").$type<FlowGraph>().notNull(),
  // Last runtime error, cleared on the next clean run. Shown on the flow list.
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Flow = typeof flowsTable.$inferSelect;

export const flowRunStatusEnum = ["ok", "skipped", "error", "failsafe"] as const;

// What a flow did: relay switches, notifications, fail-safe trips. Ticks that
// change nothing are not logged.
export const flowRunsTable = pgTable("flow_runs", {
  id: serial("id").primaryKey(),
  flowId: integer("flow_id")
    .notNull()
    .references(() => flowsTable.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  trigger: text("trigger").notNull(),
  status: text("status", { enum: flowRunStatusEnum }).notNull(),
  message: text("message").notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
});

export type FlowRun = typeof flowRunsTable.$inferSelect;

// Recipes a flow is linked to. A linked flow only acts while the brew on its
// temperature sensor was brewed from one of these recipes, and stands by (its
// relays off) otherwise. No rows = the flow runs for whatever brew is there.
export const flowRecipesTable = pgTable(
  "flow_recipes",
  {
    flowId: integer("flow_id")
      .notNull()
      .references(() => flowsTable.id, { onDelete: "cascade" }),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipesTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.flowId, t.recipeId] })],
);
