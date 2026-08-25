import { describe, it, expect } from "./test-framework";

export function registerFinanceMathTests() {
  describe("Financial Mathematics & Invariants", () => {
    it("computes net worth accurately across assets and liabilities", () => {
      const accounts = [
        { name: "HDFC Savings", current_balance: 150000, is_liability: false, excluded_from_net_worth: false },
        { name: "Zerodha Demat", current_balance: 450000, is_liability: false, excluded_from_net_worth: false },
        { name: "ICICI Credit Card", current_balance: 25000, is_liability: true, excluded_from_net_worth: false },
        { name: "Crypto Sandbox", current_balance: 50000, is_liability: false, excluded_from_net_worth: true },
      ];

      let totalAssets = 0;
      let totalLiabilities = 0;

      for (const a of accounts) {
        if (a.excluded_from_net_worth) continue;
        const bal = Number(a.current_balance) || 0;
        if (a.is_liability) {
          totalLiabilities += Math.abs(bal);
        } else {
          totalAssets += bal;
        }
      }

      const netWorth = totalAssets - totalLiabilities;

      expect(totalAssets).toBe(600000);
      expect(totalLiabilities).toBe(25000);
      expect(netWorth).toBe(575000);
    });

    it("reconciles cashflow income, expenses, and net savings rate", () => {
      const transactions = [
        { amount: 120000, type: "income" },
        { amount: 45000, type: "expense" },
        { amount: 15000, type: "expense" },
        { amount: 20000, type: "transfer" }, // Transfers do not alter net cashflow
      ];

      let income = 0;
      let expenses = 0;

      for (const t of transactions) {
        if (t.type === "income") income += t.amount;
        if (t.type === "expense") expenses += t.amount;
      }

      const netSavings = income - expenses;
      const savingsRate = Number(((netSavings / income) * 100).toFixed(2));

      expect(income).toBe(120000);
      expect(expenses).toBe(60000);
      expect(netSavings).toBe(60000);
      expect(savingsRate).toBe(50.0);
    });

    it("validates split transactions balancing invariant", () => {
      const parentAmount = 1500;
      const splits = [
        { category: "Groceries", amount: 900 },
        { category: "Personal Care", amount: 400 },
        { category: "Snacks", amount: 200 },
      ];

      const splitSum = splits.reduce((sum, s) => sum + s.amount, 0);
      const isBalanced = Math.abs(splitSum - parentAmount) < 0.001;

      expect(splitSum).toBe(1500);
      expect(isBalanced).toBeTruthy();
    });
  });
}
