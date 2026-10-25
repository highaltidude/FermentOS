import { describe, it, expect, vi, beforeEach } from "vitest";

// recordFiringAlert's own job is the write, the send and the rollback around
// decideFiringAlert. `@workspace/db` throws at load without DATABASE_URL, so it
// is replaced by a fake that records each write.
const writes = vi.hoisted(() => [] as { op: "upsert" | "update"; values: Record<string, unknown> }[]);

vi.mock("@workspace/db", () => ({
  brewAlertStateTable: { brewSessionId: "brew_session_id", alertType: "alert_type", id: "id" },
  db: {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async () => { writes.push({ op: "upsert", values }); },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => { writes.push({ op: "update", values }); },
      }),
    }),
  },
}));
vi.mock("drizzle-orm", () => ({ and: (...c: unknown[]) => c, eq: (a: unknown, b: unknown) => [a, b] }));
vi.mock("./src/services/notifications.js", () => ({ sendNotification: vi.fn() }));

const { recordFiringAlert } = await import("./src/services/alertState.js");
const { sendNotification } = await import("./src/services/notifications.js");
const send = vi.mocked(sendNotification);

const now = new Date("2026-10-01T12:00:00Z");
const alert = (over: Partial<Parameters<typeof recordFiringAlert>[0]> = {}) => ({
  brewSessionId: 7,
  alertType: "temp_out_of_range",
  prior: undefined,
  now,
  repeatMs: 6 * 60 * 60 * 1000,
  oncePerBrew: false,
  debounced: true,
  payload: { title: "IPA: Temperature out of range", body: "Temperature 70.0°F is above max 66°F" },
  config: {} as never,
  ...over,
});

beforeEach(() => {
  writes.length = 0;
  send.mockReset();
});

describe("recordFiringAlert", () => {
  it("stores the send time, then rolls it back when the send fails", async () => {
    send.mockResolvedValue({ ok: false, error: "ntfy unreachable" } as never);
    await recordFiringAlert(alert());

    expect(send).toHaveBeenCalledOnce();
    expect(writes).toEqual([
      { op: "upsert", values: expect.objectContaining({ lastNotifiedAt: now, seenCount: 1 }) },
      { op: "update", values: { lastNotifiedAt: null } },
    ]);
  });

  it("keeps the send time when the send succeeds", async () => {
    send.mockResolvedValue({ ok: true } as never);
    await recordFiringAlert(alert());

    expect(writes).toEqual([{ op: "upsert", values: expect.objectContaining({ lastNotifiedAt: now }) }]);
  });

  it("records without sending while the condition is unconfirmed", async () => {
    await recordFiringAlert(alert({ debounced: false }));

    expect(send).not.toHaveBeenCalled();
    expect(writes).toEqual([{ op: "upsert", values: expect.objectContaining({ lastNotifiedAt: null, seenCount: 1 }) }]);
  });
});
