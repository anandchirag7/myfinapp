import { describe, expect, it } from "./test-framework";
import { chunkPdfPages, formatStructuredPdfPage, PdfPasswordError } from "../lib/pdf-extract.server";

export function registerPdfExtractTests() {
  describe("PDF extraction & chunking", () => {
    it("formats structured PDF text items into table-preserving rows", () => {
      const items = [
        { str: "01/04/2026", x: 10, y: 700, width: 50, height: 10, fontSize: 10, fontFamily: "Helvetica", dir: "ltr", hasEOL: false },
        { str: "UPI-SWIGGY", x: 90, y: 700, width: 70, height: 10, fontSize: 10, fontFamily: "Helvetica", dir: "ltr", hasEOL: false },
        { str: "450.00", x: 250, y: 700, width: 40, height: 10, fontSize: 10, fontFamily: "Helvetica", dir: "ltr", hasEOL: true },
        { str: "02/04/2026", x: 10, y: 685, width: 50, height: 10, fontSize: 10, fontFamily: "Helvetica", dir: "ltr", hasEOL: false },
        { str: "SALARY", x: 90, y: 685, width: 40, height: 10, fontSize: 10, fontFamily: "Helvetica", dir: "ltr", hasEOL: true },
      ];
      const text = formatStructuredPdfPage(items);
      expect(text).toBe("01/04/2026 | UPI-SWIGGY | 450.00\n02/04/2026 | SALARY");
    });

    it("chunks multi-page PDF text without splitting pages mid-page", () => {
      const pages = ["Page one data ".repeat(100), "Page two data ".repeat(100), "Page three data"];
      const chunks = chunkPdfPages(pages, 1600);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toContain("--- Page 1 ---");
      expect(chunks[1]).toContain("--- Page 2 ---");
      expect(chunks[1]).toContain("--- Page 3 ---");
    });

    it("creates typed PdfPasswordError codes", () => {
      const req = new PdfPasswordError("required", "needed");
      const bad = new PdfPasswordError("incorrect", "wrong");
      expect(req.code).toBe("required");
      expect(bad.code).toBe("incorrect");
    });
  });
}
