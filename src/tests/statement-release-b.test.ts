import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "./test-framework";
import { extractRowsFromAOA } from "../lib/statement-parse.server";
import { extractLedgerControls, reconcileLedger } from "../lib/statement-ledger";
import { parseNarrationFingerprint, semanticMergeAllowed } from "../lib/statement-fingerprint";
import { linkReversalGroups, transactionTypeForFingerprint } from "../lib/statement-fingerprint";
import { normalizePattern } from "../lib/statement-normalize";
import { STATEMENT_RELEASE_B_GOLD } from "./fixtures/statement-release-b-gold";

export function registerStatementReleaseBTests() {
  describe("Statement import Release B", () => {
    it("reconciles the supplied HDFC ledger exactly", () => {
      const bytes = readFileSync(resolve("Acct_Statement_XXXXXXXX7576_05082026.xls"));
      const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
      const aoa = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: true,
        blankrows: false,
      }) as unknown[][];
      const transactions = extractRowsFromAOA(aoa);
      const result = reconcileLedger(transactions, extractLedgerControls(aoa));
      expect(transactions.length).toBe(572);
      expect(result.parsedDebitCount).toBe(506);
      expect(result.parsedCreditCount).toBe(66);
      expect(result.debitDelta).toBe(0);
      expect(result.creditDelta).toBe(0);
      expect(result.balanceDelta).toBe(0);
      expect(result.reconciled).toBe(true);
    });

    it("separates salary, self-transfer and purchase semantics", async () => {
      const salary = await parseNarrationFingerprint({
        raw: "NEFT CR-INTEL TECHNOLOGY INDIA-SALARY",
        direction: "credit",
        bankFormat: "HDFC",
        scopeSalt: "household",
        normalizedPattern: "INTEL TECHNOLOGY",
      });
      const self = await parseNarrationFingerprint({
        raw: "IB FUNDS TRANSFER CR-50100502103337-CHIRAG ANAND",
        direction: "credit",
        bankFormat: "HDFC",
        scopeSalt: "household",
        normalizedPattern: "CHIRAG ANAND",
        accountHolderTokens: ["CHIRAG", "ANAND"],
      });
      expect(salary.eventType).toBe("salary");
      expect(salary.counterpartyKind).toBe("employer");
      expect(self.eventType).toBe("transfer");
      expect(self.counterpartyKind).toBe("self");
      expect(semanticMergeAllowed(salary, self)).toBe(false);
    });

    it("requires stable identifiers before merging people", async () => {
      const make = (raw: string, pattern: string) =>
        parseNarrationFingerprint({
          raw,
          direction: "debit",
          bankFormat: "HDFC",
          scopeSalt: "household",
          normalizedPattern: pattern,
        });
      const alpha = await make("UPI-PERSON ALPHA-9000000001@YBL", "PERSON ALPHA");
      const beta = await make("UPI-PERSON BETA-9000000002@YBL", "PERSON BETA");
      expect(alpha.counterpartyKind).toBe("person");
      expect(semanticMergeAllowed(alpha, beta)).toBe(false);
    });

    it("preserves known merchant and event regressions", async () => {
      expect(normalizePattern("ACH D-TATA AIA LIFE-POLICY 123456")).toBe("TATA AIA");
      expect(normalizePattern("UPI-MEDIBUDDY-PG@YBL-REFUND")).toBe("MEDIBUDDY");
      expect(normalizePattern("POS MCDONALD'S BANGALORE")).toBe("MCDONALDS");
      expect(normalizePattern("NEFT-STATE BANK OF INDIA-TRANSFER")).toBe("STATE BANK OF INDIA");
      const refund = await parseNarrationFingerprint({
        raw: "UPI-MEDIBUDDY-PG@YBL-REFUND",
        direction: "credit",
        bankFormat: "HDFC",
        scopeSalt: "household",
        normalizedPattern: "MEDIBUDDY",
      });
      expect(refund.eventType).toBe("refund");
    });

    it("meets the 99.5% pairwise precision gate on the labelled corpus", async () => {
      const labelled = await Promise.all(
        STATEMENT_RELEASE_B_GOLD.map(async (item) => ({
          ...item,
          fingerprint: await parseNarrationFingerprint({
            raw: item.raw,
            direction: item.direction,
            bankFormat: "HDFC Bank",
            scopeSalt: "gold-household",
            normalizedPattern: item.pattern,
            accountHolderTokens: ["CHIRAG", "ANAND"],
          }),
        })),
      );
      for (const item of labelled) {
        expect(item.fingerprint.rail).toBe(item.rail);
        expect(item.fingerprint.eventType).toBe(item.event);
        expect(item.fingerprint.counterpartyKind).toBe(item.kind);
      }
      let predictedPairs = 0;
      let truePositivePairs = 0;
      for (let left = 0; left < labelled.length; left += 1) {
        for (let right = left + 1; right < labelled.length; right += 1) {
          const a = labelled[left]!;
          const b = labelled[right]!;
          const predicted =
            a.pattern === b.pattern && semanticMergeAllowed(a.fingerprint, b.fingerprint);
          if (!predicted) continue;
          predictedPairs += 1;
          if (a.cluster === b.cluster) truePositivePairs += 1;
        }
      }
      const precision = predictedPairs ? truePositivePairs / predictedPairs : 1;
      expect(predictedPairs).toBeGreaterThan(0);
      expect(precision).toBeGreaterThanOrEqual(0.995);
    });

    it("keeps transaction type independent and links reversals without row loss", async () => {
      const debitFingerprint = await parseNarrationFingerprint({
        raw: "ACH D-ADOBE-AUTOPAY",
        direction: "debit",
        bankFormat: "HDFC",
        scopeSalt: "household",
        normalizedPattern: "ADOBE",
      });
      const creditFingerprint = await parseNarrationFingerprint({
        raw: "ACH C-ADOBE-RETURN",
        direction: "credit",
        bankFormat: "HDFC",
        scopeSalt: "household",
        normalizedPattern: "ADOBE",
      });
      const rows = [
        {
          date: "2026-08-01",
          amount: 999,
          type: transactionTypeForFingerprint(debitFingerprint),
          pattern: "ADOBE",
          fingerprint: debitFingerprint,
          reversal_group_id: undefined as string | undefined,
        },
        {
          date: "2026-08-02",
          amount: 999,
          type: transactionTypeForFingerprint(creditFingerprint),
          pattern: "ADOBE",
          fingerprint: creditFingerprint,
          reversal_group_id: undefined as string | undefined,
        },
      ];
      linkReversalGroups(rows);
      expect(rows.length).toBe(2);
      expect(rows[0].reversal_group_id).toBeDefined();
      expect(rows[1].reversal_group_id).toBe(rows[0].reversal_group_id);
    });
  });
}
