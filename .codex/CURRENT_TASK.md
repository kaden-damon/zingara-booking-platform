# P0 - Corporate Booking Search Crash

STATUS: COMPLETE - PRODUCTION VERIFIED

DATE: 26 OCTOBER 2026

## Objective

Restore Corporate Booking search in authenticated Production without changing
the interface, permissions, workflows or any business records.

## Reproduced Production Failure

- Authenticated Production Admin crashed immediately after text was entered in
  Corporate Booking search.
- The browser exception was `TypeError: Cannot read properties of undefined
  (reading 'trim')` inside the booking filter.
- The deployed source mapped the failing expression to
  `booking.reference.trim()` in exact-reference matching.
- This is a client rendering defect, not an authentication, API or database
  availability failure.

## Root Cause

Legacy Corporate booking metadata is deserialized from the booking `notes`
snapshot and spread into the current Admin booking model. The loader reapplied
many authoritative database fields but omitted `booking_reference`. Five of
523 active Corporate/Buyout metadata snapshots do not contain a reference, even
though their authoritative booking rows do. A non-empty search therefore
called `.trim()` on `undefined` and reached the Admin error boundary.

## Surgical Correction

- Reapply the authoritative database `booking_reference` whenever legacy
  metadata is converted to the Admin booking model.
- Make exact-reference matching tolerate a missing legacy reference and return
  no match instead of crashing.
- Add focused regression coverage for null and undefined references.

## Safety Boundary

- Strict UX/UI freeze.
- No database migration or business-data mutation.
- No change to booking search semantics for valid references.
- No change to booking, payment, ticket, capacity, Xero or financial rules.

## Required Verification

- Focused search and authoritative-reference tests.
- TypeScript, changed-file ESLint, `git diff --check` and Production build.
- Authenticated Production Corporate Booking search after deployment using
  multiple terms, clearing and rapid repeated input.
- Confirm no browser exception, request storm or Admin error boundary.

## Verification Result

- Focused booking search tests: 8/8 passed.
- Refund-readiness regression tests: 3/3 passed.
- TypeScript, changed-file ESLint and `git diff --check`: passed. ESLint
  retained only two existing unused-function warnings in the booking adapter.
- Next.js Production webpack build: passed.
- Authenticated Production verification used the deployed `6021043` bundle.
- Search by `Chulumanco` returned two Corporate bookings, including the legacy
  snapshot that previously crashed search.
- Exact search by `ZNG-7A47F870` returned the authoritative booking.
- Rapid replacement input and clearing the field completed normally; clearing
  restored all 453 active Corporate bookings.
- The browser console was cleared before the live test and remained at zero
  messages with no exception or Admin error boundary afterwards.

## Release

- Application commit: `60210434a28276298d72146421f83fab617693c3`
- Production deployment: `dpl_XwrSLarwSzPdp5DHgdwn2KHd6bEX`
- Production URL: `https://book.zingara.co.za`
- Rollback commit: `bdf34d07`
- Production business-data delta: none.
