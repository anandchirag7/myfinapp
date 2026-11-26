import type { EconomicType } from "./statement-domain";

export type CardPaymentLeg = {
  id: string;
  accountId: string;
  accountCategory: string;
  direction: "debit" | "credit";
  amount: number;
  date: string;
  reference: string | null;
  destinationAccountId: string | null;
};

export type CardPaymentMatch = {
  sourceId: string;
  targetId: string;
  targetAccountId: string;
  destinationAccountId: string;
  allocatedAmount: number;
  confidence: number;
  method: "reference" | "account_amount_date" | "amount_date" | "split_amount";
};

export type CardPaymentAllocationResult = {
  matches: CardPaymentMatch[];
  ambiguous: Array<{ sourceId: string; candidateTargetIds: string[] }>;
  unmatchedSourceIds: string[];
  unmatchedTargetIds: string[];
};

export type ImportReviewCandidate = {
  id: string;
  economicType: EconomicType;
  pattern: string;
  amount: number;
  direction: "debit" | "credit";
  destinationAccountId?: string | null;
  reference?: string | null;
};

export type ImportReviewGroup = {
  reviewType: "economic_type" | "destination_card";
  groupKey: string;
  rowIds: string[];
  count: number;
  totalAmount: number;
  priority: number;
  blocking: false;
  prompt: string;
};

const DAY_MS = 86_400_000;

function dayDistance(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;
}

function normalizedReference(value: string | null): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

function candidateScore(source: CardPaymentLeg, target: CardPaymentLeg, windowDays: number) {
  if (source.direction !== "debit" || target.direction !== "credit") return null;
  if (target.accountCategory !== "credit_card" || !sameAmount(source.amount, target.amount))
    return null;
  const days = dayDistance(source.date, target.date);
  if (!Number.isFinite(days) || days > windowDays) return null;
  if (source.destinationAccountId && source.destinationAccountId !== target.accountId) return null;
  const sourceRef = normalizedReference(source.reference);
  const targetRef = normalizedReference(target.reference);
  const referenceMatch = sourceRef.length >= 5 && sourceRef === targetRef;
  const accountMatch = source.destinationAccountId === target.accountId;
  return {
    score: (referenceMatch ? 1_000 : 0) + (accountMatch ? 100 : 0) + (windowDays - days),
    confidence: referenceMatch ? 1 : accountMatch ? 0.97 : Math.max(0.82, 0.94 - days * 0.02),
    method: (referenceMatch
      ? "reference"
      : accountMatch
        ? "account_amount_date"
        : "amount_date") as CardPaymentMatch["method"],
  };
}

function exactSplit(
  amount: number,
  targets: CardPaymentLeg[],
  maxTargets = 10,
): CardPaymentLeg[] | null {
  const candidates = targets.slice(0, maxTargets);
  const solutions: CardPaymentLeg[][] = [];
  const walk = (index: number, remaining: number, picked: CardPaymentLeg[]) => {
    if (solutions.length > 1) return;
    if (Math.abs(remaining) < 0.005 && picked.length > 1) {
      solutions.push([...picked]);
      return;
    }
    if (remaining < 0 || index >= candidates.length) return;
    walk(index + 1, remaining, picked);
    picked.push(candidates[index]!);
    walk(index + 1, remaining - candidates[index]!.amount, picked);
    picked.pop();
  };
  walk(0, amount, []);
  return solutions.length === 1 ? solutions[0]! : null;
}

