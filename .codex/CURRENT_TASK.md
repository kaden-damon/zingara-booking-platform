# P0 - COMP Selection Blocking Bookings

STATUS: RELEASE READY

DATE: 30 OCTOBER 2026

## Objective

Restore unambiguous internal Standard and complimentary booking creation while
preserving the explicit COMP category selection, R0 guest payable amount and
R550-per-guest internal cash-up value.

## Production Diagnosis

- Authenticated Production QA reproduced the complete Standard booking flow up
  to, but not including, the final write.
- `STANDARD` in the calendar popup selects the Standard booking workflow. It is
  not the `STANDARD` complimentary category introduced in Phase 59.
- Ordinary Standard Rate bookings use the paid checkout branch, but the shared
  eligibility helper still required a COMP category whenever another paid flow
  reused it. The helper did not encode whether complimentary mode was active.
- After selecting Complimentary, the separate Standard, Media and Tradex choice
  is intentionally required. Selecting Standard COMP persists through Review
  and enables CREATE BOOKING once the existing terms requirement is satisfied.
- The exact client message can only be emitted while the flow is still treated
  as Complimentary or while the shared helper is reused by a paid flow. The
  duplicate `STANDARD` labels made Standard Booking and Standard COMP easy to
  confuse, leaving the pricing mode complimentary when a paid booking was
  intended.

## Correction

- Distinguish Standard Booking from Standard COMP in the existing controls.
- Make validation copy explicitly identify the missing complimentary category.
- Require a COMP category only when Complimentary is explicitly active.
- Clear the COMP category whenever a full-payment policy returns the flow to
  paid Standard pricing; the existing Standard Rate and Friends & Family actions
  already clear it synchronously.
- Do not change pricing, payment, API persistence or database logic.

## Safety

- No Production booking, customer, payment or financial record is created in QA.
- All booking, seating, payment and COMP financial safeguards remain unchanged.

## Verification

- Authenticated Production paid Standard flow reached the enabled final CREATE
  BOOKING action with Standard Rate selected and no COMP category; the write was
  intentionally not executed.
- Authenticated Production Standard COMP selection persisted through Review and
  enabled the same final action after terms acceptance; no booking was created.
- Nineteen focused submission and Phase 59/59.1 financial tests passed.
- TypeScript and `git diff --check` passed.
- Next.js 16 Webpack Production build passed.
- Changed-file ESLint remains blocked by pre-existing errors in the two large
  Admin/booking components; the edited helper, test and API route add no errors.
- The legacy Admin performance-budget checker cannot parse the Webpack manifest;
  no bundle, dependency, request, render or background-work change was made.

## Release

- Production baseline and rollback: `fe2defee485aaeae969d1a74ee3dd9f1cb5bf476`.
- Production business-data delta: none.
