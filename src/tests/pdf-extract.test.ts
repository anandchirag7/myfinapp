import { describe, expect, it } from "./test-framework";
import { chunkPdfPages, formatStructuredPdfPage, PdfPasswordError } from "../lib/pdf-extract.server";
import { extractPdfRowsDeterministic } from "../lib/statement-parse.server";

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

    it("deterministically parses Indian bank PDF tables using running balance", () => {
      const pages = [
        [
          "Date | Narration | Chq./Ref.No. | Value Dt | Withdrawal Amt. | Deposit Amt. | Closing Balance",
          "Opening Balance | 10,000.00",
          "01/04/2026 | UPI-SWIGGY-123@hdfcbank | REF12345678 | 01/04/2026 | 450.00 | 9,550.00",
          "02/04/2026 | NEFT CR-ACME CORP | REF87654321 | 02/04/2026 | 5,000.00 | 14,550.00",
        ].join("\n"),
      ];
      const rows = extractPdfRowsDeterministic(pages);
      expect(rows.length).toBe(2);
      expect(rows[0]?.date).toBe("2026-04-01");
      expect(rows[0]?.amount).toBe(450);
      expect(rows[0]?.direction).toBe("debit");
      expect(rows[0]?.type).toBe("expense");
      expect(rows[1]?.date).toBe("2026-04-02");
      expect(rows[1]?.amount).toBe(5000);
      expect(rows[1]?.direction).toBe("credit");
      expect(rows[1]?.type).toBe("income");
    });
  });
}
