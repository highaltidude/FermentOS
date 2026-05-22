import { pgTable, serial, text, real, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { brewSessionsTable } from "./brew_sessions";

// Generic sensor device registry — supports iSpindel, Tilt, RAPT Pill, etc.
export const sensorDevicesTable = pgTable("sensor_devices", {
  id: serial("id").primaryKey(),
  deviceType: text("device_type").notNull().default("ispindel"),
  deviceName: text("device_name").notNull(),
  // External identifier used to match inbound payloads to a device record.
  // For iSpindel this is the "name" field from the payload.
  deviceKey: text("device_key").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  notes: text("notes"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SensorDevice = typeof sensorDevicesTable.$inferSelect;

// Time-series telemetry from any sensor device.
export const sensorReadingsTable = pgTable("sensor_readings", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id")
    .notNull()
    .references(() => sensorDevicesTable.id, { onDelete: "cascade" }),
  brewSessionId: integer("brew_session_id").references(() => brewSessionsTable.id, {
    onDelete: "set null",
  }),
  gravity: real("gravity"),
  temperature: real("temperature"),
  temperatureUnit: text("temperature_unit").default("C"),
  angle: real("angle"),
  battery: real("battery"),
  batteryPercentEstimate: real("battery_percent_estimate"),
  rssi: integer("rssi"),
  reportedInterval: integer("reported_interval"),
  rawPayload: jsonb("raw_payload"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SensorReading = typeof sensorReadingsTable.$inferSelect;

// Tracks which device is currently assigned to which brew session.
// unassignedAt is null for the currently active assignment.
export const sensorDeviceBrewAssignmentsTable = pgTable("sensor_device_brew_assignments", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id")
    .notNull()
    .references(() => sensorDevicesTable.id, { onDelete: "cascade" }),
  brewSessionId: integer("brew_session_id")
    .notNull()
    .references(() => brewSessionsTable.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  unassignedAt: timestamp("unassigned_at", { withTimezone: true }),
});

export type SensorDeviceBrewAssignment = typeof sensorDeviceBrewAssignmentsTable.$inferSelect;
