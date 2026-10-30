import { describe, it, expect } from "vitest";
import { planInventoryConsumption, type PlanIngredient, type PlanInventoryRow } from "./src/lib/inventoryPlan.js";

const hop = (name: string, amount: number, unit = "oz"): PlanIngredient => ({ name, type: "hop", amount, unit });
const stock = (id: number, name: string, amount: number, over: Partial<PlanInventoryRow> = {}): PlanInventoryRow => ({
  id, name, type: "hop", amount, unit: "oz", purchasedDate: null, ...over,
});

describe("planInventoryConsumption", () => {
  it("deducts what the recipe needs", () => {
    expect(planInventoryConsumption([hop("Magnum", 2)], [stock(1, "Magnum", 5)])).toEqual({
      shortages: [],
      updates: [{ id: 1, newAmount: 3 }],
    });
  });

  it("matches names without regard to case or stray spaces, but not across types", () => {
    const plan = planInventoryConsumption([hop("magnum ", 1)], [stock(1, " Magnum", 1)]);
    expect(plan.updates).toEqual([{ id: 1, newAmount: 0 }]);

    const wrongType = planInventoryConsumption([hop("Magnum", 1)], [stock(1, "Magnum", 1, { type: "malt" })]);
    expect(wrongType.shortages[0]).toMatchObject({ reason: "missing" });
  });

  // A hop that goes in at 45 minutes, at flameout and as a dry hop is three
  // recipe lines. Checked one at a time against the same ounce, each passed.
  it("totals a repeated ingredient before checking stock", () => {
    const simcoe = [hop("Simcoe", 1), hop("Simcoe", 1), hop("Simcoe", 1)];

    const short = planInventoryConsumption(simcoe, [stock(1, "Simcoe", 1)]);
    expect(short.updates).toEqual([]);
    expect(short.shortages).toEqual([
      { name: "Simcoe", type: "hop", required: 3, available: 1, unit: "oz", reason: "insufficient" },
    ]);

    const enough = planInventoryConsumption(simcoe, [stock(1, "Simcoe", 4)]);
    expect(enough).toEqual({ shortages: [], updates: [{ id: 1, newAmount: 1 }] });
  });

  it("draws down the oldest purchase first, then spills into the next", () => {
    const plan = planInventoryConsumption(
      [hop("Columbus", 1), hop("Columbus", 3)],
      [
        stock(1, "Columbus", 2, { purchasedDate: "2026-06-01" }),
        stock(2, "Columbus", 5, { purchasedDate: "2026-03-01" }),
        stock(3, "Columbus", 5),
      ],
    );
    expect(plan.updates).toEqual([{ id: 2, newAmount: 1 }]);

    const spill = planInventoryConsumption(
      [hop("Columbus", 6)],
      [stock(1, "Columbus", 2, { purchasedDate: "2026-06-01" }), stock(2, "Columbus", 5, { purchasedDate: "2026-03-01" })],
    );
    expect(spill.updates).toEqual([{ id: 2, newAmount: 0 }, { id: 1, newAmount: 1 }]);
  });

  it("reports a unit mismatch rather than converting", () => {
    const plan = planInventoryConsumption(
      [{ name: "Light Dry Extract", type: "malt", amount: 8, unit: "oz" }],
      [{ id: 1, name: "Light Dry Extract", type: "malt", amount: 3, unit: "lbs", purchasedDate: null }],
    );
    expect(plan.shortages).toEqual([
      { name: "Light Dry Extract", type: "malt", required: 8, available: 3, unit: "oz", reason: "unit_mismatch", availableUnit: "lbs" },
    ]);
  });

  it("keeps the same ingredient in two units as two separate needs", () => {
    const plan = planInventoryConsumption(
      [
        { name: "Light Dry Extract", type: "malt", amount: 8, unit: "oz" },
        { name: "Light Dry Extract", type: "malt", amount: 7.5, unit: "lbs" },
      ],
      [
        { id: 1, name: "Light Dry Extract", type: "malt", amount: 16, unit: "oz", purchasedDate: null },
        { id: 2, name: "Light Dry Extract", type: "malt", amount: 10, unit: "lbs", purchasedDate: null },
      ],
    );
    expect(plan).toEqual({ shortages: [], updates: [{ id: 1, newAmount: 8 }, { id: 2, newAmount: 2.5 }] });
  });

  it("reports the shortage; the caller applies nothing when there is one", () => {
    const plan = planInventoryConsumption([hop("Magnum", 1), hop("Nugget", 1)], [stock(1, "Magnum", 5)]);
    expect(plan.shortages.map((s) => [s.name, s.reason])).toEqual([["Nugget", "missing"]]);
    expect(plan.updates).toEqual([{ id: 1, newAmount: 4 }]);
  });

  it("does not let float drift turn enough into a shortage", () => {
    const plan = planInventoryConsumption([hop("Citra", 0.1), hop("Citra", 0.2)], [stock(1, "Citra", 0.3)]);
    expect(plan).toEqual({ shortages: [], updates: [{ id: 1, newAmount: 0 }] });
  });
});
