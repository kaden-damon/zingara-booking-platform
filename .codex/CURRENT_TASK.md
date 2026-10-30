# Phase 68 Follow-up - Strict Single-Table Allocation

STATUS: RELEASE READY - VERIFIED CORRECTION

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

## Pending Release Evidence

- Commit and push the verified correction.
- Apply the migration and verify all four live functions.
- Verify the resulting Production deployment and record the final rollback.
