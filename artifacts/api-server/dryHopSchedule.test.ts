import { describe, it, expect } from "vitest";
import {
  DAY_MS,
  dryHopSchedule,
  dueDryHopGroups,
  dryHopAlertMessage,
  dryHopAlertType,
  isDryHopAlertType,
  type DryHopIngredient,
  type DryHopState,
} from "./src/lib/dryHopSchedule.js";

const T0 = Date.parse("2026-10-01T18:00:00Z");
const hours = (n: number) => n * 60 * 60 * 1000;

const hop = (id: number, dryHopDay: number | null, use: string | null = "dry_hop"): DryHopIngredient => ({
  id, name: `Hop ${id}`, amount: 1, unit: "oz", use, dryHopDay,
});

const conditioning = (over: Partial<DryHopState> = {}): DryHopState => ({
  conditioningStartedAt: new Date(T0),
  inConditioning: true,
  addedIds: null,
  ...over,
});

describe("dry hop schedule", () => {
  it("lists only dry hops that have a day, sorted by day", () => {
    const items = dryHopSchedule(
      [hop(1, 5), hop(2, null), hop(3, 0), hop(4, 3, "boil"), hop(5, 2, null)],
      conditioning(),
      T0,
    );
    expect(items.map((i) => [i.ingredientId, i.day])).toEqual([[3, 0], [1, 5]]);
  });

  it("has no due dates before the batch has entered conditioning", () => {
    const [item] = dryHopSchedule([hop(1, 0)], conditioning({ conditioningStartedAt: null, inConditioning: false }), T0);
    expect(item).toMatchObject({ dueAt: null, status: "scheduled" });
  });

  it("makes day 0 due as soon as conditioning starts", () => {
    const [item] = dryHopSchedule([hop(1, 0)], conditioning(), T0);
    expect(item).toMatchObject({ status: "due", dueAt: new Date(T0) });
  });

  it("makes day 3 due 72 hours into conditioning, not before", () => {
    const due = (now: number) => dryHopSchedule([hop(1, 3)], conditioning(), now)[0]!.status;
    expect(due(T0 + 3 * DAY_MS - 1)).toBe("scheduled");
    expect(due(T0 + 3 * DAY_MS)).toBe("due");
    expect(due(T0 + 3 * DAY_MS + hours(30))).toBe("due");
  });

  it("stays added once marked, whatever the date", () => {
    const [item] = dryHopSchedule([hop(1, 0)], conditioning({ addedIds: [1] }), T0 + hours(12));
    expect(item!.status).toBe("added");
  });

  it("is never due outside conditioning", () => {
    const [item] = dryHopSchedule([hop(1, 0)], conditioning({ inConditioning: false }), T0 + 10 * DAY_MS);
    expect(item!.status).toBe("scheduled");
    expect(item!.dueAt).toEqual(new Date(T0));
  });

  it("clamps a negative day to day 0", () => {
    const [item] = dryHopSchedule([hop(1, -2)], conditioning(), T0);
    expect(item).toMatchObject({ day: 0, status: "due" });
  });
});

describe("dry hop alert groups", () => {
  it("groups due additions by day, skipping added and not-yet-due ones", () => {
    const items = dryHopSchedule(
      [hop(1, 0), hop(2, 0), hop(3, 2), hop(4, 2), hop(5, 9)],
      conditioning({ addedIds: [4] }),
      T0 + 2 * DAY_MS,
    );
    const groups = dueDryHopGroups(items);
    expect(groups.map((g) => [g.alertType, g.additions.map((a) => a.ingredientId)])).toEqual([
      ["dry_hop_day_0", [1, 2]],
      ["dry_hop_day_2", [3]],
    ]);
  });

  it("has nothing to send once every addition is added", () => {
    const items = dryHopSchedule([hop(1, 0), hop(2, 0)], conditioning({ addedIds: [1, 2] }), T0 + DAY_MS);
    expect(dueDryHopGroups(items)).toEqual([]);
  });

  it("names the day and every addition in the message", () => {
    const [group] = dueDryHopGroups(dryHopSchedule([hop(1, 3), hop(2, 3)], conditioning(), T0 + 3 * DAY_MS));
    expect(dryHopAlertMessage(group!)).toContain("Day 3 of conditioning — add 1 oz Hop 1, 1 oz Hop 2");
  });

  it("recognises its own alert types and no others", () => {
    expect(isDryHopAlertType(dryHopAlertType(4))).toBe(true);
    expect(isDryHopAlertType("temp_out_of_range")).toBe(false);
  });
});
