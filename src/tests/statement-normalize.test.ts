import { describe, it, expect } from "./test-framework";
import {
  normalizePattern,
  lookupKeys,
  titleCase,
  chunk,
  withConcurrency,
  PIPELINE_CATEGORIES,
} from "../lib/statement-normalize";
import {
  buildClusters,
  buildImportDiagnostics,
  groupPatterns,
  summarize,
} from "../lib/statement-clusters";
import { DEFAULT_CATEGORY_TEMPLATES } from "../lib/default-category-templates";
import { buildCategoryIndex, categorizeByKeywords } from "../lib/category-resolver";
import { STATEMENT_IMPORT_REGRESSION_DESCRIPTIONS } from "./fixtures/statement-import-regression";

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
      expect(pattern4).toBe("INDMONEY");
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
          aliases: [
            "UPI/428392193821/FINZOOMERS CF/HDFC000123/Payment",
            "FINZOOMERS CF",
            "FINZOOMERS",
          ],
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
      expect(PIPELINE_CATEGORIES.length).toBe(98);
      expect(new Set(PIPELINE_CATEGORIES).size).toBe(98);
    });

    it("keeps every default template key unique with a valid parent", () => {
      const keys = new Set(DEFAULT_CATEGORY_TEMPLATES.map((template) => template.key));
      expect(keys.size).toBe(98);

      for (const template of DEFAULT_CATEGORY_TEMPLATES) {
        if (template.parentKey) expect(keys.has(template.parentKey)).toBe(true);
      }
    });

    it("uses compact leaf categories and ignores generic payment rails", () => {
      const categories = ["Food Delivery", "Mobile & Internet", "Transfers"].map((name, index) => ({
        id: `category-${index}`,
        name,
        kind: name === "Transfers" ? "transfer" : "expense",
        parent_id: null,
      }));
      const categoryIndex = buildCategoryIndex(categories);

      expect(categorizeByKeywords("SWIGGY", "food order", categoryIndex)).toBe("category-0");
      expect(categorizeByKeywords("ACT FIBERNET", "broadband bill", categoryIndex)).toBe(
        "category-1",
      );
      expect(categorizeByKeywords("PHONEPE", "UPI payment", categoryIndex)).toBeNull();
    });

    it("canonicalizes processor-heavy merchant narrations", () => {
      expect(
        normalizePattern(
          "UPI-INDIAN CLEARING CORP-ZERODHA.ICCL6.BRK@VALIDYES-HDFC0000060-649094158535-MERCHANT UPI TXN",
        ),
      ).toBe("ZERODHA");
      expect(normalizePattern("UPI-AUTOPAY-INDMONEY-INDMONEY189011.RZPREC@RXAIRTEL-MANDATE")).toBe(
        "INDMONEY",
      );
      expect(
        normalizePattern("UPI-ADOBEAUTOPAY-ADOBE.ADYENAUTOPAY@HDFCBANK-ADOBE INC PURCHASE"),
      ).toBe("ADOBE");
      expect(normalizePattern("UPI-BLINKIT-BLINKIT.PAYU@HDFCBANK-UPIINTENT")).toBe("BLINKIT");
    });

    it("does not fuzzy-merge different person-to-person payees", () => {
      const alpha = normalizePattern("UPI-PERSON ALPHA-9000000001@YBL-PAYMENT FROM PHONE");
      const beta = normalizePattern("UPI-PERSON BETA-9000000002@YBL-PAYMENT FROM PHONE");
      expect(groupPatterns([alpha, beta]).length).toBe(2);
    });

    it("resolves initial categories from a response-local category index", () => {
      const categories = [
        { id: "food-delivery", name: "Food Delivery", kind: "expense", parent_id: null },
        { id: "shopping", name: "Shopping", kind: "expense", parent_id: null },
      ];
      const categoryIndex = buildCategoryIndex(categories);
      const clusters = buildClusters({
        transactions: [
          {
            key: "t1",
            date: "2026-08-01",
            description: "UPI-SWIGGY-SWIGGY@YBL",
            amount: 500,
            type: "expense",
            pattern: "SWIGGY",
          },
        ],
        resolved: {
          SWIGGY: { payee: "Swiggy", category: "Food Delivery", source: "dictionary" },
        },
        existingPayees: [],
        categoryIdByName: new Map(
          categories.map((category) => [category.name.toLowerCase(), category.id]),
        ),
        categoryIndex,
      });

      expect(clusters[0].category_id).toBe("food-delivery");
      expect(summarize(clusters).needsReview).toBe(0);
    });

    it("prioritizes learned pattern categories over dictionary categories", () => {
      const categories = [
        { id: "learned", name: "Software & Apps", kind: "expense", parent_id: null },
        { id: "dictionary", name: "Shopping", kind: "expense", parent_id: null },
      ];
      const clusters = buildClusters({
        transactions: [
          {
            key: "t1",
            date: "2026-08-01",
            description: "ADOBE",
            amount: 1000,
            type: "expense",
            pattern: "ADOBE",
          },
        ],
        resolved: { ADOBE: { payee: "Adobe", category: "Shopping", source: "dictionary" } },
        existingPayees: [],
        categoryIdByName: new Map(),
        categoryIndex: buildCategoryIndex(categories),
        patternCategoryMap: new Map([["ADOBE", "learned"]]),
      });

      expect(clusters[0].category_id).toBe("learned");
      expect(clusters[0].resolutionReason).toBe("household_pattern");
    });

    it("matches keyword tokens without treating CRED as CREDIT", () => {
      const categories = [
        { id: "card-payment", name: "Credit Card Payment", kind: "transfer", parent_id: null },
      ];
      const index = buildCategoryIndex(categories);
      expect(categorizeByKeywords("CRED", "payment on CRED", index)).toBe("card-payment");
      expect(categorizeByKeywords("CREDIT SOCIETY", "membership", index)).toBeNull();
    });

    it("recalculates categorized transaction diagnostics from current clusters", () => {
      const categories = [{ id: "groceries", name: "Groceries", kind: "expense", parent_id: null }];
      const clusters = buildClusters({
        transactions: [
          {
            key: "t1",
            date: "2026-08-01",
            description: "BLINKIT",
            amount: 100,
            type: "expense",
            pattern: "BLINKIT",
          },
          {
            key: "t2",
            date: "2026-08-02",
            description: "PERSON ALPHA",
            amount: 200,
            type: "expense",
            pattern: "PERSON ALPHA",
          },
        ],
        resolved: {
          BLINKIT: { payee: "Blinkit", category: "Groceries", source: "dictionary" },
        },
        existingPayees: [],
        categoryIdByName: new Map([["groceries", "groceries"]]),
        categoryIndex: buildCategoryIndex(categories),
      });
      const diagnostics = buildImportDiagnostics(clusters);
      expect(diagnostics.transactions).toBe(2);
      expect(diagnostics.categorizedTransactions).toBe(1);
      expect(diagnostics.uncategorizedTransactions).toBe(1);
    });

    it("collapses sanitized high-volume merchant variants without merging people", () => {
      const patterns = STATEMENT_IMPORT_REGRESSION_DESCRIPTIONS.map(normalizePattern);
      const uniquePatterns = Array.from(new Set(patterns));
      expect(uniquePatterns).toContain("ZERODHA");
      expect(uniquePatterns).toContain("INDMONEY");
      expect(uniquePatterns).toContain("ADOBE");
      expect(uniquePatterns).toContain("BLINKIT");
      expect(uniquePatterns).toContain("PERSON ALPHA");
      expect(uniquePatterns).toContain("PERSON BETA");
      expect(uniquePatterns.length).toBe(7);
      expect(groupPatterns(uniquePatterns).length).toBe(7);
    });
  });
}
