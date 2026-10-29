# Phase 58.0 - Bulk Invoicing & Xero Integration

STATUS: IN PROGRESS

DATE: 29 OCTOBER 2026

## Goal

Extend the existing Xero document architecture with permissioned, bounded bulk
invoice draft generation for eligible existing bookings, grouped by booking
creation date, with durable progress and duplicate protection.

## Activation Boundary

- Bulk draft preparation may be deployed for Tristan Chetty and Rachelle Smuts.
- Live bulk posting remains disabled until VAT/accounting approval is confirmed.
- No Production invoice, Xero contact, payment allocation or customer
  communication may be created during QA.
- Historical PayFast payments remain unchanged and are not automatically
  allocated in Xero.

## Safety

- Reuse authoritative booking values, approved mappings and the existing Xero
  outbox/worker architecture.
- Flag missing billing information instead of inventing it.
- Preserve unrelated working-tree changes and all existing business data.

## Implemented

- Added the existing Xero workspace's permissioned Bulk Invoicing panel.
- Added weekly/custom booking-date review, payment filters, selection and one
  local invoice draft per authoritative booking.
- Added durable batches and per-booking progress in bounded chunks of 10, with
  a maximum of 50 bookings per batch.
- Added strict duplicate prevention and billing/financial readiness blockers.
- Corrected the Xero queue contract so verified direct booking invoices no
  longer conflict with the accepted-quotation-only database guard.
- Kept bulk Xero posting behind
  `XERO_BULK_INVOICE_POSTING_AUTHORISED=false`/unset and visibly unavailable.

## Verification

- Live read-only booking/payment classification query completed.
- Focused Xero tests passed (15 assertions/tests across bulk, direct invoice and
  activation coverage).
- TypeScript passed.
- Changed-file ESLint passed.
- Migration dry run passed; only the Phase 58 migration is pending.
- `git diff --check` passed.
- Full Next.js Production webpack build passed. The repository performance
  budget parser cannot read webpack's manifest format; no budget source or
  threshold was changed.

STATUS: RELEASE IN PROGRESS
