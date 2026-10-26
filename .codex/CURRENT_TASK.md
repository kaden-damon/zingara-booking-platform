# P0 - NYE Full Payment Enforcement

STATUS: COMPLETE

DATE: 26 OCTOBER 2026

## Objective

Add an audited, performance-specific Payment Policy beside Custom Pricing and
configure both Cape Town and Johannesburg performances on 31 December 2026 as
Full Payment Only.

The policy must be enforced server-side for new Standard, Corporate and Buyout
agreements across public and internal booking creation, payment links,
amendments and transfers. Existing booking and payment agreements are
grandfathered and must not be charged, cancelled, amended or contacted.

## Safeguards

- Existing pricing, VAT, gratuity, capacity, ticketing, payment and Xero rules
  remain authoritative.
- No booking may be represented as paid until authoritative full settlement is
  verified.
- All performances other than those explicitly configured retain their current
  payment behaviour.
- Production verification must not create financial transactions.

## Production Result

- Cape Town, 31 December 2026 at 18:00: `full-payment-only`.
- Johannesburg, 31 December 2026 at 17:00: `full-payment-only`.
- All other performances default to their existing standard payment behaviour.
- Existing bookings remain grandfathered; no historical booking received a
  payment-policy snapshot.
- Public and internal creation, payment links, transfers, amendments and paid
  ticket issuance are protected by application and database enforcement.

## Existing NYE Booking Audit

- 21 active bookings: 13 fully paid, 7 deposit/partially paid, 1 unpaid.
- Cape Town outstanding balance: R36,828.
- Johannesburg outstanding balance: R43,048.
- Total outstanding balance: R79,876.
- No booking, payment, ticket, customer or capacity record was changed.

## Verification

- 21 focused tests passed; final policy subset: 12 passed.
- TypeScript passed.
- Changed-file ESLint: 0 errors; 4 existing warnings.
- `git diff --check` passed.
- Linked migration dry-run and rollback validation passed.
- Production webpack build passed.
- Live `/book`, `/admin` and `/api/shows` checks passed.
- Both Production NYE show payloads report `full-payment-only`.
- Admin Show & Availability Management displays `Full Payment Only` beside
  Custom Pricing.
- Booking and ticket enforcement triggers are enabled in Production.

## Release

- Commit: `2a23bdc2dd6400a5f4497cead9da505749401089`
- Vercel deployment: `5Mj8LqjbWvhieUtaz8LsnXbrnPV2`
- Deployment completed: 26 October 2026 at 16:25 SAST.
- Rollback code point: `3374f49c3dc37fa45592f5f4f38640222acd505b`.
- Database rollback requires the dedicated policy rollback procedure; do not
  roll back migrations blindly.
