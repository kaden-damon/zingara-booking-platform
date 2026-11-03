# P0 Box Office Seating Override Booking Failure

STATUS: COMPLETE - PRODUCTION READY

DATE: 3 NOVEMBER 2026

## Confirmed Root Cause

The authorised two-seater override was valid and reached the database. The
`BEFORE INSERT` quota trigger attempted to update the authorization row with the
new booking UUID before the booking row existed. The immediate foreign-key check
failed with PostgreSQL `23503`, rolling back the booking transaction. The UI then
mislabelled this persistence failure as a payment-start failure even for R0 COMP
bookings.

Production evidence showed 13 failed attempts across five references. Each
authorization remained unconsumed after rollback, and all five references had
zero persisted bookings, payments and tickets.

## Correction

- Applied `20261103090000_p0_two_seater_override_creation_fk.sql`.
- Changed only the authorization `booking_id` foreign key to `DEFERRABLE
  INITIALLY DEFERRED`, allowing the booking row and authorization link to commit
  atomically in their intended order.
- Preserved the trigger's advisory lock, 20-booking quota, short-lived approval,
  server-side role check, mandatory reason and immutable audit event.
- Updated checkout feedback so creation failures say `Booking could not be
  created`; only actual PayFast preparation failures say payment could not start.
- The existing complimentary branch remains R0, creates no payment record and
  returns before `/api/payfast/checkout`.

## Verification

- Two-seater override suite: 10/10 passed.
- Complimentary workflow suite: 7/7 passed.
- Trusted booking provenance suite: 5/5 passed.
- TypeScript passed.
- Migration dry run listed only the P0 migration.
- Production constraint: `condeferrable=true`, `condeferred=true`.
- Rollback-only Production fixture passed and left zero rows.
- Authenticated Production Admin loaded under Kaden Damon's active account.
- Five affected references reconcile to zero bookings, zero payments and zero
  tickets; no duplicate or partial records require cleanup.
- No real booking or financial transaction was created during QA.

## Release

- Commit: `a4910fc4` (`fix: restore two-seater override booking creation`).
- Migration: `20261103090000_p0_two_seater_override_creation_fk.sql` applied.
- Vercel deployment: `dpl_82X7gxcMgKiSiededRQxCxVyFaa3` Ready at 09:28:46
  SAST and aliased to `book.zingara.co.za`.
- Rollback: restore the original immediate foreign-key constraint and redeploy
  the parent application commit. This would restore the known creation defect and
  is therefore emergency-only.
- Business-data delta: none. Existing bookings, authorizations, payments,
  tickets, seating and audit records were not modified.

P0 COMPLETE - BOX OFFICE SEATING OVERRIDE BOOKING CREATION RESTORED.
