import { db, appConfigTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

/**
 * Outbound notification delivery.
 *
 * Deliberately outbound-only: FermentOS is the HTTP *client* here, so this
 * works on a plain-HTTP LAN deployment with no certificates, no reverse
 * proxy, and no VPN client on the user's phone. That is what makes this a
 * viable alerting path where web push is not (see issues #144/#146).
 *
 * Node 20 has global fetch, so neither channel needs a dependency.
 */

export const NOTIFY_KEYS = {
  channel: "notify_channel",
  ntfyServer: "notify_ntfy_server",
  ntfyTopic: "notify_ntfy_topic",
  webhookUrl: "notify_webhook_url",
  types: "notify_types",
  repeatHours: "notify_repeat_hours",
} as const;

export const ALERT_TYPES = ["temp_out_of_range", "gravity_stalled", "device_offline", "battery_low"] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const DEFAULT_NOTIFY_TYPES: AlertType[] = [...ALERT_TYPES];
export const DEFAULT_REPEAT_HOURS = 6;
export const DEFAULT_NTFY_SERVER = "https://ntfy.sh";

export type NotifyChannel = "none" | "ntfy" | "webhook";

export type NotifyConfig = {
  channel: NotifyChannel;
  ntfyServer: string;
  ntfyTopic: string;
  webhookUrl: string;
  types: AlertType[];
  repeatHours: number;
};

export async function getNotifyConfig(): Promise<NotifyConfig> {
  const rows = await db
    .select()
    .from(appConfigTable)
    .where(inArray(appConfigTable.key, Object.values(NOTIFY_KEYS) as string[]));
  const map = new Map(rows.map((r) => [r.key, r.value ?? ""]));

  const rawChannel = map.get(NOTIFY_KEYS.channel) ?? "none";
  const channel: NotifyChannel =
    rawChannel === "ntfy" || rawChannel === "webhook" ? rawChannel : "none";

  const rawTypes = map.get(NOTIFY_KEYS.types);
  const types = rawTypes
    ? (rawTypes.split(",").map((t) => t.trim()).filter((t): t is AlertType =>
        (ALERT_TYPES as readonly string[]).includes(t)))
    : DEFAULT_NOTIFY_TYPES;

  const rawRepeat = parseInt(map.get(NOTIFY_KEYS.repeatHours) ?? "", 10);
  const repeatHours = Number.isFinite(rawRepeat) && rawRepeat >= 1 && rawRepeat <= 168
    ? rawRepeat
    : DEFAULT_REPEAT_HOURS;

  return {
    channel,
    ntfyServer: map.get(NOTIFY_KEYS.ntfyServer) || DEFAULT_NTFY_SERVER,
    ntfyTopic: map.get(NOTIFY_KEYS.ntfyTopic) ?? "",
    webhookUrl: map.get(NOTIFY_KEYS.webhookUrl) ?? "",
    types,
    repeatHours,
  };
}

export async function setNotifyConfig(cfg: NotifyConfig): Promise<void> {
  const pairs: [string, string][] = [
    [NOTIFY_KEYS.channel, cfg.channel],
    [NOTIFY_KEYS.ntfyServer, cfg.ntfyServer],
    [NOTIFY_KEYS.ntfyTopic, cfg.ntfyTopic],
    [NOTIFY_KEYS.webhookUrl, cfg.webhookUrl],
    [NOTIFY_KEYS.types, cfg.types.join(",")],
    [NOTIFY_KEYS.repeatHours, String(cfg.repeatHours)],
  ];
  for (const [key, value] of pairs) {
    await db
      .insert(appConfigTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: appConfigTable.key, set: { value, updatedAt: new Date() } });
  }
}

export type NotificationPayload = {
  title: string;
  body: string;
  priority?: "default" | "high";
  /** Structured context, sent only to the webhook channel. */
  meta?: Record<string, unknown>;
};

export type SendResult = { ok: boolean; error?: string };

// A hung endpoint must not wedge the monitor tick, so every request is capped.
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * ntfy carries the title in an HTTP header. Header values are latin-1, so a
 * recipe called "Märzen" or "Bière de Garde" is sent as raw UTF-8 bytes and
 * read back as latin-1 — it does not fail, it just arrives mojibake'd
 * ("Märzen"). RFC 2047 encoding, which ntfy decodes, keeps it intact.
 */
function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/**
 * Dispatch one notification on the configured channel. Never throws — the
 * caller is a cron tick that must keep processing other brews even when the
 * user's webhook is misconfigured or their ntfy server is down.
 */
export async function sendNotification(
  payload: NotificationPayload,
  cfg?: NotifyConfig,
): Promise<SendResult> {
  const config = cfg ?? (await getNotifyConfig());

  try {
    if (config.channel === "none") {
      return { ok: false, error: "No notification channel configured" };
    }

    if (config.channel === "ntfy") {
      if (!config.ntfyTopic) return { ok: false, error: "ntfy topic is not set" };
      const base = config.ntfyServer.replace(/\/+$/, "");
      const res = await fetch(`${base}/${encodeURIComponent(config.ntfyTopic)}`, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          Title: encodeHeaderValue(payload.title),
          Priority: payload.priority === "high" ? "high" : "default",
          Tags: "beer",
        },
        body: payload.body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return { ok: false, error: `ntfy responded ${res.status}` };
      return { ok: true };
    }

    if (!config.webhookUrl) return { ok: false, error: "Webhook URL is not set" };
    const res = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "fermentos",
        title: payload.title,
        message: payload.body,
        priority: payload.priority ?? "default",
        triggeredAt: new Date().toISOString(),
        ...payload.meta,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `Webhook responded ${res.status}` };
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ err, channel: config.channel }, "Notification delivery failed");
    return { ok: false, error };
  }
}
