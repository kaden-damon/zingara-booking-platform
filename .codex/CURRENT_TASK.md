# Phase 59 - COMP Booking Categories & Table Plan

STATUS: IN PROGRESS

DATE: 29 OCTOBER 2026

## Goal

Extend authorised internal Standard booking creation with explicit Standard,
Media and Tradex complimentary categories while preserving the existing
complimentary classification, financial safeguards and Table Plan export.

## Approved behaviour

- Standard COMP: R0 per guest and R0 payable.
- Media COMP: R550 per guest, retained as COMP, with the actual unpaid balance.
- Tradex COMP: R550 per guest, retained as COMP, with the actual unpaid balance.
- New internal complimentary bookings require an explicit category selection.
- Historical complimentary bookings without authoritative category evidence
  remain Standard COMP and retain their existing financial values.
- Media remains in Table Plan column S; Tradex is inserted immediately after it.
- No PayFast, Xero, seating, capacity, show-status or communication changes.

## Verification boundary

Implement and verify the internal booking UI, authoritative server pricing,
guest-count amendments, persistence, Table Plan formulas and generated workbook
outputs for both venues. Preserve all unrelated working-tree files.
