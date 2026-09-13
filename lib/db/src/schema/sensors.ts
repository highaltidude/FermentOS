import { pgTable, serial, text, real, integer, timestamp, jsonb, boolean, unique } from "drizzle-orm/pg-core";
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

// Notification bookkeeping for the scheduled alert monitor. One row per
// (brew session, alert type). This has to survive restarts — without it an
// ongoing temperature excursion would re-notify on every tick forever.
//
//   firstSeenAt    when the condition was first observed, for diagnostics
//   lastNotifiedAt when we last actually sent something, so repeats respect
//                  the configured interval
//   resolvedAt     set when the condition clears, so a later recurrence is
//                  treated as new rather than suppressed
export const brewAlertStateTable = pgTable("brew_alert_state", {
  id: serial("id").primaryKey(),
  brewSessionId: integer("brew_session_id")
    .notNull()
    .references(() => brewSessionsTable.id, { onDelete: "cascade" }),
  alertType: text("alert_type").notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  // Consecutive monitor ticks the condition has been observed, reset on
  // resolve. Bookkeeping only — the temperature debounce counts readings, not
  // ticks (see consecutiveTempExcursions in services/alertMonitor.ts).
  seenCount: integer("seen_count").notNull().default(1),
}, (t) => [unique("brew_alert_state_session_type_uq").on(t.brewSessionId, t.alertType)]);

export type BrewAlertState = typeof brewAlertStateTable.$inferSelect;
