import { describe, expect, it } from "vitest";
import { normalizeSuppliers } from "./inventorySuppliers";

describe("normalizeSuppliers", () => {
  it("returns an empty list unchanged", () => {
    expect(normalizeSuppliers([])).toEqual([]);
  });

  it("trims names and links, and fills in missing fields", () => {
    expect(normalizeSuppliers([{ name: "  MoreBeer ", url: " https://morebeer.com " }])).toEqual([
      { name: "MoreBeer", price: null, url: "https://morebeer.com", preferred: false },
    ]);
  });

  it("drops suppliers with a blank name", () => {
    expect(normalizeSuppliers([{ name: "   ", price: 2 }, { name: "Northern Brewer", price: 2.09 }])).toEqual([
      { name: "Northern Brewer", price: 2.09, url: null, preferred: false },
    ]);
  });

  it("keeps only the first preferred supplier", () => {
    const result = normalizeSuppliers([
      { name: "A", preferred: false },
      { name: "B", preferred: true },
      { name: "C", preferred: true },
    ]);
    expect(result.map((s) => s.preferred)).toEqual([false, true, false]);
  });

  it("adds https:// to a bare domain and drops links that aren't web pages", () => {
    const urls = normalizeSuppliers([
      { name: "A", url: "morebeer.com/product/x" },
      { name: "B", url: "http://shop.example" },
      { name: "C", url: "javascript:alert(1)" },
    ]).map((s) => s.url);
    expect(urls).toEqual(["https://morebeer.com/product/x", "http://shop.example", null]);
  });

  it("treats a blank link as no link", () => {
    expect(normalizeSuppliers([{ name: "A", url: "  " }])[0].url).toBeNull();
  });
});
