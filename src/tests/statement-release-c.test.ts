import { buildCategoryIndex } from "../lib/category-resolver";
import { resolveCategoryKey, STATEMENT_CATEGORY_KEYS } from "../lib/statement-category-keys";
import { hasTokenCorroboration } from "../lib/statement-embedding.server";
import { reviewRisk, summarizeReviewRisk } from "../lib/statement-review-risk";
import { describe, expect, it } from "./test-framework";

export function registerStatementReleaseCTests() {
  describe("Statement import Release C", () => {
    it("uses a compact stable category-key contract", () => {
      expect(STATEMENT_CATEGORY_KEYS.length).toBeLessThanOrEqual(20);
      expect(STATEMENT_CATEGORY_KEYS).toContain("payments_to_people");
      expect(STATEMENT_CATEGORY_KEYS).toContain("refund_reversal");
    });

    it("maps stable keys into each household taxonomy", () => {
      const index = buildCategoryIndex([
        { id: "food", name: "Food & Dining", kind: "expense", parent_id: null },
        { id: "fees", name: "Bank Fees & Charges", kind: "expense", parent_id: null },
      ]);
      expect(resolveCategoryKey("food_dining", index)?.id).toBe("food");
      expect(resolveCategoryKey("fees_charges", index)?.id).toBe("fees");
    });

    it("requires lexical corroboration for embedding auto-application", () => {
      expect(hasTokenCorroboration("MCDONALDS BANGALORE", "McDonalds")).toBe(true);
      expect(hasTokenCorroboration("PERSON ALPHA", "Amazon India")).toBe(false);
    });

    it("does not make a new or uncategorized P2P payee blocking", () => {
      expect(
        reviewRisk({
          identityResolved: true,
          categoryResolved: false,
          transactionTypeResolved: true,
          confidence: 0.7,
          personLike: true,
        }),
      ).toBe("deferred");
    });

    it("keeps the first-import blocking gate at ten or fewer decisions", () => {
      const decisions = Array.from({ length: 153 }, (_, index) => ({
        identityResolved: index >= 7,
        categoryResolved: index >= 7 && index % 5 !== 0,
        transactionTypeResolved: true,
        confidence: index >= 7 ? 0.88 : 0.4,
        personLike: index % 3 === 0,
      }));
      const summary = summarizeReviewRisk(decisions);
      expect(summary.blocking).toBeLessThanOrEqual(10);
      expect(summary.identityResolved).toBe(146);
    });
  });
}
