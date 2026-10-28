# Phase 54.2 - Automatic Table Assignment

STATUS: IN PROGRESS

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
