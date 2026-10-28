# Phase 54.11 - Hybrid Automatic Table Assignment

STATUS: COMPLETE

DATE: 28 OCTOBER 2026

## Objective

Resolve otherwise safe assignments within existing performance layouts without
replacing those layouts or disturbing any existing table claim.

## Production Baseline

- Application and `origin/main`: `96dcb30b201929563ed38d1eb9b994ce016d5b50`.
- Manual assignment queue: 1,532 bookings / 15,324 guests across 69 future
  performances.
- Protected existing-layout conflicts: 1,497 bookings.
- The configurable 70% threshold and all existing approval requirements remain
  authoritative.

## Confirmed Root Cause

The atomic allocator already validates individual table ownership, capacity,
zone and concurrency, but its entry gate requires the performance's entire
layout to be adopted and enabled. A safe available table is therefore ignored
when any unrelated table mismatch keeps the whole performance pending.

## Hybrid Safety Boundary

- Preserve every assigned, blocked, temporary, merged and manually adjusted
  table exactly as it is.
- Permit only independently validated table units:
  - permanent tables matching Richard's approved code, zone and capacity;
  - authorised operational temporary tables with configured capacity; and
  - authorised merged tables whose child ownership and capacity reconcile.
- Enforce booking zone, table minimum/maximum occupancy, 70% threshold and any
  existing authorised override.
- Keep Buyouts, multi-zone bookings and ambiguous table units manual.
- Use show-scoped advisory locks, row locks and idempotent booking claims.
- Do not change show status, ticket-sale capacity, booking values, payments,
  tickets, exports, UX/UI or financial records.

## Execution Plan

1. Run a read-only/rolled-back Production simulation against the complete queue.
2. Implement the hybrid allocator only if the simulation proves safe fits.
3. Process only below-threshold shows or shows with an existing authorised
   threshold override.
4. Verify assignment integrity, concurrency, queue reduction and booking-path
   performance before release.

## Production Result

- The rolled-back Production rehearsal evaluated all 1,497 legacy-layout
  conflicts before any write.
- 32 bookings / 210 guests were safely assigned using 38 approved permanent
  table units and three authorised temporary tables.
- No merged table happened to be selected as the best fit; valid existing merged
  units remain supported by the same validator.
- Queue reduced from 1,532 bookings / 15,324 guests to 1,500 bookings /
  15,114 guests.
- Remaining cases:
  - 1,230 bookings across 39 performances require existing Box Office 70%
    threshold approval.
  - 235 bookings across 14 performances have no safe hybrid table-unit fit.
  - 18 bookings still have no suitable approved table on adopted layouts.
  - 12 bookings require a minimum-occupancy decision.
  - Five Buyouts remain whole-performance manual plans.

## Verification

- Zero assignment-integrity failures and zero wrong-zone claims after release.
- Existing assigned, blocked, merged and manually adjusted tables were protected
  by migration assertions.
- No threshold override or assignment-control state was created or changed.
- The complete 1,497-booking rehearsal completed in approximately 6.5 seconds;
  the table-level evaluation averaged about 4 ms per booking.
- 25 focused assignment tests, TypeScript, changed-file ESLint, linked migration
  dry-run, `git diff --check`, Production build and Admin performance budgets
  passed.
- Production Admin returned HTTP 200 after deployment.

## Release

- Implementation commit: `918cc64` (`Add hybrid table assignment for legacy layouts`).
- Production deployment: `dpl_9BDvKNWDLfFmut5E134icndi2fq5`.
- Production alias: `https://book.zingara.co.za`.
- Rollback application commit: `96dcb30b201929563ed38d1eb9b994ce016d5b50`.
- Database rollback must be forward-only: restore the Phase 54.5 trigger/function
  definitions while preserving the 32 valid table claims and their audit evidence.
- Business-data delta: 32 booking table pointers and 41 table-unit claims were
  added with immutable audit evidence. No guest counts, show statuses,
  ticket-sale capacities, payments, tickets or financial records changed.
