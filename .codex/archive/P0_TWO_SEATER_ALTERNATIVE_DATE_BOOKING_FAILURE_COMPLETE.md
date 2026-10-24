# P0 - Two-Seater Alternative Date Booking Failure

Completed: 24 October 2026

## Root cause

The alternative-date button called the existing recommended-performance path.
That path resets a public booking to Seating and refuses to change a booking
opened from the Admin calendar. It also left the internal server validation
snapshot bound to the original performance.

## Correction

- Added an explicit continuation decision that resumes Checkout when seating
  and customer details are complete, or the furthest valid earlier step when
  they are not.
- Preserved party size, seating, customer details, notes, payment selection,
  pricing mode, and add-ons.
- Replaced the internal calendar snapshot with the selected alternative's exact
  date, time, venue, and show reference.
- Removed the old show's lock identity from the replacement snapshot and
  releases a legacy creation lock on a best-effort basis.
- Updated the current internal booking URL without a page reload.
- Kept the existing public and Admin booking APIs, atomic reservation function,
  database two-seater trigger, cutoff, capacity, payment, and ticket safeguards.

## Verification

- 23 direct two-seater and staff booking-context tests passed.
- 75 of 76 broader focused booking tests passed; the sole failure is a stale,
  pre-existing source-text assertion for the Guided Training dependency list.
- TypeScript passed.
- Production build passed.
- Admin performance budget passed.
- git diff --check passed.
- No Production business data was mutated.

## Release

- Rollback commit: `f2de327dfeb80017be6be7c5ff05c22aeb978d9b`
- Production commit: this P0 release commit.
