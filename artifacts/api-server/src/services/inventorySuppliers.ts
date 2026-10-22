import type { InventorySupplier } from "@workspace/db";

export type SupplierInput = {
  name: string;
  price?: number | null;
  url?: string | null;
  preferred?: boolean;
};

/**
 * Shapes a supplier list from a request body for storage: trimmed names and
 * links, blank names dropped, and at most one preferred supplier (the first
 * one flagged) so the Ingredients page never has to pick between two.
 */
export function normalizeSuppliers(input: SupplierInput[]): InventorySupplier[] {
  let preferredSeen = false;
  return input
    .map((s) => ({ ...s, name: s.name.trim() }))
    .filter((s) => s.name !== "")
    .map((s) => {
      const preferred = !!s.preferred && !preferredSeen;
      if (preferred) preferredSeen = true;
      return {
        name: s.name,
        price: s.price ?? null,
        url: s.url?.trim() || null,
        preferred,
      };
    });
}
