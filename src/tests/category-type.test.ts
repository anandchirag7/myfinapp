import { describe, expect, it } from "./test-framework";
import { getCategoryTypeLabel, resolveCategoryType, resolveSplitCategoryType } from "../lib/category-type";

export function registerCategoryTypeTests() {
  describe("Category type display resolution", () => {
    for (const kind of ["income", "expense", "transfer", "investment"] as const) {
      it(`uses the explicit ${kind} category kind`, () => {
        expect(resolveCategoryType({ type: "expense", amount: 100, category: { kind } })).toEqual({ kind, inferred: false });
      });
    }

    it("infers expense from normalized debit direction even with a positive stored amount", () => {
      expect(resolveCategoryType({ type: "expense", amount: 250, category: null })).toEqual({ kind: "expense", inferred: true });
    });

    it("infers income and transfer from transaction direction", () => {
      expect(resolveCategoryType({ type: "income", amount: 250 })).toEqual({ kind: "income", inferred: true });
      expect(resolveCategoryType({ type: "transfer", amount: 250 })).toEqual({ kind: "transfer", inferred: true });
    });

    it("uses signed legacy amounts only when direction is unavailable", () => {
      expect(resolveCategoryType({ amount: -10 })).toEqual({ kind: "expense", inferred: true });
      expect(resolveCategoryType({ amount: 10 })).toEqual({ kind: "income", inferred: true });
    });

    it("returns an unknown display for zero, invalid, and unsupported values", () => {
      expect(resolveCategoryType({ amount: 0 }).kind).toBeNull();
      expect(resolveCategoryType({ amount: "not-a-number", type: "other", category: { kind: "other" } }).kind).toBeNull();
      expect(getCategoryTypeLabel(resolveCategoryType({ amount: 0 }))).toBe("—");
    });

    it("resolves uniform and mixed split category types", () => {
      const parent = { type: "expense", amount: 300 };
      expect(resolveSplitCategoryType(parent, [
        { type: "expense", amount: 100, category: { kind: "investment" } },
        { type: "expense", amount: 200, category: { kind: "investment" } },
      ])).toEqual({ kind: "investment", inferred: false });
      expect(resolveSplitCategoryType(parent, [
        { type: "expense", amount: 100, category: { kind: "expense" } },
        { type: "expense", amount: 200, category: { kind: "investment" } },
      ])).toEqual({ kind: "mixed", inferred: true });
    });

    it("falls back to the parent direction when a split has no usable type", () => {
      expect(resolveSplitCategoryType({ type: "expense", amount: 300 }, [{ amount: 0, category: null }]))
        .toEqual({ kind: "expense", inferred: true });
    });
  });
}
