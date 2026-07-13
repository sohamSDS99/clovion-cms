/**
 * Unit tests for KB extraction dispatch (§7.1, FR-SETTINGS-02).
 *
 * We do NOT invoke the real native parsers — `pdf-parse` and `mammoth` are
 * mocked — so this verifies the branching/dispatch:
 *   - PASTED_TEXT  -> passthrough trim
 *   - PDF + binary -> pdf-parse path
 *   - DOC + binary -> mammoth.extractRawText path
 *   - PDF/DOC without binary -> passthrough fallback (no parser invoked)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the native parsers before importing the module under test.
// Mirrors pdf-parse v2's class API (PDFParse with getText/destroy).
const pdfGetTextMock = vi.fn(async () => ({ text: "PDF-PARSED-TEXT" }));
const pdfParseMock = vi.fn(function (this: unknown, opts: { data: Uint8Array }) {
  pdfCtorArgs.push(opts);
  return { getText: pdfGetTextMock, destroy: vi.fn(async () => {}) };
});
const pdfCtorArgs: { data: Uint8Array }[] = [];
const mammothExtractMock = vi.fn(async (_opts: { buffer: Buffer }) => ({
  value: "DOCX-PARSED-TEXT",
}));

vi.mock("pdf-parse", () => ({ PDFParse: pdfParseMock }));
vi.mock("mammoth", () => ({ extractRawText: mammothExtractMock }));

import { extractText } from "@/lib/kb/extract";

describe("extractText dispatch", () => {
  beforeEach(() => {
    pdfParseMock.mockClear();
    pdfGetTextMock.mockClear();
    pdfCtorArgs.length = 0;
    mammothExtractMock.mockClear();
  });

  it("PASTED_TEXT passes through (trimmed) and touches no parser", async () => {
    const out = await extractText("PASTED_TEXT", "  hello world  ");
    expect(out).toBe("hello world");
    expect(pdfParseMock).not.toHaveBeenCalled();
    expect(mammothExtractMock).not.toHaveBeenCalled();
  });

  it("PDF with a Buffer routes to pdf-parse", async () => {
    const out = await extractText("PDF", "", Buffer.from("%PDF-1.4 fake"));
    expect(out).toBe("PDF-PARSED-TEXT");
    expect(pdfParseMock).toHaveBeenCalledTimes(1);
    expect(mammothExtractMock).not.toHaveBeenCalled();
  });

  it("PDF with a base64 string is decoded to a Buffer for pdf-parse", async () => {
    const b64 = Buffer.from("%PDF binary").toString("base64");
    const out = await extractText("PDF", "", b64);
    expect(out).toBe("PDF-PARSED-TEXT");
    expect(pdfParseMock).toHaveBeenCalledTimes(1);
    const passed = pdfCtorArgs[0].data;
    expect(passed instanceof Uint8Array).toBe(true);
  });

  it("DOC with a Buffer routes to mammoth.extractRawText", async () => {
    const out = await extractText("DOC", "", Buffer.from("PK fake docx"));
    expect(out).toBe("DOCX-PARSED-TEXT");
    expect(mammothExtractMock).toHaveBeenCalledTimes(1);
    expect(pdfParseMock).not.toHaveBeenCalled();
  });

  it("PDF without a binary falls back to passthrough text (no parser)", async () => {
    const out = await extractText("PDF", "  pre-extracted pdf text ");
    expect(out).toBe("pre-extracted pdf text");
    expect(pdfParseMock).not.toHaveBeenCalled();
  });

  it("DOC without a binary falls back to passthrough text (no parser)", async () => {
    const out = await extractText("DOC", "  pre-extracted doc text ");
    expect(out).toBe("pre-extracted doc text");
    expect(mammothExtractMock).not.toHaveBeenCalled();
  });

  it("surfaces an honest error when the PDF parser throws", async () => {
    pdfGetTextMock.mockRejectedValueOnce(new Error("corrupt xref"));
    await expect(
      extractText("PDF", "", Buffer.from("bad"))
    ).rejects.toThrow(/Couldn't read this PDF.*corrupt xref/);
  });

  it("surfaces an honest error when the DOCX parser throws", async () => {
    mammothExtractMock.mockRejectedValueOnce(new Error("not a zip"));
    await expect(
      extractText("DOC", "", Buffer.from("bad"))
    ).rejects.toThrow(/Failed to parse DOCX: not a zip/);
  });
});
