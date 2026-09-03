export type StatementFeature = "resolver_v2" | "web_enrichment";

export type RolloutConfig = {
  feature: StatementFeature;
  enabled: boolean;
  rolloutPercent: number;
  shadow: boolean;
  rollback: boolean;
};

export function householdRolloutBucket(householdId: string, feature: StatementFeature): number {
  let hash = 2166136261;
  for (const char of `${feature}:${householdId}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function decideStatementRollout(config: RolloutConfig, householdId: string) {
  const bucket = householdRolloutBucket(householdId, config.feature);
  const active =
    config.enabled &&
    !config.rollback &&
    bucket < Math.max(0, Math.min(100, config.rolloutPercent));
  return {
    feature: config.feature,
    active,
    shadow: config.shadow && !config.rollback,
    rollback: config.rollback,
    bucket,
    reason: config.rollback
      ? ("rollback" as const)
      : !config.enabled
        ? ("disabled" as const)
        : active
          ? ("canary" as const)
          : ("outside_canary" as const),
  };
}
