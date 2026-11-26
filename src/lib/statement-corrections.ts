import type { EconomicType } from "./statement-domain";
import type { EconomicResolution } from "./statement-economic-resolver";

export const CORRECTION_SCOPES = ["transaction", "future", "existing_future"] as const;
export type CorrectionScope = (typeof CORRECTION_SCOPES)[number];

export type EconomicCorrectionRule = {
  normalizedPattern: string;
  direction: "debit" | "credit";
  economicType: EconomicType;
};

export function economicCorrectionKey(
  normalizedPattern: string,
  direction: "debit" | "credit",
): string {
  return `${normalizedPattern.trim().toUpperCase()}\u0000${direction}`;
}

export function applyEconomicCorrection(
  current: EconomicResolution,
  rule: EconomicCorrectionRule | undefined,
): EconomicResolution {
  if (!rule) return current;
  // Deterministic bank semantics stay protected if an older household rule
  // happens to share a normalized narration pattern.
  if (current.source === "deterministic" && !current.requiresReview) return current;
  return {
    ...current,
    economicType: rule.economicType,
    confidence: 1,
    source: "user_confirmed_rule",
    ruleId: "household-economic-correction",
    reasons: ["A household correction matched this narration pattern and direction."],
    requiresReview: false,
  };
}
