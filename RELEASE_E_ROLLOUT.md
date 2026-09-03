# Release E rollout and rollback

Release E uses deterministic household buckets. A household remains in the same canary cohort when
the percentage changes.

## Start at 5 percent

```sql
select public.set_statement_feature_rollout('resolver_v2', true, 5, true, false);
select public.set_statement_feature_rollout('web_enrichment', true, 5, true, false);
```

Review `statement_rollout_metrics`, then increase to 25, 50, and 100. Web enrichment remains
shadow-only regardless of rollout percentage.

```sql
select feature, count(*) samples,
  avg(candidate_resolved - baseline_resolved) resolved_lift,
  avg(blocking_count) blocking_decisions,
  sum(failure_count) failures
from public.statement_rollout_metrics
where created_at > now() - interval '7 days'
group by feature;
```

## Immediate database rollback

```sql
select public.set_statement_feature_rollout('resolver_v2', false, 0, true, true);
select public.set_statement_feature_rollout('web_enrichment', false, 0, true, true);
```

The deployment-level emergency switches take precedence over database configuration:

```env
STATEMENT_RESOLVER_V2_KILL_SWITCH=true
STATEMENT_WEB_KILL_SWITCH=true
```
