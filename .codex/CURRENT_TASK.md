# Phase 54.4 - Table Reconciliation & Auto-Assignment

STATUS: IN PROGRESS

DATE: 28 OCTOBER 2026

## Objective

Reconcile additional future performances against the approved 74-table,
415-seat master without displacing existing guests or processing the historical
assignment backlog.

## Production Diagnosis

- Phase 54.3 activated 62 zero-booking inactive performances.
- Remaining performances contain 2,453 active booking records, of which 2,154
  do not yet have authoritative physical table coverage.
- No performance with existing bookings is safe for automatic assignment:
  assigning only new bookings would compete with unresolved historical seating
  demand.
- Four additional status-restricted performances currently have no booking
  records, assignments, overrides or merges and can be reconciled without
  changing their restrictions: JHB 10, 14 and 15 November 2026, and CPT
  4 February 2027.

## Implementation Boundary

- Reconcile only the live zero-booking cohort that passes all Phase 54.3
  catalogue-default safety checks at execution time.
- Preserve each show's inactive, sold-out, blackout or special-event status.
- Ensure automatic assignment executes only while a show is actually active.
- Retain all existing guest assignments, temporary tables, merges, overrides
  and manually configured capacities.
- Leave every show with unassigned historical bookings in manual mode.
- Record resolved and pending Phase 54.4 decisions with exact evidence.
- Preserve the 70% threshold, 10-day reminder, notifications, manual overrides,
  ticket-sale capacity, exports, pricing, payments, tickets and Xero.

## Verification

- Rollback-only Production migration rehearsal and exact cohort counts.
- Isolated, rolled-back end-to-end booking-to-table assignment using an adopted
  performance temporarily made active inside the transaction.
- Two-booking collision check confirms different physical table claims.
- Focused reconciliation and Phase 54.2 assignment tests.
- TypeScript, changed-file ESLint, `git diff --check`, Production build and live
  post-release checks.
