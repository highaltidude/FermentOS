import { describe, it, expect } from "vitest";
import { latestRun, parseLastStep, updateFailure } from "./updateSteps";

const earlier = [
  "=== Update started at Sun 15 Nov 20:05:01 EST 2026 ===",
  "[1/5] Pulling latest changes from GitHub...",
  "[5/5] Restarting services...",
].join("\n");

const refused = [
  "",
  "=== Update started at Mon 16 Nov 09:00:00 EST 2026 ===",
  "ERROR: FermentOS needs Node.js 22 or newer, but this system has v20.19.0.",
  "  Nothing was changed. Upgrade Node.js, then update again:",
  "    sudo apt-get install -y nodejs",
  "",
].join("\n");

describe("reading update.log", () => {
  it("looks only at the latest run", () => {
    expect(latestRun(earlier + refused)).toBe(refused.slice(1));
    expect(latestRun("no header")).toBe("no header");
  });

  it("doesn't take an earlier run's step for this one's", () => {
    expect(parseLastStep(earlier)).toEqual({ step: 5, label: "Restarting services" });
    expect(parseLastStep(earlier + refused)).toBeNull();
  });

  it("reports why the latest run stopped", () => {
    expect(updateFailure(earlier + refused)).toBe(
      "FermentOS needs Node.js 22 or newer, but this system has v20.19.0.\n" +
        "Nothing was changed. Upgrade Node.js, then update again:\n" +
        "sudo apt-get install -y nodejs",
    );
  });

  it("ignores an error from an earlier run", () => {
    expect(updateFailure(refused + earlier)).toBeNull();
  });
});
