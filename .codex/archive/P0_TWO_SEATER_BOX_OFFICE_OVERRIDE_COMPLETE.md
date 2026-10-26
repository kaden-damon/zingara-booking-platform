# P0 - Two-Seater Box Office Override

Completed and Production verified on 26 October 2026.

## Delivered

- Strict public twenty-booking two-seater quota retained.
- Staff-only override for authorised Box Office roles with mandatory reason.
- Creation, guest-count reconciliation and show-transfer paths supported.
- Exact booking/performance authorisation, ten-minute expiry and atomic
  consumption under the existing advisory lock.
- Immutable audit evidence records actor, time, show, booking and reason.
- Existing alternative dates, temporary tables, capacity, payments, tickets
  and concurrency safeguards preserved.

## Release

- Feature commit: `ca0932069c3f9ef8d0852beb68329b14e75d32a6`
- SQL correction commit: `e53974756a0dbd6c470e26dc61a9c118dddc0358`
- Vercel deployment: `nkTcwucEKT4cULZVob2ihZojQJqy`
- Rollback code point: `0505832e3d4879811bafebb2db5883b7a7d84bae`
- Production business-data delta: none

The first database push failed safely before application because a reserved SQL
alias was rejected. The alias was corrected, the migration remained unapplied
until retry, and the corrected migration then applied successfully.
