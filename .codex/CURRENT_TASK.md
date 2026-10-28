# Phase 54.2 - Automatic Table Assignment

STATUS: COMPLETE - DEPLOYED DISABLED PENDING PERFORMANCE RECONCILIATION

DATE: 28 OCTOBER 2026

## Objective

Extend the approved Phase 54.1 seating authority with controlled, atomic table
assignment for new Standard and Corporate bookings at explicitly reconciled and
eligible performances in Cape Town and Johannesburg.

## Safety Boundary

- Feature disabled globally by default.
- No automatic migration or reassignment of existing bookings.
- Only adopted, conflict-free performances may be enabled.
- Buyouts remain manual.
- Preserve manually selected, temporary, merged, disabled and blocked tables.
- Automatic assignment failure must never block a valid booking.
- The 70% default pause routes bookings to Floor without restricting sales.
- No ticket-sale capacity, pricing, payment, ticket, Xero or export changes.
- Preserve the restored 79-row operational catalogues until a performance is
  explicitly reconciled to the approved 74-table layout.

## Implementation Scope

- Atomic, zone-bound best-fit physical table assignment after successful new
  booking creation.
- On explicit safe adoption, populate only unset permanent-table capacities
  from the approved master; never overwrite configured performance-specific
  values, assignments, temporary tables or historical layouts.
- Performance-specific assignment state, configurable threshold and audited
  manual pause/resume controls.
- Threshold-first pause using authoritative reserved guest entitlements.
- Deduplicated Box Office threshold notification and configurable review
  reminder (default 10 days before showtime).
- Essential status/settings controls inside the existing Table Plan only.
- Bounded queries, no polling and no synchronous failure path that can reject a
  valid booking solely because automatic assignment is unavailable.

## Verification

- Standard and Corporate assignment, zones, capacity, best fit and fallback.
- Existing/manual/temporary/merged/disabled/blocked table preservation.
- Atomic concurrency and duplicate-table prevention.
- Threshold below/at/above, overrides, audit and notification idempotency.
- Amendments/transfers remain on existing authoritative pathways.
- Both venue layout versions and disabled rollout state.
- Focused tests, TypeScript, changed-file ESLint, diff check, migration
  rehearsal and Production build.

## Release Boundary

- Deploy behind the disabled global flag.
- Enable only a verified, conflict-free future performance if one can be
  proven safe without creating a Production booking.
- Otherwise leave every performance disabled and report the exact blocker.

## Completed Outcome

- Controlled automatic assignment is deployed behind the globally disabled
  Production flag.
- Standard and Corporate bookings are supported; Buyouts and multi-zone
  Corporate bookings remain in the manual assignment queue.
- Assignment is atomic, zone-bound and best-fit, with a per-show lock and
  immutable attempt evidence.
- The 70% threshold pauses assignment only. It does not restrict ticket sales
  or booking creation.
- Explicit safe layout adoption populates unset capacities for all matched
  permanent tables from the approved 74-table master. It never overwrites
  assigned tables, manual capacity values, temporary tables, merged tables or
  performance-specific arrangements. Adopted permanent tables therefore do
  not retain a `SEATS NOT SET` state.
- Production reconciliation found 0 of 189 future performances currently safe
  for automatic adoption. The closest operational catalogue matches 71 of the
  74 approved tables and every future performance has configured capacity
  conflicts. No performance was enabled or modified.
- Production state after migration: global assignment disabled, 0 venue
  defaults enabled, 0 shows adopted, 0 shows enabled, 0 assignment attempts
  and 0 notification events.

## Verification Result

- 16 focused allocator, refresh and Phase 54.2 tests passed.
- TypeScript, changed-file ESLint, `git diff --check`, migration rehearsal and
  Production build passed.
- Admin performance budget passed: 1,260,204 raw bytes, 302,648 gzip bytes and
  160,791-byte largest gzip chunk.
- Live Admin and public booking routes returned HTTP 200; the new Admin API
  correctly returned HTTP 401 without authentication.

## Release

- Application commit: `72ccd59b8f4d79a5bc93a00b75032867b45533a6`
- Production deployment: `dpl_HyApuLX3upW9mgW9wQYn62T4G5SB` (`READY`)
- Rollback source commit: `be84b1fbf6380e758a071244b751389ab32794fb`
- Production business-data delta: none. The release added schema and dormant
  configuration only; no booking, assignment, table capacity, payment, ticket,
  export or financial record was changed.
