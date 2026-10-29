# Phase 61 - Booking Failure Tracking & Lost Sales Monitoring

STATUS: RELEASE READY

DATE: 29 OCTOBER 2026

## Scope

- Prospectively record authoritative public booking and payment-start failures.
- Link retries and later successful bookings by the existing anonymous journey ID.
- Add a management-only, paginated Booking Failures & Recovery report.
- Preserve booking performance, customer privacy and all existing conversion tracking.

## Implementation

- Public rejection events are recorded server-side with the performance, venue,
  seating zone, requested guests, quoted ZAR value, booking reference and exact
  rejection taxonomy.
- Recording uses Next.js `after()` and therefore starts only after the booking or
  checkout response has been returned. Failure recording is bounded and fail-safe.
- No public browser code, page request, effect, timer, polling task, dependency or
  React render was added.
- Retries are grouped by journey. Recovery uses authoritative reservation,
  completion and payment events. Only explicit PayFast cancellation is classified
  as abandoned; other incomplete journeys remain unresolved.
- The management report is permission- and venue-scoped, indexed, paginated to 25
  journeys and loaded only when its collapsed Reports section is opened.
- Historical events remain unchanged. GA4, Google Ads, Meta and Phase 56 purchase
  tracking are unchanged; exact server rejection data stays first-party because
  advertising consent is not available at the server rejection boundary.

## Verification

- Focused tests: 10 passed.
- TypeScript: passed.
- Changed-file ESLint: passed with three pre-existing unused-symbol warnings in
  `src/app/api/bookings/route.ts` and no errors.
- Production Webpack build: passed.
- Migration dry-run and apply: passed.
- Rollback-only Production fixture: two retries grouped into one recovered journey;
  potential value counted once; zero fixture rows persisted.
- Indexed 30-day report query: 7.748 ms on Production.
- Lazy report chunk: 11,183 bytes; absent from the public booking client.
- `git diff --check`: passed.

## Safety

- Production business-data delta: none.
- Schema delta: one secured reporting function and three partial telemetry indexes.
- No historical reconstruction or backfill.
- No customer PII is recorded or sent to GA4/Meta.
- No booking, payment, ticket, seating, Xero or financial logic changed.

## Release

- Baseline / rollback application commit: `38ac64afa8237552c716e838af2a08f6435f9701`.
- Migration: `20261030093000_phase_61_booking_failure_recovery_reporting.sql` applied.
- Application commit and Production deployment: pending.
