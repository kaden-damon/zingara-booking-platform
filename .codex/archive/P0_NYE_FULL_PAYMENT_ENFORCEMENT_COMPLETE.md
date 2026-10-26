# P0 - NYE Full Payment Enforcement - Complete

DATE: 26 OCTOBER 2026

## Outcome

The Cape Town and Johannesburg performances on 31 December 2026 now use the
configurable `full-payment-only` policy. The setting is managed in Show &
Availability Management beside Custom Pricing and defaults to the existing
standard payment behaviour for every other performance.

New Standard, Corporate and Buyout agreements are protected across public and
internal creation, payment links, amendments and show transfers. Complimentary
and deposit terms are rejected for a full-payment-only performance. Paid-ticket
issuance remains blocked until authoritative full settlement is verified.

## Grandfathered Booking Audit

The read-only audit identified 21 active NYE bookings:

| Venue | Active | Fully paid | Deposit/partial | Unpaid | Verified paid | Outstanding |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Cape Town | 14 | 8 | 6 | 0 | R92,945 | R36,828 |
| Johannesburg | 7 | 5 | 1 | 1 | R74,456 | R43,048 |
| Total | 21 | 13 | 7 | 1 | R167,401 | R79,876 |

Grandfathered Cape Town balances:

- `ZNG-5ZFPY8`: R2,200 paid; R5,160 outstanding.
- `ZNG-95FC5P`: R1,100 paid; R2,780 outstanding.
- `ZNG-9MEGPN`: R2,200 paid; R5,560 outstanding.
- `ZNG-GDKVNH`: R3,300 paid; R9,120 outstanding.
- `ZNG-PV3XMT`: R1,100 paid; R2,780 outstanding.
- `ZNG-WBUZQU`: R3,850 paid; R11,428 outstanding.

Grandfathered Johannesburg balances:

- `ZNG-2VE6WR`: R0 paid; R21,825 outstanding.
- `ZNG-SB86S4`: R7,150 paid; R21,223 outstanding.

Verified payment rows were reconciled to the recorded paid amounts. Existing
agreements were not snapshotted, amended, charged, cancelled or contacted.

## Safeguards

- The booking guard rejects new deposit, partial-payment and complimentary
  agreements on a full-payment-only performance.
- Transfers into the policy preserve fully paid bookings and permit an unpaid
  booking only where it adopts the full-payment agreement; existing partial
  agreements remain protected from accidental conversion.
- Payment links use the complete authoritative outstanding balance.
- New paid tickets cannot be issued or reactivated before full settlement.
- Genuine payment, capacity, pricing, VAT, gratuity, ticket and Xero controls
  remain unchanged.

## Verification

- 21 focused tests passed; final targeted policy suite: 12 passed.
- TypeScript passed.
- Changed-file ESLint passed with 0 errors and 4 existing warnings.
- Diff check and migration validation passed.
- Production webpack build passed.
- Live booking, Admin and shows routes returned HTTP 200.
- Both NYE API records expose `full-payment-only`.
- Authenticated Production Admin displayed `Full Payment Only` for the
  Johannesburg NYE show; Cape Town is backed by the same verified API and
  database configuration.
- Both database enforcement triggers are enabled.

The default Turbopack build could not start an internal CSS worker in the
restricted local environment. The supported webpack Production build completed
successfully. The performance-budget parser does not support the webpack
manifest format; this did not affect compilation or deployment.

## Release

- Production commit: `2a23bdc2dd6400a5f4497cead9da505749401089`
- Vercel deployment: `5Mj8LqjbWvhieUtaz8LsnXbrnPV2`
- Deployment status: successful.
- Code rollback: `3374f49c3dc37fa45592f5f4f38640222acd505b`

## Business-Data Delta

Two existing show configuration rows were set to `full-payment-only`, and
immutable configuration audit events were recorded. No booking, payment,
ticket, capacity, customer or Xero financial record was modified.
