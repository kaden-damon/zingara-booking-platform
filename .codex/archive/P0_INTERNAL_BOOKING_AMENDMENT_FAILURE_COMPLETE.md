# P0 Internal Booking Amendment Failure

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

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
- Application and records commit: `37558c408c5f112a8484323101f5154e24c81afc`.
- Production deployment: `dpl_C4gBE3WudKjoH9Qzk3HTAiFhNVG8`, Ready and
  aliased to `book.zingara.co.za` at 19:07:57 SAST.
- Production function inspection confirmed the Corporate status guard is gone,
  proposed pax validation is active and trusted transfers accept Blackout.
- Authenticated Production UI verification opened the exact booking's guest
  amendment, entered 94 without submitting, and displayed 10 added guests,
  fixed-total/no-repricing, R0 additional and R0 outstanding.
- A post-release rollback-only call exercised the exact database path and
  succeeded. The live booking remained unchanged.
- Public sales remain active-only; public availability and reservation guards
  were not modified.
- Rollback: revert `37558c40`, redeploy, and restore the three prior function
  definitions captured by the migration baseline.

## Business-Data Delta

- Zero. No booking, table, payment, ticket or financial record was changed
  during investigation, release or QA. `ZNG-9VHFFH` remains at 84 guests with
  15 table claims, R154,638 paid and R0 outstanding.
