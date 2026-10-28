# Phase 54.8 - Automatic Assignment Restriction Resolution

STATUS: COMPLETE - STATUS-INDEPENDENT PHYSICAL ASSIGNMENT DEPLOYED

DATE: 28 OCTOBER 2026

## Objective

Separate ticket-sale availability from physical table assignment, reconcile
the 992 bookings previously classified as blocked by inactive/restricted show
settings, and atomically assign only bookings whose approved physical layout,
zone, capacity and table fit are proven safe.

## Baseline

- Production application and `origin/main`:
  `8356df8cc7677ecd17c3cc2c5f6b9753948be249`.
- Phase 54.7 classified 992 bookings / 8,882 guests across 53 performances as
  blocked because the show was not `active`.
- The current booking trigger requires `shows.status = active` before invoking
  the physical assignment engine.
- Closed/inactive and sold-out availability do not inherently invalidate
  physical seating for existing valid guests.

## Safety Boundary

- Never change show status, ticket-sale capacity or public availability.
- Cancelled performances and other unsupported states remain assignment-blocked.
- Preserve every existing assignment, temporary table, merge, override and
  manual seating decision.
- Preserve Buyout and multi-zone manual handling and the configured 70% pause.
- Reconcile only complete approved layouts with exact table identity, zone and
  capacity evidence.
- Use bounded, atomic, idempotent assignments with immutable audit evidence.
- Leave all ambiguous, over-capacity or physically unsuitable bookings in the
  manual queue.

## Diagnosis

- The booking trigger required `shows.status = active` before invoking physical
  assignment. This incorrectly coupled ticket-sale availability to seating.
- The 992-booking restriction group contained 53 performances with bookings:
  28 sold out and 25 inactive/closed.
- 918 bookings remain legitimately paused at the configured 70% threshold.
- 21 bookings remain behind a structural table conflict.
- 53 bookings / 249 guests across 23 performances passed status-independent
  layout, capacity, zone, booking-type and threshold checks.

## Production Outcome

- Safely assigned: 52 bookings / 248 guests using 57 atomic physical-table
  claims.
- Fully reconciled and activated: 22 performances.
- One booking remains manual: `ZNG-QNNGZC`, one Golden Circle guest for
  Johannesburg on 17 November 2026. Approved permanent tables require at least
  two guests, so the performance remains disabled for automatic assignment.
- Queue after deployment: 1,533 bookings / 15,277 guests across 68
  performances. Live booking activity continued during the release.
- Remaining restriction classifications: 918 threshold-paused bookings, 21
  structural-conflict bookings, and one current no-fit booking on the partially
  reconciled performance.
- Inactive/closed and sold-out shows with adopted enabled layouts now invoke
  physical assignment; archived, blackout and special-event states remain
  fail-closed.

## Verification

- Rollback-only Production rehearsal: 52 assignments, 248 guests, 57 table
  claims, 22 activations and one minimum-occupancy manual exception.
- Production: zero invalid assignments, zero missing claims and zero unexpected
  show-status changes.
- Existing manual claims and stable booking/financial values passed migration
  assertions unchanged.
- 27 focused assignment, reconciliation, allocator and integrity tests passed.
- TypeScript, changed-file ESLint, `git diff --check`, linked migration dry-run,
  Production build and Admin performance budget passed.

## Release

- Migration:
  `20261028235900_phase_54_8_assignment_restriction_resolution.sql`.
- Application rollback source:
  `8356df8cc7677ecd17c3cc2c5f6b9753948be249`.
- Business-data delta: 52 existing bookings received authoritative `table_id`
  assignments; 57 approved physical-table claims were created; 23 show layouts
  were reconciled, with 22 enabled and one retained manual. Sixty-nine master
  rows were introduced or explicitly tagged by Phase 54.8. No show status,
  ticket-sale capacity, guest count, pricing, payment, ticket or financial
  record changed.
