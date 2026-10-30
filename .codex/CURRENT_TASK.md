# Phase 68 - Floor Capacity & Seating Integrity

STATUS: COMPLETE - RELEASED TO PRODUCTION

DATE: 30 OCTOBER 2026

## Objective

Keep single-table seating as the first choice, prefer compatible nearby tables
when a split is genuinely required, and ensure Floor capacity and assignment
counts use the same authoritative show and booking data as Booking Details and
Table Plan exports.

## Verified Production Baseline

- Starting commit: `d3a59ccdead68760ae88bb4ef5d91d19ea3ec0eb`.
- Phase 62 single-table priority remains present in the Floor recommendation
  path and current database allocators begin by selecting the smallest fitting
  single approved table.
- A current eight-guest Middle Ring booking, `ZNG-MKA3M2`, was assigned tables
  205 and 302 on 30 October. No approved eight-seat permanent table was free,
  so a split was necessary; however, the database chose the exact-capacity pair
  without considering the approved master table order, placing the tables far
  apart.
- 5,948 active bookings were audited. There are no cross-show claims, invalid
  claimed-table statuses or primary-table ownership mismatches.
- 2,541 future active bookings reconcile exactly to their zone entitlements.
  No future populated seating zone exceeds its authoritative operational
  capacity.
- 455 future bookings currently use more than one table. Six have a valid
  single-table alternative available now and require operational review; they
  will not be moved automatically because availability at the original
  assignment time is not retained.

## Correction Boundary

- Preserve every existing assignment and historical record.
- Keep single-table priority ahead of every combination.
- For unavoidable combinations, use approved master order to prefer compatible
  nearby tables before unused-seat optimisation.
- Keep all atomic ownership, minimum occupancy, zone, show, threshold and
  concurrency checks server-side.
- Use the authoritative Supabase show ID for Floor booking and capacity totals.
- Add no new capacity lock or business rule.

## Completed Correction

- Single-table fit remains the first assignment rule.
- When a split is unavoidable, application and database allocators now prefer
  compatible tables that are close in the approved master order before
  unused-seat optimisation.
- Floor counts, queue filtering and table hydration now use the authoritative
  show ID rather than a potentially stale legacy alias.
- Existing assignments, capacities, ticket availability and business records
  were not changed.

## Verification And Release

- Focused Phase 68 tests, capacity-model tests, TypeScript, diff checks and the
  webpack Production build passed.
- Migration `20261030235900_phase_68_seating_proximity.sql` applied
  successfully and read-back verified both live allocator functions.
- Application commit: `419002aac89d7d6d93dda0af4ba18d7fb3266a2d`.
- Production deployment: `dpl_E4vY19Co48wS9Ew74BdTTnd2JgmX` (`Ready`).
- Post-release read-only verification confirmed `ZNG-MKA3M2` remains assigned
  to tables 205 and 302; no historical seating was changed.
- The available Chrome profile reached the stable Production Admin login but
  was not authenticated. Direct authenticated visual Floor verification was
  therefore not claimed in this execution.

## Rollback

- Application rollback point: `d3a59ccdead68760ae88bb4ef5d91d19ea3ec0eb`.
- The migration changes allocator function ordering only; it performs no
  booking, table, capacity, payment or ticket data mutation.
