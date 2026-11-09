# P0 - Supabase Disk I/O And Database Performance

STATUS: INVESTIGATION COMPLETE - I/O BUDGET RECOVERED; MICRO CAPACITY RISK REMAINS

DATE: 9 NOVEMBER 2026

## Scope And Safety

- Production was investigated read-only through Supabase Observability,
  Infrastructure, bounded database statistics and Vercel request evidence.
- No booking, payment, seating, ticket, financial or historical record changed.
- No migration, maintenance operation, cache, application deployment or compute
  change was applied.
- The earlier Supabase outage is not attributed to Disk I/O. Provider health
  evidence established that incident separately; the available evidence does
  not prove Disk I/O caused it.

## Current Production Position

- Supabase project `zingara` (`jekxwtvdskacsyjhhnzd`) is `ACTIVE_HEALTHY` on
  Micro compute in `eu-west-3`.
- The live Infrastructure view showed Disk I/O Balance at 99%. Supabase defines
  100% as a full burst balance and 0% as exhausted, so the earlier near-depletion
  warning has recovered.
- Current three-hour database observations were approximately 7 IOPS and
  335.7 KB/s disk throughput, well below Micro's 500 IOPS and 11 MB/s sustained
  baselines. There were no blocked queries and no material application query
  outlier after the provider restart.
- Database and index cache hit rates were both 99%. The database was 817 MB,
  including 323 MB of indexes and 313 MB of table data, on the included 8 GB
  disk. WAL was 128 MB.
- Connections were 26-30 of 60. The live project card ranged from 31-48% CPU
  and 76-86% RAM. Database reporting also showed 860.87 MB current memory and
  1.78 GB committed memory, classed `SEVERE` by Supabase.
- The last-24-hour project view showed approximately 607,861 requests at 99.1%
  success. The error spike includes the already resolved provider outage.

## Workload Findings

- `pg_stat_statements` showed no disk-bound application query and zero reported
  synchronous I/O time in the leading statements after restart. No index
  addition or query rewrite is supported by the evidence.
- The most frequent bounded application statement was a narrow
  `shows(id,notes)` read: 2,424 calls and 3.305 seconds total execution time. It
  is frequent but inexpensive and was not a disk-I/O outlier.
- Active Admin browsers continuously refresh notifications, maintenance state,
  edit locks and staff presence. Existing visibility-aware polling already
  stops most refreshes in background tabs; edit-lock heartbeats are required
  for concurrency safety.
- Platform telemetry has measurable write amplification: each accepted
  telemetry request performs two database-backed rate-limit updates and then an
  event insert or session upsert. Since restart, `platform_rate_limits` recorded
  506 updates and 507 dead tuples; `platform_sessions` recorded 127 updates and
  127 dead tuples.
- The telemetry/rate-limit tables dominate allocated database space despite a
  small current live-row estimate: `platform_events` 322 MB,
  `platform_rate_limits` 117 MB, `audit_events` 90 MB and
  `platform_sessions` 25 MB. The bloat estimator identified only a minority as
  reclaimable waste, so disruptive `VACUUM FULL` or index rebuilding is not
  justified.
- These are confirmed sources of ongoing database churn, not a proven cause of
  the earlier outage or the historic I/O-budget drop. Current I/O and query
  evidence shows no active runaway loop.

## Decision

- No application change was deployed. Reducing safety-critical rate limiting,
  presence, notification freshness or edit-lock heartbeats without a measured
  bottleneck would be speculative and could weaken operational safeguards.
- No stale caching was introduced for bookings, availability, capacity,
  seating, payments or financial data.
- No new index was added: current plans, execution times and 99% cache-hit rates
  do not justify the write/storage cost.
- No database maintenance was run. Normal autovacuum remains the safe mechanism
  for dead-tuple reuse.

## Compute Assessment

- Micro provides 1 GB RAM, 60 database connections, 500 baseline IOPS and
  11 MB/s baseline throughput at `$0.01344/hour` (about `$10/month`).
- Small provides 2 GB RAM, 90 database connections, 1,000 baseline IOPS and
  22 MB/s baseline throughput at `$0.0206/hour` (about `$15/month`).
- The approximate increase is `$0.00716/hour`, or `$5.23/month` at 730 hours.
- Small is recommended as the next safe Production tier because it doubles RAM,
  sustained IOPS and sustained throughput while increasing connection headroom.
  The recommendation is driven principally by repeated 76-86% memory use and
  severe memory commitment, not by current query latency.
- The upgrade is not required to clear the present I/O warning: the balance has
  already recovered to 99%. It is recommended for resilience before the next
  traffic or provider-recovery burst. No billing change was made because explicit
  approval is required.

## Remaining Risk And Follow-up

- Disk I/O risk is currently controlled: balance 99%, low current throughput,
  low IOPS, 99% cache hits, no blocking and no slow application outlier.
- Overall Production headroom is not fully resolved while Micro memory remains
  near its limit. Approve Micro-to-Small separately if the additional estimated
  `$5.23/month` is acceptable.
- Continue observing the seven-day Disk I/O Balance and memory trend. Reopen
  application optimisation only if a repeatable endpoint/query correlates with
  another balance decline; do not infer causation from request volume alone.

## Release Evidence

- Application commit: none.
- Migration: none.
- Deployment: none required.
- Infrastructure change: none.
- Business-data delta: zero.

