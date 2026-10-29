# Phase 61 - Booking Failure Tracking & Lost Sales Monitoring

Date: 29 October 2026

## Outcome

Phase 61 adds prospective, server-authoritative booking failure and recovery
tracking to the existing first-party `platform_events` infrastructure.

Captured failure reasons are:

- Application error
- Booking cutoff
- Booking validation
- Concurrent booking conflict
- Payment initiation failure
- Show closed
- Show sold out
- Two-seater limit
- Zone capacity exhausted
- Zone unavailable

Each failure records only the anonymous journey, performance, venue, date, zone,
guest count, quoted ZAR value, generated booking reference, status and SAST event
time. Customer names, email addresses, mobile numbers and payment credentials are
not captured.

Retries remain one journey. Later authoritative booking events identify recovered
journeys and verified booking/payment state. Explicit PayFast cancellation is an
abandoned journey. Expired holds and journeys without reliable final evidence stay
unresolved. Potential value is reported separately from revenue and confirmed loss.

## Reporting

`Admin -> Reports -> Sales & Performance -> Booking Failures & Recovery` is
restricted by the existing `analytics:read` permission and staff venue scope.
Filters cover venue, performance date, seating zone, failure reason and event date
range. Results are indexed, paginated and loaded only when the section opens.

## Performance

- Public client delta: zero tracking code and zero additional requests.
- Booking and checkout response path: zero blocking telemetry writes.
- Tracking runs after the response through Next.js `after()`.
- Report code is an 11,183-byte lazy chunk.
- Production report function execution: 7.748 ms for the 30-day empty prospective
  range immediately after activation.
- No polling or background browser activity was introduced.

## Verification

- 10 focused tests passed.
- TypeScript passed.
- Changed-file ESLint passed with no errors.
- Production Webpack build passed.
- Migration dry-run and application passed.
- A rollback-only Production fixture verified retry deduplication, recovery,
  timeline ordering and single-count potential value; zero fixture rows persisted.
- `git diff --check` passed.

## Release

- Baseline / rollback application commit: `38ac64afa8237552c716e838af2a08f6435f9701`.
- Migration: `20261030093000_phase_61_booking_failure_recovery_reporting.sql`.
- Application commit: pending.
- Production deployment: pending.

## Data Delta

No booking, customer, payment, ticket, seating, capacity, communication, Xero or
financial records changed. The only persistent database change is the additive,
service-role-only reporting function and its three telemetry indexes.
