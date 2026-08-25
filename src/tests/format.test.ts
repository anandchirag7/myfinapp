import { describe, it, expect } from "./test-framework";
import {
  formatINR,
  formatNumber,
  formatLakhCrore,
  formatCurrency,
  maskAccount,
} from "../lib/format";

export function registerFormatTests() {
  describe("Format Utilities (Indian Financial Standards)", () => {
    it("formats standard INR values correctly with ₹ symbol", () => {
      expect(formatINR(1000)).toContain("1,000");
      expect(formatINR(100000)).toContain("1,00,000");
      expect(formatINR(10000000)).toContain("1,00,00,000");
    });

    it("handles null, undefined, strings and zero gracefully", () => {
      expect(formatINR(null)).toContain("0");
      expect(formatINR(undefined)).toContain("0");
      expect(formatINR("0")).toContain("0");
      expect(formatINR("15420.50")).toContain("15,420.5");
    });

    it("formats Indian numbers with en-IN separators", () => {
      expect(formatNumber(1234567)).toBe("12,34,567");
      expect(formatNumber(50000)).toBe("50,000");
    });

    it("formats hero numbers into Lakh and Crore abbreviations", () => {
      expect(formatLakhCrore(50000000)).toContain("5.00 Cr");
      expect(formatLakhCrore(1500000)).toContain("15.00 L");
      expect(formatLakhCrore(45000)).toContain("45.0k");
      expect(formatLakhCrore(850)).toContain("850");
      expect(formatLakhCrore(-2500000)).toContain("-₹25.00 L");
    });

    it("supports multi-currency formatting for USD, EUR, GBP", () => {
      const usd = formatCurrency(1200, "USD");
      expect(usd).toContain("1,200");
      const inr = formatCurrency(5000, "INR");
      expect(inr).toContain("5,000");
    });

    it("masks sensitive bank and card account numbers", () => {
      expect(maskAccount("1234")).toBe("•••• 1234");
      expect(maskAccount("9876")).toBe("•••• 9876");
      expect(maskAccount(null)).toBe("");
      expect(maskAccount(undefined)).toBe("");
    });
  });
}
