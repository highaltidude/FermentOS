import { describe, expect, it } from "vitest";
import { splitAssignmentsByRole, type SensorRole } from "./src/lib/sensorRoles.js";

const a = (id: number, deviceId: number, role: SensorRole) => ({ id, deviceId, role });

describe("splitAssignmentsByRole", () => {
  it("keeps every window of a brew with only fermenter sensors as fermentation data", () => {
    const windows = [a(1, 10, "fermenter"), a(2, 11, "fermenter"), a(3, 10, "fermenter")];
    const { fermenter, reference } = splitAssignmentsByRole(windows);
    expect(fermenter.map((w) => w.id)).toEqual([1, 2, 3]);
    expect(reference.size).toBe(0);
  });

  it("takes a reference probe (an ice bath) out of the fermentation data", () => {
    const { fermenter, reference } = splitAssignmentsByRole([a(1, 10, "fermenter"), a(2, 20, "reference")]);
    expect(fermenter.map((w) => w.deviceId)).toEqual([10]);
    expect([...reference.keys()]).toEqual([20]);
  });

  it("groups each reference sensor's windows together, in order of first appearance", () => {
    const { reference } = splitAssignmentsByRole([
      a(1, 30, "reference"),
      a(2, 20, "reference"),
      a(3, 10, "fermenter"),
      a(4, 30, "reference"),
    ]);
    expect([...reference.keys()]).toEqual([30, 20]);
    expect(reference.get(30)!.map((w) => w.id)).toEqual([1, 4]);
  });

  it("leaves no fermentation data when every sensor is a reference", () => {
    const { fermenter, reference } = splitAssignmentsByRole([a(1, 20, "reference")]);
    expect(fermenter).toEqual([]);
    expect(reference.get(20)).toHaveLength(1);
  });
});
