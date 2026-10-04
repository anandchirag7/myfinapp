import { describe, expect, it } from "./test-framework";
import {
  buildTransferEvidenceDescriptor,
  canonicalTransferAccounts,
  classifyTransferIntent,
  matchCanonicalTransfer,
  transactionTypeForExternalDecision,
  transferPerspective,
  transactionInsertFields,
  validateInternalTransfer,
} from "../lib/statement-transfers";

export function registerStatementTransferTests() {
  describe("Statement internal transfers", () => {
    it("does not classify an external bank rail or payee as an internal transfer", () => {
      expect(
        classifyTransferIntent({
          direction: "debit",
          eventType: "transfer",
          counterpartyKind: "business",
          rememberedAccountId: null,
        }),
      ).toBe("external");
      expect(
        classifyTransferIntent({
          direction: "debit",
          eventType: "purchase",
          counterpartyKind: "person",
          rememberedAccountId: null,
        }),
      ).toBe("external");
      expect(transactionTypeForExternalDecision("debit")).toBe("expense");
      expect(transactionTypeForExternalDecision("credit")).toBe("income");
    });

    it("asks about self transfers and confirms remembered account mappings", () => {
      expect(
        classifyTransferIntent({
          direction: "debit",
          eventType: "transfer",
          counterpartyKind: "self",
          rememberedAccountId: null,
        }),
      ).toBe("possible_internal");
      expect(
        classifyTransferIntent({
          direction: "credit",
          eventType: "transfer",
          counterpartyKind: "self",
          rememberedAccountId: "account-1",
        }),
      ).toBe("confirmed_internal");
    });

    it("orients outgoing and incoming statement legs into one canonical transfer", () => {
      expect(canonicalTransferAccounts("account-1", "account-2", "debit")).toEqual({
        sourceAccountId: "account-1",
        targetAccountId: "account-2",
      });
      expect(canonicalTransferAccounts("account-2", "account-1", "credit")).toEqual({
        sourceAccountId: "account-1",
        targetAccountId: "account-2",
      });
    });

    it("validates household transfer selections", () => {
      expect(validateInternalTransfer("account-1", null)).toBe("Select the other account.");
      expect(validateInternalTransfer("account-1", "account-1")).toBe(
        "Source and target accounts must differ.",
      );
      expect(validateInternalTransfer("account-1", "account-2")).toBeNull();
    });

    it("matches only one canonical opposite statement leg within the date tolerance", () => {
      const candidates = [
        {
          id: "transfer-1",
          sourceAccountId: "account-1",
          targetAccountId: "account-2",
          amount: 50_000,
          date: "2026-10-03",
        },
        {
          id: "other-pair",
          sourceAccountId: "account-9",
          targetAccountId: "account-2",
          amount: 50_000,
          date: "2026-10-03",
        },
      ];
      expect(
        matchCanonicalTransfer(candidates, {
          sourceAccountId: "account-1",
          targetAccountId: "account-2",
          amount: 50_000,
          date: "2026-10-05",
        }),
      ).toEqual({ status: "matched", transactionId: "transfer-1" });
    });

    it("requires review when multiple canonical transfers could match", () => {
      const candidates = ["a", "b"].map((id, index) => ({
        id,
        sourceAccountId: "account-1",
        targetAccountId: "account-2",
        amount: 50_000,
        date: `2026-10-0${3 + index}`,
      }));
      expect(
        matchCanonicalTransfer(candidates, {
          sourceAccountId: "account-1",
          targetAccountId: "account-2",
          amount: 50_000,
          date: "2026-10-04",
        }),
      ).toEqual({ status: "ambiguous", transactionIds: ["a", "b"] });
    });

    it("shows a debit in the source account and a credit in the target account", () => {
      expect(transferPerspective("account-1", "account-1", "account-2", 50_000)).toEqual({
        direction: "debit",
        signedAmount: -50_000,
        counterpartyAccountId: "account-2",
      });
      expect(transferPerspective("account-2", "account-1", "account-2", 50_000)).toEqual({
        direction: "credit",
        signedAmount: 50_000,
        counterpartyAccountId: "account-1",
      });
    });

    it("builds stable per-account evidence descriptors for idempotent reimports", () => {
      const first = buildTransferEvidenceDescriptor({
        accountId: "account-1",
        date: "2026-10-03",
        amount: 50_000,
        direction: "debit",
        description: " NEFT  OWN ACCOUNT 1234 ",
      });
      const second = buildTransferEvidenceDescriptor({
        accountId: "account-1",
        date: "2026-10-03",
        amount: 50_000,
        direction: "debit",
        description: "neft own account 1234",
      });
      expect(first).toBe(second);
    });

    it("keeps two otherwise-identical statement rows as distinct evidence", () => {
      const base = {
        accountId: "account-1",
        date: "2026-10-03",
        amount: 50_000,
        direction: "debit" as const,
        description: "NEFT OWN ACCOUNT",
      };
      expect(buildTransferEvidenceDescriptor({ ...base, rowKey: "row-7" })).not.toBe(
        buildTransferEvidenceDescriptor({ ...base, rowKey: "row-8" }),
      );
    });

    it("removes import-only metadata before inserting ordinary transactions", () => {
      const row = transactionInsertFields({
        txn_date: "2026-10-03",
        amount: 1250,
        type: "expense",
        note: "Merchant payment",
        normalized_pattern: "MERCHANT",
        statement_direction: "debit",
        statement_row_key: "row-12",
      });
      expect(Object.prototype.hasOwnProperty.call(row, "statement_direction")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(row, "statement_row_key")).toBe(false);
      expect(row.normalized_pattern).toBe("MERCHANT");
    });
  });
}
