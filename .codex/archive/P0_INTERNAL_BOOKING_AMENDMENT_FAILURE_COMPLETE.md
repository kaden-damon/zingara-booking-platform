# P0 Internal Booking Amendment Failure

STATUS: RELEASE READY - PRODUCTION DEPLOYMENT IN PROGRESS

DATE: 5 NOVEMBER 2026

## Scope

Restore authorised internal booking creation and amendments independently of
public performance status, while preserving capacity, seating, permissions,
fixed-price Corporate agreements and public booking restrictions.

## Root Causes

1. The Corporate guest-count reconciliation function retained a public-sales
   `active` status requirement. Production logged `SHOW_NOT_ACTIVE` for the
   first `ZNG-9VHFFH` attempt.
2. Proposed table-fit validation read the saved 84-guest zone entitlement
   instead of the requested 94 guests. It incorrectly retained the 84-seat
   legacy assignment, and the deferred table-integrity trigger correctly rolled
   the transaction back with `TABLE_OCCUPANCY_OUT_OF_RANGE|30|84|golden-circle`.

## Production Evidence

- Booking: `ZNG-9VHFFH`, Corporate fixed-price, 84 guests, Golden Circle.
- Financial position: R154,638 total, R154,638 paid, R0 outstanding.
- Current assignment: 15 table claims with combined capacity 84.
- Capacity at verification: 129 active Golden Circle guests, 144 operational
  seats, 15 remaining. The requested increase produces 139 guests and leaves 5.
- Lisa Rodderick is an active Super Admin with all-venue scope.
- A second recent booking scenario showed the same table-occupancy failure in
  Production logs; its booking reference was not retained in the generic log.

## Implementation

- Removed the Corporate reconciliation RPC's public-status guard.
- Corrected proposed single-zone pax table compatibility.
- Added Blackout to the existing authorised internal status policy and transfer
  boundary while leaving public sales active-only.
- Preserved management approval for Special Event and active Full Show Buyout,
  and preserved Venue Closure and Archived protections.
- Added actionable table-integrity amendment errors.

## Verification

- Focused tests: 22/22 passed.
- Changed-file ESLint passed.
- TypeScript passed.
- Next.js Webpack Production build passed.
- Rollback-only Production proof accepted 84-to-94 at R0, preserved the exact
  paid total and returned Needs a Table. The rollback left the live booking,
  table claims and financial position unchanged.

## Release Evidence

- Migration: `20261105171000_p0_internal_booking_amendment_integrity.sql`.
- Commit, deployment identifier and post-release Production evidence pending.

## Business-Data Delta

- Pre-release: zero. No booking, table, payment, ticket or financial record was
  changed during investigation or QA.
