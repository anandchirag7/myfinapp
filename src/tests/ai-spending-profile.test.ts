import { describe, expect, it } from "./test-framework";
import { buildCategoryIndex } from "../lib/category-resolver";
import {
  AI_SPENDING_PROFILE_VERSION,
  applyAiSpendingReviewPolicy,
  applyAiSpendingProfileMappings,
  buildAiSpendingProfileContext,
  collectAiSpendingIdentityTokens,
  normalizeAiSpendingProfile,
} from "../lib/ai-spending-profile";

export function registerAiSpendingProfileTests() {
  describe("AI spending profile", () => {
    it("normalizes, trims, deduplicates, and bounds user-provided profile values", () => {
      const profile = normalizeAiSpendingProfile({
        usageContext: "mixed",
        householdMembers: [" Anand ", "anand", " Priya "],
        ownAccountLabels: ["HDFC Salary", " HDFC Salary "],
        merchantMappings: [
          { merchant: " Swiggy ", categoryId: "food" },
          { merchant: "", categoryId: "shopping" },
        ],
        requireP2PReview: false,
      });

      expect(profile.version).toBe(AI_SPENDING_PROFILE_VERSION);
      expect(profile.householdMembers).toEqual(["Anand", "Priya"]);
      expect(profile.ownAccountLabels).toEqual(["HDFC Salary"]);
      expect(profile.merchantMappings).toEqual([{ merchant: "Swiggy", categoryId: "food" }]);
      expect(profile.requireP2PReview).toBe(false);
    });

    it("turns exact merchant, income, and recurring mappings into deterministic categories", () => {
      const profile = normalizeAiSpendingProfile({
        merchantMappings: [{ merchant: "Swiggy", categoryId: "food" }],
        incomeSources: [{ name: "Acme Payroll", categoryId: "salary" }],
        recurringPayments: [{ merchant: "Netflix", categoryId: "entertainment" }],
      });
      const categories = buildCategoryIndex([
        { id: "food", name: "Food Delivery", kind: "expense", parent_id: null },
        { id: "salary", name: "Salary", kind: "income", parent_id: null },
        { id: "entertainment", name: "Entertainment", kind: "expense", parent_id: null },
      ]);
      const result = applyAiSpendingProfileMappings(
        [
          { pattern: "SWIGGY", description: "UPI SWIGGY", type: "expense" },
          { pattern: "ACME PAYROLL", description: "SALARY ACME PAYROLL", type: "income" },
          { pattern: "ACME PAYROLL", description: "PAYMENT ACME PAYROLL", type: "expense" },
          { pattern: "NETFLIX", description: "NETFLIX MONTHLY", type: "expense" },
        ],
        profile,
        categories,
      );

      expect(result.SWIGGY?.categoryId).toBe("food");
      expect(result["ACME PAYROLL"]?.categoryId).toBe("salary");
      expect(result.NETFLIX?.categoryId).toBe("entertainment");
      expect(result.SWIGGY?.source).toBe("user_profile");
    });

    it("uses profile identities for normalization without leaking blank or duplicate tokens", () => {
      const profile = normalizeAiSpendingProfile({
        householdMembers: ["Anand Sharma", "Priya Sharma"],
        ownAccountLabels: ["Anand HDFC Salary", "My SBI Savings"],
      });
      expect(collectAiSpendingIdentityTokens(profile)).toEqual([
        "Anand",
        "Sharma",
        "Priya",
        "HDFC",
        "Salary",
        "SBI",
        "Savings",
      ]);
    });

    it("builds bounded, structured AI context and preserves manual-review safeguards", () => {
      const profile = normalizeAiSpendingProfile({
        usageContext: "business",
        requireP2PReview: true,
        neverAutoAssignCategoryIds: ["medical"],
        merchantMappings: Array.from({ length: 30 }, (_, index) => ({
          merchant: `Merchant ${index}`,
          categoryId: "shopping",
        })),
      });
      const context = buildAiSpendingProfileContext(
        profile,
        new Map([
          ["shopping", "Shopping"],
          ["medical", "Medical"],
        ]),
        500,
      );

      expect(context.join("\n").length).toBeLessThanOrEqual(500);
      expect(context.some((line) => line.includes("business"))).toBe(true);
      expect(context.some((line) => line.includes("person-to-person"))).toBe(true);
      expect(context.some((line) => line.includes("Medical"))).toBe(true);
    });

    it("enforces guarded categories and honors the household P2P review preference", () => {
      const guarded = applyAiSpendingReviewPolicy(
        {
          source: "ai",
          category: "Medical",
          categoryId: "medical",
          categoryKey: "healthcare",
          categoryConfidence: 0.98,
          requiresReview: false,
          blockingReason: null,
          evidence: [],
        },
        { requireP2PReview: false, neverAutoAssignCategoryIds: ["medical"] },
      );
      expect(guarded.requiresReview).toBe(true);
      expect(guarded.evidence).toEqual(["profile_requires_review"]);

      const p2p = applyAiSpendingReviewPolicy(
        {
          source: "ai",
          category: "Payments to People",
          categoryId: "people",
          categoryKey: "payments_to_people",
          categoryConfidence: 0.94,
          requiresReview: true,
          blockingReason: "low_confidence",
          evidence: [],
        },
        { requireP2PReview: false, neverAutoAssignCategoryIds: [] },
      );
      expect(p2p.requiresReview).toBe(false);
      expect(p2p.blockingReason).toBeNull();
    });
  });
}
