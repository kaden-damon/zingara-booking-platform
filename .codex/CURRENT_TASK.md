# Phase 55 - Complete Seating Alignment & Automatic Assignment

STATUS: IN PROGRESS

DATE: 28 OCTOBER 2026

## Objective

Reconcile every current and future Cape Town and Johannesburg performance against
Richard's approved 74-table / 415-seat physical seating master, preserve every
confirmed entitlement and assignment, safely assign eligible pre-activation
bookings, and retain the configurable 70% rule for new bookings only.

## Production Baseline

- `main` and `origin/main`: `e436a787c5c97ff957fdb3ac3e71739c3f4395ad`.
- Phase 54.13 application release: `b028ceab82683b757e8612de7536f09a7018ab88`.
- Phase 54.13 deployment: `dpl_8R5udSkiAfSPfE2XgebjSVgA7P1E` (`READY`).
- Existing unrelated untracked audit artifacts remain user-owned and untouched.

## Authoritative Source

- Richard's approved `Table Plan Template.xlsx` only.
- Both venues: Golden Circle 120, Middle Ring 125, Private Booths 138,
  Royal Balcony / ESA 32; total 415 seats across 74 permanent tables.
- Individual table code, zone, minimum occupancy and maximum capacity must match
  the workbook exactly; zone totals must never be used to infer table values.

## Safety Boundary

- Do not modify completed historical performances.
- Preserve every existing booking, guest entitlement, confirmed table assignment,
  temporary table, merged table, operational exception and audit record.
- Never displace guests, manufacture capacity, overwrite an assigned table or
  weaken atomic capacity/concurrency safeguards.
- Keep ticket-sale capacity distinct from physical seating capacity. Do not reduce
  sold entitlements or silently alter availability where commitments conflict.
- The one-time 70% exemption applies only to safely assignable bookings created
  before the recorded Phase 55 activation timestamp. New bookings retain the
  configured threshold, notifications, review reminder and approval controls.
- No payment, ticket, Xero, customer or financial-record changes.

## Execution Plan

1. Locate and verify the approved workbook and current Production baseline.
2. Produce a complete read-only dry run covering every current/future performance,
   permanent and operational table, capacity display and unassigned booking.
3. Classify each discrepancy as safe correction, protected commitment conflict or
   genuine manual exception; verify exact before/after counts and rollback evidence.
4. Implement only the smallest reusable reconciliation and cutoff logic required,
   processing independently proven safe changes in bounded, auditable batches.
5. Verify physical and ticket capacity separation, automatic assignment, 70% cutoff,
   exports, displays, concurrency, booking performance and business-data integrity.
6. Commit, push and deploy only after all safety assertions pass; archive Phase 55
   with exact Production counts, deployment and rollback references.
