# Phase 54.11 - Hybrid Automatic Table Assignment

STATUS: COMPLETE

DATE: 28 OCTOBER 2026

## Root Cause

The existing allocator was atomic and table-safe, but required an entire
performance layout to be adopted and enabled. Fifty-three legacy performances
had no layout-control row, so 1,497 bookings were blocked even where individual
tables matched Richard's approved code, zone and capacity.

## Implementation

- Added fail-closed table-unit validation for:
  - approved permanent tables;
  - authorised operational temporary tables; and
  - valid pre-existing merged tables with reconciled child ownership/capacity.
- Reused show-scoped advisory locking, row locking, booking locking and the
  authoritative post-claim compatibility validator.
- Preserved the 70% threshold. Above-threshold bookings require a matching
  existing audited override; the release creates none.
- Kept Buyouts, multi-zone bookings and ambiguous units manual.
- Replaced only the booking-insert assignment function; no UX/UI, export or
  ticket-sale logic changed.

## Production Result

- Rehearsal baseline: 1,532 bookings / 15,324 guests.
- Legacy-layout bookings evaluated: 1,497.
- Safely assigned: 32 bookings / 210 guests.
- Claimed units: 38 approved permanent and three authorised temporary tables.
- Final queue: 1,500 bookings / 15,114 guests.

## Remaining Manual Queue

| Reason | Bookings | Performances | Required action |
| --- | ---: | ---: | --- |
| 70% threshold approval required | 1,230 | 39 | Authorised Box Office review/resume; no override was manufactured. |
| No safe hybrid table-unit fit | 235 | 14 | Review physical availability and authorised manual/temporary arrangements. |
| No suitable table on adopted layout | 18 | - | Manual physical-fit review. |
| Minimum occupancy decision | 12 | - | Select an authorised manual arrangement. |
| Buyout manual planning | 5 | 5 | Complete the whole-performance seating plan manually. |

## Verification

- Zero compatibility failures and zero wrong-zone claims.
- Existing table claims and assignment controls were unchanged.
- 25 focused tests, TypeScript, ESLint, migration dry-run, diff validation,
  Production build and Admin performance budgets passed.
- Full rehearsal: approximately 6.5 seconds / about 4 ms per evaluated booking.
- Production Admin returned HTTP 200 after deployment.

## Release

- Implementation commit: `918cc64`.
- Deployment: `dpl_9BDvKNWDLfFmut5E134icndi2fq5`.
- Production: `https://book.zingara.co.za`.
- Rollback application commit: `96dcb30b201929563ed38d1eb9b994ce016d5b50`.
- Database rollback is forward-only and must preserve the 32 valid assignments.

## Business-Data Delta

- 32 booking table pointers added.
- 41 table-unit claims added with immutable audit evidence.
- No guest counts, show statuses, ticket-sale capacities, payments, tickets or
  financial records changed.
