import { parseMorebeerKitSheet, type KitSheetParseResult, type PdfPage } from "./morebeerKitSheet.js";
import { isNorthernBrewerSheet, parseNorthernBrewerKitSheet } from "./northernBrewerKitSheet.js";

/** Read a kit sheet from whichever supplier it comes from. */
export function parseKitSheet(pages: PdfPage[]): KitSheetParseResult {
  return isNorthernBrewerSheet(pages) ? parseNorthernBrewerKitSheet(pages) : parseMorebeerKitSheet(pages);
}
