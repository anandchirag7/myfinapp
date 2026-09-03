import {
  decideStatementRollout,
  type RolloutConfig,
  type StatementFeature,
} from "./statement-rollout";

const DEFAULTS: Record<StatementFeature, RolloutConfig> = {
  resolver_v2: {
    feature: "resolver_v2",
    enabled: true,
    rolloutPercent: 5,
    shadow: true,
    rollback: false,
  },
  web_enrichment: {
    feature: "web_enrichment",
    enabled: true,
    rolloutPercent: 5,
    shadow: true,
    rollback: false,
  },
};

export async function loadStatementRollouts(admin: any, householdId: string) {
  const { data } = await admin
    .from("statement_feature_rollouts")
    .select("feature, enabled, rollout_percent, shadow, rollback")
    .in("feature", ["resolver_v2", "web_enrichment"]);
  const configs = {
    resolver_v2: { ...DEFAULTS.resolver_v2 },
    web_enrichment: { ...DEFAULTS.web_enrichment },
  };
  for (const row of data ?? []) {
    const feature = row.feature as StatementFeature;
    if (!configs[feature]) continue;
    configs[feature] = {
      feature,
      enabled: !!row.enabled,
      rolloutPercent: Number(row.rollout_percent),
      shadow: !!row.shadow,
      rollback: !!row.rollback,
    };
  }
  if (process.env.STATEMENT_RESOLVER_V2_KILL_SWITCH === "true") configs.resolver_v2.rollback = true;
  if (process.env.STATEMENT_WEB_KILL_SWITCH === "true") configs.web_enrichment.rollback = true;
  return {
    resolver: decideStatementRollout(configs.resolver_v2, householdId),
    web: decideStatementRollout(configs.web_enrichment, householdId),
  };
}

export async function recordStatementRolloutMetric(
  admin: any,
  metric: {
    householdId: string;
    uploadId: string;
    feature: StatementFeature;
    active: boolean;
    shadow: boolean;
    baselineResolved: number;
    candidateResolved: number;
    blockingCount: number;
    failures: number;
  },
) {
  await admin.from("statement_rollout_metrics").insert({
    household_id: metric.householdId,
    upload_id: metric.uploadId,
    feature: metric.feature,
    active: metric.active,
    shadow: metric.shadow,
    baseline_resolved: metric.baselineResolved,
    candidate_resolved: metric.candidateResolved,
    blocking_count: metric.blockingCount,
    failure_count: metric.failures,
    resolver_version: "3.0.0",
  });
}
