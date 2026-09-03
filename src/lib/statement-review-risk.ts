export type ReviewDecision = {
  identityResolved: boolean;
  categoryResolved: boolean;
  transactionTypeResolved: boolean;
  confidence: number;
  conflict?: "identity" | "category" | "duplicate" | "reversal" | "own_account" | null;
  personLike?: boolean;
};

export type ReviewRisk = "auto" | "deferred" | "blocking";

/** Newness never blocks. Only genuine conflicts and unknown identity do. */
export function reviewRisk(decision: ReviewDecision): ReviewRisk {
  if (decision.conflict) return "blocking";
  if (!decision.identityResolved) return "blocking";
  if (decision.personLike && !decision.categoryResolved) return "deferred";
  if (!decision.categoryResolved || !decision.transactionTypeResolved || decision.confidence < 0.85)
    return "deferred";
  return "auto";
}

export function summarizeReviewRisk(decisions: ReviewDecision[]) {
  const summary = {
    identityResolved: 0,
    categoryResolved: 0,
    transactionTypeResolved: 0,
    blocking: 0,
    deferred: 0,
    auto: 0,
  };
  for (const decision of decisions) {
    if (decision.identityResolved) summary.identityResolved++;
    if (decision.categoryResolved) summary.categoryResolved++;
    if (decision.transactionTypeResolved) summary.transactionTypeResolved++;
    summary[reviewRisk(decision)]++;
  }
  return summary;
}
