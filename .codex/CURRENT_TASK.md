# Phase 68 Follow-up - Strict Single-Table Allocation

STATUS: COMPLETE - RELEASED TO PRODUCTION

DATE: 30 OCTOBER 2026

## Objective

Enforce the authoritative rule that automatic seating may assign or recommend
exactly one suitable operational table per booking. Existing valid merged
tables count as one table unit. If none fits, the booking remains valid and
enters manual Box Office seating resolution.

## Verified Root Cause

- The Phase 68 application recommendation helper still fell back to creating a
  multi-table combination when no single table fitted.
- The initial-floor planner could automatically propose and create a merged
  table from multiple permanent tables.
- The show-wide capacity planner could recommend multiple existing tables or a
  multi-table temporary-capacity mix.
- Three live database assignment engines and the Phase 54.5 preflight loop
  could accumulate multiple table claims before assigning a booking.
- Manual multi-table assignment is already isolated behind authenticated
  `bookings:manage` plus `tables:manage` permissions and writes staff-attributed
  audit evidence.

## Production Audit

- Existing active split allocations: 481.
- Future active split allocations: 456.
- Cape Town split allocations: 230.
- Johannesburg split allocations: 251.
- These records remain unchanged for operational review.
- The six Phase 68 single-table review candidates were retrieved with current
  assignments and current available alternatives. Full details are retained in
  the Phase 68 archive.

## Correction Boundary

- Remove every automatic multi-table recommendation and assignment fallback.
- Continue accepting otherwise valid bookings when no table fits.
- Preserve existing assignments, valid merged tables, manual splitting,
  capacities, payments, tickets and all booking eligibility rules.
- Apply no historical reseating or business-data correction.

## Verified Correction

- Shared table recommendations return one existing physical, temporary or valid
  merged operational table, or no recommendation.
- Initial-floor planning no longer creates automatic merges.
- Show-wide planning no longer combines existing or temporary tables for one
  booking. A single reviewed temporary-table option may be shown for manual
  creation; the booking remains unassigned until Box Office acts.
- The reviewed assignment API rejects every automatic table set whose size is
  not exactly one.
- The pending migration makes all four database automatic-assignment loops stop
  after one candidate and adds a fail-closed cardinality guard.
- Existing manual multi-table RPC permissions and staff-attributed audit history
  remain unchanged.

## Verification

- Focused seating, planning, permission and booking-eligibility tests: 42/42.
- TypeScript: passed.
- Changed-file ESLint: no errors; one pre-existing warning remains in
  `zingaraDemo.ts`.
- Production webpack build: passed.
- Migration dry run: only
  `20261030235910_phase_68_strict_single_table_assignment.sql` pending.
- Read-only validation matched every migration pattern against the live
  Production function definitions.

## Production Release

- Application commit: `81a9b1efb6a208cebf84f86a4e3a94198a7336cc`.
- Migration: `20261030235910_phase_68_strict_single_table_assignment.sql`,
  applied successfully through the linked Production workflow.
- Deployment ID: `dpl_5SEnPUKhWXCinXisvHQzxMVkTMXA`.
- Deployment URL:
  `https://zingara-booking-platform-neswt2cfw-kaden-damons-projects.vercel.app`.
- Production aliases include `https://book.zingara.co.za`.
- Deployment status: `Ready`.
- Rollback commit: `ca3bbedd701db8072de6d629d7be5f9f24a55249`.

## Production Verification

- Live read-back confirmed all four automatic assignment functions stop after
  the first candidate and contain the fail-closed multi-table guard.
- Active historical split allocations remain exactly 481 after release.
- All six review candidates retain their original assigned table sets.
- The current-time future subset is 445; the earlier 456 snapshot included
  performances that have since crossed the future-performance boundary.
- The public booking journey and stable Admin login render from the released
  Production deployment.
- No authenticated Admin session was available in the controlled browser, so
  authenticated visual Floor interaction was not represented as completed.

## Business-Data Delta

Zero. No booking, assignment, show table, capacity, payment, ticket, Xero or
communication record was changed. The migration replaced function definitions
only, and no historical booking was reseated.
