import { describe, it, expect } from "./test-framework";
import {
  normalizePattern,
  lookupKeys,
  titleCase,
  chunk,
  withConcurrency,
  PIPELINE_CATEGORIES,
} from "../lib/statement-normalize";
import { buildClusters } from "../lib/statement-clusters";

export function registerStatementNormalizeTests() {
  describe("Statement Normalization & UPI Parsing Engine", () => {
    it("extracts clean merchant patterns from complex UPI narrations", () => {
      const pattern1 = normalizePattern("UPI-SWIGGY-123456789012@hdfcbank-PAYMENT");
      const pattern2 = normalizePattern("UPI/ZEPTO/zepto@icici/098765432100/GROCERIES");
      const pattern3 = normalizePattern("POS 412345XXXXXX1234 STARBUCKS COFFEE IND BANGALORE");
      const pattern4 = normalizePattern("UPI/428392193821/FINZOOMERS SERVICES/HDFC000123/Payment");

      expect(pattern1).toContain("SWIGGY");
      expect(pattern2).toContain("ZEPTO");
      expect(pattern3).toContain("STARBUCKS");
      expect(pattern4).toContain("FINZOOMERS");
    });

    it("strips banking noise tokens and reference IDs", () => {
      const raw = "NEFT CR-CITIN0000001-TECH MAHINDRA LTD-SALARY APR 2026";
      const normalized = normalizePattern(raw);

      expect(normalized).toContain("TECH MAHINDRA");
    });

    it("generates progressive dictionary lookup keys", () => {
      const keys = lookupKeys("SWIGGY INSTAMART ORDER");
      expect(keys).toContain("SWIGGY");
      expect(keys).toContain("SWIGGY INSTAMART");

      const finzoomersKeys = lookupKeys("FINZOOMERS CF");
      expect(finzoomersKeys).toContain("FINZOOMERS");
      expect(finzoomersKeys).toContain("FINZOOMERS CF");
    });

    it("ensures buildClusters strictly prioritizes existing saved memorized payees", () => {
      const txns = [
        {
          key: "t1",
          date: "2026-08-01",
          description: "UPI/428392193821/FINZOOMERS CF/HDFC000123/Payment",
          amount: -500,
          type: "expense" as const,
          pattern: "FINZOOMERS CF",
        },
      ];

      const existingPayees = [
        {
          id: "p1",
          merchant: "Indmoney",
          category_id: "cat-investments",
          aliases: ["UPI/428392193821/FINZOOMERS CF/HDFC000123/Payment", "FINZOOMERS CF", "FINZOOMERS"],
        },
      ];

      const clusters = buildClusters({
        transactions: txns,
        resolved: {
          "FINZOOMERS CF": { payee: "Finzoomers Cf", category: "Investments", source: "ai" },
        },
        existingPayees,
        categoryIdByName: new Map([["investments", "cat-investments"]]),
      });

      expect(clusters.length).toBe(1);
      expect(clusters[0].name).toBe("Indmoney");
      expect(clusters[0].isExisting).toBe(true);
      expect(clusters[0].status).toBe("auto");
      expect(clusters[0].category_id).toBe("cat-investments");
    });

    it("formats merchant titles cleanly", () => {
      expect(titleCase("SWIGGY INSTAMART")).toBe("Swiggy Instamart");
      expect(titleCase("AMAZON RETAIL INDIA")).toBe("Amazon Retail India");
    });

    it("chunks large transaction datasets reliably", () => {
      const items = Array.from({ length: 95 }, (_, i) => i + 1);
      const chunks = chunk(items, 20);

      expect(chunks.length).toBe(5);
      expect(chunks[0].length).toBe(20);
      expect(chunks[4].length).toBe(15);
    });

    it("runs async operations with bounded concurrency", async () => {
      const numbers = [1, 2, 3, 4, 5];
      const results = await withConcurrency(numbers, 2, async (n) => n * 10);

      expect(results).toEqual([10, 20, 30, 40, 50]);
    });

    it("maintains canonical pipeline categories taxonomy", () => {
      expect(PIPELINE_CATEGORIES).toContain("Food & Dining");
      expect(PIPELINE_CATEGORIES).toContain("Groceries");
      expect(PIPELINE_CATEGORIES).toContain("Investments");
      expect(PIPELINE_CATEGORIES).toContain("Salary & Income");
      expect(PIPELINE_CATEGORIES.length).toBeGreaterThan(20);
    });
  });
}
