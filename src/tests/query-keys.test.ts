import { describe, it, expect } from "./test-framework";
import { queryKeys } from "../lib/query-keys";

export function registerQueryKeysTests() {
  describe("Centralized Query Keys Factory", () => {
    it("generates structured categories cache keys", () => {
      expect(queryKeys.categories.all).toEqual(["categories"]);
      expect(queryKeys.categories.full()).toEqual(["categories", "full"]);
      expect(queryKeys.categories.list()).toEqual(["categories", "list"]);
      expect(queryKeys.categories.detail("cat_123")).toEqual(["categories", "detail", "cat_123"]);
    });

    it("generates structured accounts cache keys", () => {
      expect(queryKeys.accounts.all).toEqual(["accounts"]);
      expect(queryKeys.accounts.list()).toEqual(["accounts", "list"]);
      expect(queryKeys.accounts.detail("acc_999")).toEqual(["accounts", "detail", "acc_999"]);
    });

    it("generates filter-scoped transactions cache keys", () => {
      const filter = { accountId: "acc_1", type: "expense" };
      const key = queryKeys.transactions.rich(filter);

      expect(key[0]).toBe("transactions");
      expect(key[1]).toBe("rich");
      expect(key[2]).toEqual(filter);
    });

    it("generates time-scoped reports cache keys", () => {
      const from = "2026-04-01";
      const to = "2026-04-30";
      const key = queryKeys.reports.data(from, to, "user_1");

      expect(key[0]).toBe("reports");
      expect(key[1]).toEqual({ from, to, owner: "user_1" });
    });
  });
}
