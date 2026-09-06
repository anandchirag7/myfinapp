import { describe, expect, it } from "./test-framework";
import {
  buildTransactionEditPatch,
  isMeaningfulMerchantChange,
  normalizeTags,
  patchRequiresBalanceRecompute,
  transactionToEditValues,
  validateTransactionEdit,
} from "../lib/transaction-edit";

export function registerTransactionEditTests() {
  describe("Complete transaction edit model", () => {
    const base = transactionToEditValues({
      type: "expense", amount: 100, txn_date: "2026-09-04", account_id: "account-1",
      category_id: "category-1", merchant: "Coffee Shop", tags: ["food"],
    });

    it("normalizes a transaction into complete form values", () => {
      expect(base.amount).toBe("100");
      expect(base.cleared_status).toBe("pending");
      expect(base.transfer_account_id).toBeNull();
    });

    it("builds a minimal normalized patch", () => {
      const patch = buildTransactionEditPatch(base, { ...base, merchant: "  Blue Tokai  ", tags: ["food", "Food", " cafe "] });
      expect(patch).toEqual({ merchant: "Blue Tokai", tags: ["food", "cafe"] });
    });

    it("clears incompatible category and destination values when type changes", () => {
      const transferPatch = buildTransactionEditPatch(base, { ...base, type: "transfer", transfer_account_id: "account-2" });
      expect(transferPatch.category_id).toBeNull();
      const expensePatch = buildTransactionEditPatch(
        { ...base, type: "transfer", category_id: null, transfer_account_id: "account-2" },
        { ...base, type: "expense", transfer_account_id: "account-2" },
      );
      expect(expensePatch.transfer_account_id).toBeNull();
    });

    it("detects meaningful merchant changes but ignores case and whitespace", () => {
      expect(isMeaningfulMerchantChange("Blue Tokai", " blue tokai ")).toBe(false);
      expect(isMeaningfulMerchantChange("Blue Tokai", "Starbucks")).toBe(true);
    });

    it("validates amount, dates, transfers, and category compatibility", () => {
      const invalid = validateTransactionEdit({ ...base, amount: "0", txn_date: "bad", type: "transfer", transfer_account_id: "account-1" });
      expect(invalid.amount).toBeDefined();
      expect(invalid.txn_date).toBeDefined();
      expect(invalid.transfer_account_id).toBeDefined();
      expect(validateTransactionEdit(base, "income").category_id).toBeDefined();
    });

    it("deduplicates and bounds tags", () => {
      expect(normalizeTags([" Food ", "food", "x"])).toEqual(["Food", "x"]);
      expect(normalizeTags(Array.from({ length: 40 }, (_, i) => `t${i}`)).length).toBe(30);
    });

    it("identifies patches that affect balances", () => {
      expect(patchRequiresBalanceRecompute({ memo: "note" })).toBe(false);
      expect(patchRequiresBalanceRecompute({ amount: 200 })).toBe(true);
      expect(patchRequiresBalanceRecompute({ account_id: "new" })).toBe(true);
    });
  });
}
