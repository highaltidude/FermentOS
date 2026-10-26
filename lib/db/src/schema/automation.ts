import { pgTable, serial, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { sensorDevicesTable } from "./sensors";

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
