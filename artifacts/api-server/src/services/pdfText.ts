import type { PdfPage } from "../lib/morebeerKitSheet";

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Pull the positioned text out of a PDF, one entry per run of text.
 *
 * Positions matter more than reading order for the layouts we parse, so every
 * item keeps its left edge and its baseline, the latter flipped to measure from
 * the top of the page like everything else on screen.
 *
 * unpdf is loaded on first use: it carries a full PDF engine, and almost no
 * boot ever needs it.
 */
export async function extractPdfTextItems(data: Uint8Array): Promise<PdfPage[]> {
  const { getDocumentProxy } = await import("unpdf");
  // pdf.js takes ownership of the buffer it is given, so hand it a copy.
  const pdf = await getDocumentProxy(new Uint8Array(data));
  try {
    const pages: PdfPage[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PdfPage["items"] = [];
      for (const item of content.items) {
        if (!("str" in item) || item.str.trim() === "") continue;
        items.push({
          str: item.str,
          x: round1(item.transform[4]),
          y: round1(viewport.height - item.transform[5]),
          width: round1(item.width),
          height: round1(item.height),
        });
      }
      pages.push({ width: viewport.width, height: viewport.height, items });
    }
    return pages;
  } finally {
    await pdf.cleanup();
  }
}
