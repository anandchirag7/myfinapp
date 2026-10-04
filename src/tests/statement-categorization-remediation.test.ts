import { describe, expect, it } from "./test-framework";
import { buildCategoryIndex } from "../lib/category-resolver";
import { buildClusters } from "../lib/statement-clusters";
import { resolveCategoryKey } from "../lib/statement-category-keys";
import {
  applyAiConfidencePolicy,
  buildClassificationContext,
  parseManualCategoryAssignments,
  shouldLearnPatternCategory,
} from "../lib/statement-classification-policy";
import { applyLoadedStatementRules, type LoadedGroup } from "../lib/rules-engine.server";
import { resolveVerifiedEntityCategory } from "../lib/statement-embedding.server";
import { resolveFromLookups } from "../lib/statement-classify.server";

function createLookupSupabase(rowsByTable: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const result = { data: rowsByTable[table] ?? [], error: null };
      const ready = Promise.resolve(result);
      const query: Record<string, unknown> & PromiseLike<typeof result> = {
        select: () => query,
        eq: () => query,
        in: () => query,
        not: () => query,
        or: () => query,
        then: ready.then.bind(ready),
      };
      return query;
    },
  };
}

export function registerStatementCategorizationRemediationTests() {
  describe("AI transaction categorization remediation", () => {
    it("preserves model confidence in review clusters", () => {
      const categories = [{ id: "food", name: "Food Delivery", kind: "expense", parent_id: null }];
      const clusters = buildClusters({
        transactions: [
          {
            key: "t1",
            date: "2026-10-03",
            description: "SWIGGY ORDER",
            amount: 450,
            type: "expense",
            pattern: "SWIGGY",
          },
        ],
        resolved: {
          SWIGGY: {
            payee: "Swiggy",
            category: "Food Delivery",
            source: "ai",
            identityConfidence: 0.96,
            categoryConfidence: 0.81,
            confidence: 0.81,
          },
        },
        existingPayees: [],
        categoryIdByName: new Map([["food delivery", "food"]]),
        categoryIndex: buildCategoryIndex(categories),
      });

      expect(clusters[0].confidence).toBe(0.81);
      expect(clusters[0].status).toBe("suggested");
    });

    it("does not learn low-confidence AI or keyword fallback categories", () => {
      expect(
        shouldLearnPatternCategory({
          source: "ai",
          category: "Food Delivery",
          categoryKey: "food_dining",
          categoryConfidence: 0.89,
        }),
      ).toBe(false);
      expect(
        shouldLearnPatternCategory({
          source: "ai",
          category: "Food Delivery",
          categoryKey: "food_dining",
          categoryConfidence: 0.93,
        }),
      ).toBe(true);
      expect(
        shouldLearnPatternCategory({
          source: "keyword",
          category: "Food Delivery",
          categoryConfidence: 0.95,
        }),
      ).toBe(false);
    });

    it("retains stored pattern confidence instead of upgrading it on lookup", async () => {
      const index = buildCategoryIndex([
        { id: "food", name: "Food Delivery", kind: "expense", parent_id: null },
      ]);
      const supabase = createLookupSupabase({
        global_merchant_dictionary: [
          {
            normalized_pattern: "SWIGGY",
            canonical_payee_name: "Swiggy",
            suggested_category: "Food Delivery",
          },
        ],
        payee_pattern_categories: [
          {
            normalized_pattern: "SWIGGY",
            category_id: "food",
            category_name: "Food Delivery",
            household_id: "household-1",
            source: "ai",
            confidence: 0.72,
          },
        ],
      });
      const result = await resolveFromLookups(
        supabase,
        "user-1",
        ["SWIGGY"],
        "household-1",
        false,
        index,
      );

      expect(result.resolved.SWIGGY.source).toBe("household_pattern");
      expect(result.resolved.SWIGGY.categoryConfidence).toBe(0.72);
      expect(result.resolved.SWIGGY.requiresReview).toBe(true);
    });

    it("keeps memorized category IDs separate from category names", async () => {
      const index = buildCategoryIndex([
        { id: "software", name: "Software & Apps", kind: "expense", parent_id: null },
      ]);
      const supabase = createLookupSupabase({
        memorized_payees: [
          {
            merchant: "Adobe",
            name: "Adobe",
            aliases: ["ADOBE"],
            category_id: "software",
          },
        ],
      });
      const result = await resolveFromLookups(
        supabase,
        "user-1",
        ["ADOBE"],
        "household-1",
        false,
        index,
      );

      expect(result.resolved.ADOBE.category).toBe("Software & Apps");
      expect(result.resolved.ADOBE.categoryId).toBe("software");
    });

    it("abstains below the AI suggestion threshold", () => {
      const low = applyAiConfidencePolicy({
        source: "ai",
        payee: "Unknown Store",
        category: "Shopping",
        categoryKey: "shopping",
        confidence: 0.62,
        identityConfidence: 0.8,
        categoryConfidence: 0.62,
      });
      expect(low.category).toBeNull();
      expect(low.requiresReview).toBe(true);
      expect(low.blockingReason).toBe("low_confidence");

      const high = applyAiConfidencePolicy({
        source: "ai",
        payee: "Known Store",
        category: "Shopping",
        categoryKey: "shopping",
        confidence: 0.94,
        identityConfidence: 0.96,
        categoryConfidence: 0.94,
      });
      expect(high.category).toBe("Shopping");
      expect(high.requiresReview).toBe(false);
    });

    it("materializes category-only rules without requiring AI", () => {
      const groups: LoadedGroup[] = [
        {
          id: "group-1",
          stop_processing: false,
          rules: [
            {
              id: "rule-1",
              title: "Swiggy is food",
              kind: "deterministic",
              trigger_moment: "create",
              is_active: true,
              sort_order: 0,
              strict_mode: true,
              rule_triggers: [{ field: "merchant", operator: "contains", value: "swiggy" }],
              rule_actions: [{ action_type: "set_category", action_value: "food" }],
            },
          ],
        },
      ];
      const transactions = [
        {
          pattern: "SWIGGY",
          description: "UPI SWIGGY ORDER",
          merchant: "UPI SWIGGY ORDER",
          amount: 450,
          type: "expense",
        },
      ];
      const result = applyLoadedStatementRules(
        groups,
        transactions,
        new Map([["food", "Food Delivery"]]),
      );

      expect(result.matchedPatterns.has("SWIGGY")).toBe(true);
      expect(result.resolved.SWIGGY.category).toBe("Food Delivery");
      expect(result.resolved.SWIGGY.source).toBe("user_rule");
    });

    it("sends conflicting rule categories for one pattern to review", () => {
      const groups: LoadedGroup[] = [
        {
          id: "group-1",
          stop_processing: false,
          rules: [
            {
              id: "small-rule",
              title: "Small payment",
              kind: "deterministic",
              trigger_moment: "create",
              is_active: true,
              sort_order: 0,
              strict_mode: true,
              rule_triggers: [{ field: "amount", operator: "less_than", value: "500" }],
              rule_actions: [{ action_type: "set_category", action_value: "food" }],
            },
            {
              id: "large-rule",
              title: "Large payment",
              kind: "deterministic",
              trigger_moment: "create",
              is_active: true,
              sort_order: 1,
              strict_mode: true,
              rule_triggers: [{ field: "amount", operator: "greater_than", value: "500" }],
              rule_actions: [{ action_type: "set_category", action_value: "shopping" }],
            },
          ],
        },
      ];
      const result = applyLoadedStatementRules(
        groups,
        [
          { pattern: "SHARED", description: "SHARED", amount: 100, type: "expense" },
          { pattern: "SHARED", description: "SHARED", amount: 900, type: "expense" },
        ],
        new Map([
          ["food", "Food Delivery"],
          ["shopping", "Shopping"],
        ]),
      );

      expect(result.resolved.SHARED.category).toBeNull();
      expect(result.resolved.SHARED.requiresReview).toBe(true);
      expect(result.conflictedPatterns.has("SHARED")).toBe(true);
    });

    it("uses verified embedding category IDs and leaves identity-only matches pending", () => {
      const index = buildCategoryIndex([
        { id: "software", name: "Software & Apps", kind: "expense", parent_id: null },
      ]);
      expect(
        resolveVerifiedEntityCategory(
          { categoryId: "software", categoryKey: null },
          index,
          "expense",
        )?.name,
      ).toBe("Software & Apps");
      expect(
        resolveVerifiedEntityCategory({ categoryId: null, categoryKey: null }, index, "expense"),
      ).toBeNull();
      expect(
        resolveVerifiedEntityCategory(
          { categoryId: null, categoryKey: "unknown-key" },
          index,
          "expense",
        ),
      ).toBeNull();
    });

    it("does not map income keys into expense categories", () => {
      const index = buildCategoryIndex([
        { id: "wrong", name: "Income", kind: "expense", parent_id: null },
        { id: "salary", name: "Salary & Income", kind: "income", parent_id: null },
      ]);
      expect(resolveCategoryKey("salary_income", index, "income")?.id).toBe("salary");
    });

    it("bounds household instructions to the prompt budget", () => {
      const context = buildClassificationContext({
        categoryNames: ["Food Delivery", "Groceries", "Salary & Income"],
        ruleInstructions: Array.from(
          { length: 20 },
          (_, index) => `Rule ${index}: ${"x".repeat(300)}`,
        ),
        maxChars: 900,
      });
      expect(JSON.stringify(context).length).toBeLessThanOrEqual(900);
      expect(context.truncated).toBe(true);
    });

    it("allows manual AI to abstain and rejects weak assignments", () => {
      const assignments = parseManualCategoryAssignments(
        {
          results: [
            { index: 0, category_name: "Food Delivery", confidence: 0.92 },
            { index: 1, category_name: "Shopping", confidence: 0.6 },
            { index: 2, category_name: null, confidence: 0.2 },
          ],
        },
        ["Food Delivery", "Shopping"],
        3,
      );
      expect(assignments[0]?.category).toBe("Food Delivery");
      expect(assignments[1]).toBe(undefined);
      expect(assignments[2]).toBe(undefined);
    });
  });
}
