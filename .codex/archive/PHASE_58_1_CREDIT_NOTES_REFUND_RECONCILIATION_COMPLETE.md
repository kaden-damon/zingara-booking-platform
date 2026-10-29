# Phase 58.1 - Credit Notes & Refund Reconciliation

STATUS: COMPLETE

DATE: 29 OCTOBER 2026

## Release

- Application commit: `c06d777`
- Production deployment: `dpl_HPVEEiKGa7uWwkCLy4w94dQoA8wS`
- Production URL: `https://book.zingara.co.za`
- Rollback point: `034b01c8694dbdb4ddcf2dd595c608a427378908`
- Migration: `20261029193000_phase_58_1_credit_notes.sql`

## Delivered

- Added `Create Credit Note` to Booking Details for active issued Xero invoices
  with a remaining creditable value.
- Added full and partial line selection using the original invoice description,
  account category, VAT code and VAT rate.
- Added mandatory reasons, optional verified refund evidence, original invoice
  identity, previously credited value and remaining creditable value.
- Added durable idempotency, invoice-row locking, remaining-value enforcement,
  venue scoping, immutable audit evidence and exact staff-ID permissions.
- Added credit-note draft visibility in the existing Zingara x Xero workspace.
- Kept accounting credit notes, customer refunds and Xero reconciliation as
  separate authoritative states.

## Permissions

- Tristan Chetty: `1c9779e7-0e7e-4c58-9fa8-a58c9b16ea0d`
- Rachelle Smuts: `3ea8ff16-d914-477b-95fc-23380e71019a`
- Both identities were verified active in Production.
- All other staff and direct API requests are denied server-side.

## Xero Boundary

- Connected organisation: Zingara Productions (Pty) Ltd.
- Existing 16 approved mappings remain unchanged.
- Ordinary approved invoice sync remains active and unchanged.
- `XERO_CREDIT_NOTE_POSTING_AUTHORISED` is not enabled.
- `Create in Xero` is disabled and no credit-note operation enters the live
  Xero worker or outbox.
- Required accounting decisions before activation: paid versus unpaid invoice
  handling, allocation versus account credit, booking-fee and gratuity reversal,
  VAT treatment for each line category, and authoritative refund reconciliation.

## Verification

- 36 focused Xero, permission, calculation and access tests passed.
- TypeScript passed.
- Changed-file ESLint passed.
- `git diff --check` passed.
- Migration dry-run identified only the Phase 58.1 migration.
- Production migration applied successfully; credit-note row count remained 0.
- Next.js 16 Webpack Production build compiled successfully. The local
  Turbopack worker was unavailable because the execution host blocked its local
  worker port; Vercel's Production build completed successfully in 1m20s.
- Deployment is Ready and the new Production API returns `401 Unauthorized`
  without an authenticated staff session.

## Business Data Delta

- New schema, sequence, indexes, RLS controls and atomic draft function only.
- Credit notes created: 0.
- Refunds created or changed: 0.
- Xero records created or changed: 0.
- Bookings, payments, tickets, invoices and customer communications changed: 0.

PHASE 58.1 COMPLETE - CREDIT NOTES & REFUND RECONCILIATION READY FOR ACCOUNTING APPROVAL.
