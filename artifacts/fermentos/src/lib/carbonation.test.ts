import { describe, expect, it } from "vitest";
import { cToF, forceCarbPsi, fToC, primingSugar, psiToBar, residualCo2 } from "./carbonation";
import { LITRES_PER_GALLON } from "./waterChemistry";

describe("residualCo2", () => {
  it("is about 0.86 volumes at 68 °F", () => {
    expect(residualCo2(68)).toBeCloseTo(0.86, 2);
  });
  it("is higher in colder beer", () => {
    expect(residualCo2(50)).toBeGreaterThan(residualCo2(68));
  });
});

describe("primingSugar", () => {
  it("needs about 124 g of corn sugar for 5 gal at 68 °F to 2.5 volumes", () => {
    const r = primingSugar({ volumeL: 5 * LITRES_PER_GALLON, tempF: 68, targetVol: 2.5 });
    expect(r.grams?.corn).toBeCloseTo(124.5, 0);
    expect(r.grams!.table).toBeLessThan(r.grams!.corn);
    expect(r.grams!.dme).toBeGreaterThan(r.grams!.corn);
  });
  it("scales with volume", () => {
    const a = primingSugar({ volumeL: 10, tempF: 65, targetVol: 2.4 }).grams!;
    const b = primingSugar({ volumeL: 20, tempF: 65, targetVol: 2.4 }).grams!;
    expect(b.corn).toBeCloseTo(a.corn * 2, 6);
  });
  it("returns no sugar when the beer already holds the target", () => {
    expect(primingSugar({ volumeL: 19, tempF: 40, targetVol: 1.2 }).grams).toBeNull();
  });
});

describe("forceCarbPsi", () => {
  it("is about 11 psi at 38 °F for 2.5 volumes", () => {
    expect(forceCarbPsi({ tempF: 38, targetVol: 2.5 })).toBeCloseTo(11.2, 0);
  });
  it("is about 11 psi at 40 °F for 2.4 volumes", () => {
    expect(Math.round(forceCarbPsi({ tempF: 40, targetVol: 2.4 }))).toBe(11);
  });
  it("rises with temperature", () => {
    expect(forceCarbPsi({ tempF: 50, targetVol: 2.5 })).toBeGreaterThan(forceCarbPsi({ tempF: 38, targetVol: 2.5 }));
  });
  it("never goes negative", () => {
    expect(forceCarbPsi({ tempF: 33, targetVol: 1.0 })).toBe(0);
  });
});

describe("conversions", () => {
  it("round-trips temperature", () => {
    expect(cToF(fToC(68))).toBeCloseTo(68, 9);
  });
  it("converts psi to bar", () => {
    expect(psiToBar(14.5038)).toBeCloseTo(1, 3);
  });
});
