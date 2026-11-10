# P0 - Supabase Disk I/O And Database Performance

STATUS: FOLLOW-UP COMPLETE - SMALL ACTIVE, PRODUCTION HEALTHY; MONITOR COMMITMENT

DATE: 9 NOVEMBER 2026

## Small Compute Follow-up Verification

- The Production project `zingara` (`jekxwtvdskacsyjhhnzd`) is
  `ACTIVE_HEALTHY` on Small compute in `eu-west-3`. The completed upgrade was
  verified only and was not repeated.
- Live project readings were 42-51% CPU, 55-59% RAM and 27-29 of 90 database
  connections. Disk usage was 1.10 GB of 8 GB and Disk I/O Balance was 99%.
  Small's 22 MB/s sustained throughput baseline is double Micro's 11 MB/s.
- Against the earlier Micro baseline, live RAM reduced from 76-86% to 55-59%
  and connection capacity increased from 60 to 90 while current connections
  remained effectively unchanged. Disk I/O Balance remained recovered at 99%.
- Database Observability for the last hour reported 1.57 GB memory use, 2.14 GB
  committed memory (`SEVERE`), 4.46% CPU and a 0.81 GB database. The project
  card and database commitment measure different layers; current use is healthy,
  but committed memory remains the principal capacity watch item.
- Query Performance reported 99.64% cache hits and 13 dashboard-labelled slow
  statements. No material application call exceeded one second: the leading
  Admin RPC `get_admin_booking_page` made 65 calls, 128 ms mean and 723 ms max.
  The narrow `shows(id,notes)` query made 6,464 calls at 1 ms mean and 23 ms
  max. Bounded database inspection found no blocking and no synchronous-I/O
  outlier.
- The Supabase UI retained a near-depletion warning banner although the live
  I/O balance was 99%. This is treated as historical/stale warning context, not
  evidence of current depletion; the seven-day balance trend should remain
  under observation.

## Service Verification

- The last-hour Vercel Functions view reported 8,400 invocations, 0.2% errors,
  zero timeouts, 36 ms active CPU P75, 284 MB average function memory, 549 ms
  TTFB P75 and 0.5% cold starts. This confirms the earlier 29x duration anomaly
  is not ongoing.
- Representative routes were healthy: `/api/platform-telemetry` 414 ms P75
  with 0% errors, `/api/admin/notifications` 677 ms P75 with 0% errors,
  `/book` 14 ms P75 with 0% errors and `/api/shows` 531 ms P75 with 0.4% errors.
  `/api/admin/waitlist` is a residual low-volume watch item at 3.86 s P75 across
  15 invocations, with no errors.
- Safe read-only HTTPS checks returned: `/admin` HTTP 200 in 0.773 s, `/book`
  HTTP 200 in 0.291 s, `/api/shows` HTTP 200 in 0.738 s and
  `/api/venue-settings` HTTP 200 in 0.383 s.
- Kaden's existing authorised Production session completed session restoration
  and loaded the full Admin calendar and staff controls. No login, permission or
  indefinite-restoration failure was observed.
- A GET to `/api/payfast/itn` returned HTTP 405 in 0.318 s, the expected result
  for the deployed POST-only callback route. No callback payload, transaction,
  booking or payment was created.
- Vercel showed both established schedules Active: review workflow at minutes
  7/22/37/52 (51 invocations, 6 s P75) and pre-show reminder every 15 minutes
  (51 invocations, 1 minute P75). No job or email was manually triggered.
- Current Production deployment `J3xBEALhAgKsXAYErn6zgTHgxBRz` is Ready and
  matches source `39f42c4`.

## Follow-up Decision

- Small is active and presently adequate for the observed workload. No further
  compute, billing, application, query, index or cache change is justified by
  current evidence.
- Monitor committed memory, the seven-day Disk I/O trend and the low-volume
  Waitlist route. Reopen optimisation only if a repeatable route or query
  correlates with increased errors, blocking or declining I/O balance.
- Verification was read-only. Application commit: none. Migration: none.
  Deployment: none. Business-data delta: zero.

## Scope And Safety

- Production was investigated read-only through Supabase Observability,
  Infrastructure, bounded database statistics and Vercel request evidence.
- No booking, payment, seating, ticket, financial or historical record changed.
- No migration, maintenance operation, cache, application deployment or compute
  change was applied.
- The earlier Supabase outage is not attributed to Disk I/O. Provider health
  evidence established that incident separately; the available evidence does
  not prove Disk I/O caused it.

## Earlier Micro Baseline

- During the pre-upgrade assessment, Supabase project `zingara`
  (`jekxwtvdskacsyjhhnzd`) was `ACTIVE_HEALTHY` on Micro compute in
  `eu-west-3`. This section is retained as the comparison baseline.
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

## Earlier Compute Recommendation

- Micro provides 1 GB RAM, 60 database connections, 500 baseline IOPS and
  11 MB/s baseline throughput at `$0.01344/hour` (about `$10/month`).
- Small provides 2 GB RAM, 90 database connections, 1,000 baseline IOPS and
  22 MB/s baseline throughput at `$0.0206/hour` (about `$15/month`).
- The approximate increase is `$0.00716/hour`, or `$5.23/month` at 730 hours.
- Small was recommended as the next safe Production tier because it doubles RAM,
  sustained IOPS and sustained throughput while increasing connection headroom.
  The recommendation is driven principally by repeated 76-86% memory use and
  severe memory commitment, not by current query latency.
- The upgrade was not required to clear the I/O warning because the balance had
  already recovered to 99%. It was recommended for resilience before the next
  traffic or provider-recovery burst and was completed after this assessment.

## Earlier Risk And Follow-up

- Disk I/O risk is currently controlled: balance 99%, low current throughput,
  low IOPS, 99% cache hits, no blocking and no slow application outlier.
- At that time, overall Production headroom was not fully resolved while Micro
  memory remained near its limit. The subsequently approved Small upgrade is
  verified in the follow-up above.
- Continue observing the seven-day Disk I/O Balance and memory trend. Reopen
  application optimisation only if a repeatable endpoint/query correlates with
  another balance decline; do not infer causation from request volume alone.

## Release Evidence

- Application commit: none.
- Migration: none.
- Deployment: none required.
- Infrastructure change: none.
- Business-data delta: zero.