/** Deterministically pairs bank debits with card credits and leaves ties for review. */
export function allocateCardPayments(
  sources: CardPaymentLeg[],
  targets: CardPaymentLeg[],
  options: { windowDays?: number; allowSplit?: boolean } = {},
): CardPaymentAllocationResult {
  const windowDays = options.windowDays ?? 5;
  const available = new Map(targets.map((target) => [target.id, target]));
  const matches: CardPaymentMatch[] = [];
  const ambiguous: CardPaymentAllocationResult["ambiguous"] = [];
  const unmatchedSourceIds: string[] = [];

  for (const source of sources) {
    const ranked = [...available.values()]
      .map((target) => ({ target, rank: candidateScore(source, target, windowDays) }))
      .filter(
        (
          item,
        ): item is {
          target: CardPaymentLeg;
          rank: NonNullable<ReturnType<typeof candidateScore>>;
        } => !!item.rank,
      )
      .sort((a, b) => b.rank.score - a.rank.score || a.target.id.localeCompare(b.target.id));
    if (ranked.length) {
      const tied = ranked.filter((item) => item.rank.score === ranked[0]!.rank.score);
      if (tied.length > 1) {
        ambiguous.push({
          sourceId: source.id,
          candidateTargetIds: tied.map((item) => item.target.id),
        });
        continue;
      }
      const best = ranked[0]!;
      matches.push({
        sourceId: source.id,
        targetId: best.target.id,
        targetAccountId: best.target.accountId,
        destinationAccountId: best.target.accountId,
        allocatedAmount: source.amount,
        confidence: best.rank.confidence,
        method: best.rank.method,
      });
      available.delete(best.target.id);
      continue;
    }

    if (options.allowSplit) {
      const split = exactSplit(
        source.amount,
        [...available.values()].filter(
          (target) =>
            target.direction === "credit" &&
            target.accountCategory === "credit_card" &&
            dayDistance(source.date, target.date) <= windowDays &&
            (!source.destinationAccountId || source.destinationAccountId === target.accountId),
        ),
      );
      if (split) {
        for (const target of split) {
          matches.push({
            sourceId: source.id,
            targetId: target.id,
            targetAccountId: target.accountId,
            destinationAccountId: target.accountId,
            allocatedAmount: target.amount,
            confidence: 0.9,
            method: "split_amount",
          });
          available.delete(target.id);
        }
        continue;
      }
    }
    unmatchedSourceIds.push(source.id);
  }
  return { matches, ambiguous, unmatchedSourceIds, unmatchedTargetIds: [...available.keys()] };
}

export function buildImportReviewGroups(rows: ImportReviewCandidate[]): ImportReviewGroup[] {
  const grouped = new Map<string, ImportReviewGroup>();
  for (const row of rows) {
    const reviewType =
      row.economicType === "CREDIT_CARD_PAYMENT" &&
      row.direction === "debit" &&
      !row.destinationAccountId
        ? "destination_card"
        : row.economicType === "UNKNOWN"
          ? "economic_type"
          : null;
    if (!reviewType) continue;
    const pattern = row.pattern.trim() || "unknown";
    const cardIdentity =
      reviewType === "destination_card"
        ? `:${row.amount.toFixed(2)}:${normalizedReference(row.reference ?? null).slice(-16)}`
        : "";
    const groupKey = `${reviewType}:${row.direction}:${pattern}${cardIdentity}`.slice(0, 300);
    const current = grouped.get(groupKey) ?? {
      reviewType,
      groupKey,
      rowIds: [],
      count: 0,
      totalAmount: 0,
      priority: 0,
      blocking: false as const,
      prompt:
        reviewType === "destination_card"
          ? `Which card received the ${row.amount.toLocaleString("en-IN", { style: "currency", currency: "INR" })} payment matching ${pattern}?`
          : `How should transactions matching ${pattern} be treated?`,
    };
    current.rowIds.push(row.id);
    current.count++;
    current.totalAmount += Math.abs(row.amount);
    current.priority = Math.min(
      100,
      Math.round(25 + Math.log10(1 + current.totalAmount) * 12 + Math.min(current.count, 20)),
    );
    grouped.set(groupKey, current);
  }
  return [...grouped.values()];
}

export function rankReviewGroups(groups: ImportReviewGroup[], limit?: number): ImportReviewGroup[] {
  const ranked = [...groups].sort(
    (a, b) =>
      b.priority - a.priority ||
      b.totalAmount - a.totalAmount ||
      a.groupKey.localeCompare(b.groupKey),
  );
  return limit == null ? ranked : ranked.slice(0, Math.max(0, limit));
}
