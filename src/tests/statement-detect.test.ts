import { describe, it, expect } from "./test-framework";
import { formatOf, humanSize, inspectStatementFile } from "../lib/statement-detect";

export function registerStatementDetectTests() {
  describe("Statement Detection & Bank Fingerprinting", () => {
    it("determines file format accurately by extension", () => {
      const csvFile = new File(["test"], "statement.csv");
      const xlsxFile = new File(["test"], "statement.xlsx");
      const ofxFile = new File(["test"], "export.ofx");
      const pdfFile = new File(["test"], "invoice.pdf");

      expect(formatOf(csvFile)).toBe("csv");
      expect(formatOf(xlsxFile)).toBe("xlsx");
      expect(formatOf(ofxFile)).toBe("ofx");
      expect(formatOf(pdfFile)).toBe("pdf");
    });

    it("formats human-readable file sizes correctly", () => {
      expect(humanSize(500)).toBe("500 B");
      expect(humanSize(2048)).toBe("2.0 KB");
      expect(humanSize(5 * 1024 * 1024)).toBe("5.00 MB");
    });

    it("identifies HDFC Bank CSV statements accurately", async () => {
      const csvContent = `Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n01/04/2026,UPI-SWIGGY-123456@hdfcbank,REF123,01/04/2026,450.00,,52300.00\n02/04/2026,SALARY-TECH-M,REF124,02/04/2026,,120000.00,172300.00`;
      const file = new File([csvContent], "HDFC_Savings_Apr2026.csv", { type: "text/csv" });

      const result = await inspectStatementFile(file);

      expect(result.format).toBe("csv");
      expect(result.bank).toBe("HDFC Bank");
      expect(result.bankConfidence).toBeGreaterThanOrEqual(0.6);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.issues.some((i) => i.level === "error")).toBeFalsy();
    });

    it("identifies SBI statements from narration signatures", async () => {
      const csvContent = `Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance\n02-Apr-2026,02-Apr-2026,TRANSFER TO SBIN0001234,REF999,1200.00,,98000.00`;
      const file = new File([csvContent], "sbi_account_statement.csv", { type: "text/csv" });

      const result = await inspectStatementFile(file);

      expect(result.format).toBe("csv");
      expect(result.bank).toBe("State Bank of India");
      expect(result.bankConfidence).toBeGreaterThan(0.5);
    });

    it("identifies ICICI Bank statements and currency", async () => {
      const csvContent = `Transaction Date,Value Date,Cheque Number,Transaction Remarks,Withdrawal Amount (INR ),Deposit Amount (INR ),Balance (INR )\n05/04/2026,05/04/2026,,UPI/ICIC0000001/AMZN/pay,500.00,,24000.00`;
      const file = new File([csvContent], "ICICI_OpTransactionHistory.csv", { type: "text/csv" });

      const result = await inspectStatementFile(file);

      expect(result.format).toBe("csv");
      expect(result.bank).toBe("ICICI Bank");
      expect(result.currency).toBe("INR");
    });

    it("flags empty statements with error", async () => {
      const file = new File([], "empty.csv", { type: "text/csv" });
      const result = await inspectStatementFile(file);

      expect(result.issues.some((i) => i.code === "empty")).toBeTruthy();
      expect(result.confidence).toBe(0);
    });
  });
}
