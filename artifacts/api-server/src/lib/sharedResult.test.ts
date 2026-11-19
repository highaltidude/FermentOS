import { describe, it, expect, vi } from "vitest";
import { sharedResult } from "./sharedResult";

describe("sharedResult", () => {
  it("shares one run between calls made while it is running", async () => {
    let resolve!: (v: number) => void;
    const fn = vi.fn(() => new Promise<number>((r) => { resolve = r; }));
    const get = sharedResult(1000, fn);
    const a = get();
    const b = get();
    resolve(7);
    expect(await a).toBe(7);
    expect(await b).toBe(7);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reuses a result until it is ttlMs old, then runs again", async () => {
    let t = 0;
    let n = 0;
    const get = sharedResult(1000, async () => ++n, () => t);
    expect(await get()).toBe(1);
    t = 999;
    expect(await get()).toBe(1);
    t = 2000;
    expect(await get()).toBe(2);
  });

  it("does not keep a failure", async () => {
    let n = 0;
    const get = sharedResult(1000, async () => {
      n++;
      if (n === 1) throw new Error("boom");
      return n;
    });
    await expect(get()).rejects.toThrow("boom");
    expect(await get()).toBe(2);
  });
});
