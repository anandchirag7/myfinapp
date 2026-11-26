import { describe, expect, it } from "./test-framework";
import {
  allocateCardPayments,
  buildImportReviewGroups,
  rankReviewGroups,
  type CardPaymentLeg,
} from "../lib/statement-account-reconciliation";

const leg = (overrides: Partial<CardPaymentLeg>): CardPaymentLeg => ({
  id: crypto.randomUUID(),
  accountId: "savings",
  accountCategory: "bank",
  direction: "debit",
  amount: 1_000,
  date: "2026-09-10",
  reference: null,
  destinationAccountId: null,
  ...overrides,
});

export function registerStatementAccountReconciliationTests() {
  describe("Multi-account and card-payment reconciliation", () => {
    it("matches five card bills paid from one savings account without crossing cards", () => {
      const sources = [1, 2, 3, 4, 5].map((n) =>
        leg({ id: `bank-${n}`, amount: n * 1_111, destinationAccountId: `card-${n}` }),
      );
      const targets = [5, 3, 1, 4, 2].map((n) =>
        leg({
          id: `card-credit-${n}`,
          accountId: `card-${n}`,
          accountCategory: "credit_card",
          direction: "credit",
          amount: n * 1_111,
          date: "2026-09-12",
        }),
      );
      const result = allocateCardPayments(sources, targets);
      expect(result.matches.length).toBe(5);
      for (const match of result.matches) {
        expect(match.targetAccountId).toBe(match.destinationAccountId);
      }
      expect(result.ambiguous.length).toBe(0);
    });

    it("never guesses when identical payments could belong to two cards", () => {
      const result = allocateCardPayments(
        [leg({ id: "bank-payment", amount: 5_000 })],
        [
          leg({
            id: "card-a",
            accountId: "card-a",
            accountCategory: "credit_card",
            direction: "credit",
            amount: 5_000,
          }),
          leg({
            id: "card-b",
            accountId: "card-b",
            accountCategory: "credit_card",
            direction: "credit",
            amount: 5_000,
          }),
        ],
      );
      expect(result.matches.length).toBe(0);
      expect(result.ambiguous).toEqual([
        { sourceId: "bank-payment", candidateTargetIds: ["card-a", "card-b"] },
      ]);
    });

    it("uses a strong bank reference before date proximity", () => {
      const result = allocateCardPayments(
        [leg({ id: "source", amount: 9_999, reference: "CRED-ABC" })],
        [
          leg({
            id: "near",
            accountId: "card-1",
            accountCategory: "credit_card",
            direction: "credit",
            amount: 9_999,
            date: "2026-09-10",
            reference: "OTHER",
          }),
          leg({
            id: "referenced",
            accountId: "card-2",
            accountCategory: "credit_card",
            direction: "credit",
            amount: 9_999,
            date: "2026-09-13",
            reference: "CRED-ABC",
          }),
        ],
      );
      expect(result.matches[0]?.targetId).toBe("referenced");
    });

    it("supports one payment allocated across multiple cards only when amounts close exactly", () => {
      const result = allocateCardPayments(
        [leg({ id: "source", amount: 10_000 })],
        [
          leg({
            id: "card-a",
            accountId: "card-a",
            accountCategory: "credit_card",
            direction: "credit",
            amount: 6_000,
          }),
          leg({
            id: "card-b",
            accountId: "card-b",
            accountCategory: "credit_card",
            direction: "credit",
            amount: 4_000,
          }),
        ],
        { allowSplit: true },
      );
      expect(result.matches.map((m) => m.allocatedAmount)).toEqual([6_000, 4_000]);
      expect(result.unmatchedSourceIds.length).toBe(0);
    });

    it("consumes each card-statement credit at most once", () => {
      const result = allocateCardPayments(
        [leg({ id: "source-a", amount: 2_000 }), leg({ id: "source-b", amount: 2_000 })],
        [
          leg({
            id: "target",
            accountId: "card",
            accountCategory: "credit_card",
            direction: "credit",
            amount: 2_000,
          }),
        ],
      );
      expect(result.matches.length).toBe(1);
      expect(result.unmatchedSourceIds.length).toBe(1);
    });

    it("groups unresolved rows into non-blocking review work", () => {
      const groups = buildImportReviewGroups([
        { id: "1", economicType: "UNKNOWN", pattern: "ACME", amount: 100, direction: "credit" },
        { id: "2", economicType: "UNKNOWN", pattern: "ACME", amount: 200, direction: "credit" },
        {
          id: "3",
          economicType: "CREDIT_CARD_PAYMENT",
          pattern: "CRED",
          amount: 50_000,
          direction: "debit",
          destinationAccountId: null,
        },
      ]);
      expect(groups.length).toBe(2);
      expect(groups.every((group) => group.blocking === false)).toBe(true);
      expect(rankReviewGroups(groups)[0]?.reviewType).toBe("destination_card");
    });
  });
}
