# Phase 54.11 - Hybrid Automatic Table Assignment

STATUS: IN PROGRESS

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
