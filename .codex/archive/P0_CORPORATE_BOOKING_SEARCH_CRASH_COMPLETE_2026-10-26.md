# P0 - Corporate Booking Search Crash - Complete

DATE: 26 OCTOBER 2026

STATUS: COMPLETE - LIVE AND VERIFIED

## Incident

Typing any non-empty term into Corporate Booking search caused the authenticated
Admin client to enter its error boundary. The captured Production exception was:

`TypeError: Cannot read properties of undefined (reading 'trim')`

The deployed stack resolved to exact booking-reference filtering.

## Root Cause

Legacy Corporate booking metadata from booking notes was spread into the Admin
booking model without reapplying the authoritative `booking_reference` column.
Five of 523 active Corporate/Buyout metadata snapshots omitted their embedded
reference, although each authoritative booking row had a valid reference.

## Correction

- Reapply `row.booking_reference` during legacy metadata hydration.
- Treat a null or undefined legacy reference as a non-match in exact-reference
  filtering instead of calling `.trim()` on it.
- Added focused regression coverage for the legacy shape.
- No UX, workflow, permission or business-rule change.

## Verification

- Focused booking search tests: 8/8 passed.
- Refund-readiness regression tests: 3/3 passed.
- TypeScript, changed-file ESLint, diff check and Production webpack build
  passed.
- Authenticated live searches passed for customer/company text, an exact
  reference, rapid replacement input and clearing.
- A formerly malformed legacy Corporate row was returned successfully.
- Clearing restored all 453 active Corporate bookings.
- Browser console remained at zero messages after the post-deployment search
  sequence; no error boundary or request storm occurred.

## Release

- Commit: `60210434a28276298d72146421f83fab617693c3`
- Vercel deployment: `dpl_XwrSLarwSzPdp5DHgdwn2KHd6bEX`
- Production: `https://book.zingara.co.za`
- Rollback: `bdf34d07`
- Business-data delta: none. Production data was audited read-only.
