import { describe, it, expect, vi } from "vitest";

// What unpdf does on Node.js 20: pdf.js won't load, whatever the file.
vi.mock("unpdf", () => ({
  getResolvedPDFJS: () => Promise.reject(new Error("Serverless PDF.js bundle could not be resolved: ReferenceError: Iterator is not defined")),
  getDocumentProxy: vi.fn(),
}));

const { extractPdfTextItems, PdfEngineUnavailableError } = await import("./src/services/pdfText.js");
const { isNodeSupported, nodeMajor, MIN_NODE_MAJOR } = await import("./src/lib/nodeVersion.js");

describe("a server that can't load pdf.js", () => {
  it("blames the engine, not the file", async () => {
    const err = await extractPdfTextItems(new Uint8Array([37, 80, 68, 70])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfEngineUnavailableError);
    expect(String((err as Error).cause)).toMatch(/Iterator is not defined/);
  });
});

describe("the supported Node.js versions", () => {
  it("starts at 22", () => {
    expect(MIN_NODE_MAJOR).toBe(22);
    expect(nodeMajor("20.19.0")).toBe(20);
    expect(isNodeSupported("20.19.0")).toBe(false);
    expect(isNodeSupported("22.0.0")).toBe(true);
    expect(isNodeSupported("24.21.0")).toBe(true);
    expect(isNodeSupported()).toBe(true);
  });
});
