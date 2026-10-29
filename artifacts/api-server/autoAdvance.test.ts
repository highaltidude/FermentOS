import { describe, it, expect } from "vitest";
// The pure module, which imports nothing — services/autoConditioning.ts
// reaches `@workspace/db` and throws at load without DATABASE_URL, as CI has none.
import { effectiveAutoAdvance, overrulesAutoAdvance, shouldAutoAdvance } from "./src/lib/autoAdvance.js";

describe("effectiveAutoAdvance", () => {
  it("lets the batch's own setting win over the global one", () => {
    expect(effectiveAutoAdvance(true, false)).toBe(true);
    expect(effectiveAutoAdvance(false, true)).toBe(false);
  });

  it("follows the global setting when the batch has none", () => {
    expect(effectiveAutoAdvance(null, true)).toBe(true);
    expect(effectiveAutoAdvance(null, false)).toBe(false);
    expect(effectiveAutoAdvance(undefined, true)).toBe(true);
  });
});

describe("shouldAutoAdvance", () => {
  const ready = { status: "fermenting", perBrew: null, global: true, fermentationStatus: "possibly_complete" };

  it("advances a fermenting batch that looks finished", () => {
    expect(shouldAutoAdvance(ready)).toBe(true);
  });

  it("leaves every other stage alone", () => {
    for (const status of ["brew_day", "conditioning", "packaged"]) {
      expect(shouldAutoAdvance({ ...ready, status })).toBe(false);
    }
  });

  it("waits until fermentation looks complete", () => {
    for (const fermentationStatus of ["likely_active", "slowing", "stable", "insufficient_data", null]) {
      expect(shouldAutoAdvance({ ...ready, fermentationStatus })).toBe(false);
    }
  });

  it("respects the switch, per batch first", () => {
    expect(shouldAutoAdvance({ ...ready, global: false })).toBe(false);
    expect(shouldAutoAdvance({ ...ready, global: false, perBrew: true })).toBe(true);
    expect(shouldAutoAdvance({ ...ready, global: true, perBrew: false })).toBe(false);
  });
});

describe("overrulesAutoAdvance", () => {
  const moveBack = { fromStatus: "conditioning", toStatus: "fermenting", perBrew: null, global: true, requested: undefined };

  it("treats moving back from Conditioning with auto-advance on as overruling it", () => {
    expect(overrulesAutoAdvance(moveBack)).toBe(true);
  });

  it("ignores other transitions", () => {
    expect(overrulesAutoAdvance({ ...moveBack, fromStatus: "packaged" })).toBe(false);
    expect(overrulesAutoAdvance({ ...moveBack, toStatus: "brew_day" })).toBe(false);
    expect(overrulesAutoAdvance({ ...moveBack, toStatus: undefined })).toBe(false);
  });

  it("does nothing when auto-advance was already off for the batch", () => {
    expect(overrulesAutoAdvance({ ...moveBack, global: false })).toBe(false);
    expect(overrulesAutoAdvance({ ...moveBack, perBrew: false })).toBe(false);
  });

  it("leaves it to the request when it changes the switch itself", () => {
    expect(overrulesAutoAdvance({ ...moveBack, requested: true })).toBe(false);
    expect(overrulesAutoAdvance({ ...moveBack, requested: false })).toBe(false);
  });

  it("still overrules when the request resends the switch unchanged, as the edit form does", () => {
    expect(overrulesAutoAdvance({ ...moveBack, requested: null })).toBe(true);
    expect(overrulesAutoAdvance({ ...moveBack, perBrew: true, requested: true })).toBe(true);
  });
});
