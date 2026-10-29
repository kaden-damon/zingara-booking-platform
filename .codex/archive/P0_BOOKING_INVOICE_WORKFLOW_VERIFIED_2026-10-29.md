# P0 - Booking Invoice Workflow Verified

Completed: 29 October 2026

## Root Cause

Booking Details only listed linked documents. Existing paid bookings without a
historic quotation had no invoice entry point, booking prefill defaulted to a
quote, and controlled Xero submission accepted only quote-derived invoices.

## Correction

- Added a permissioned Booking Details entry point for confirmed, fully paid
  bookings with no invoice.
- Reused the existing Xero document editor and sync worker.
- Built invoice lines from authoritative stored booking values and preserved
  venue mappings, VAT, separate gratuity and Xero numbering.
- Restricted direct booking invoices to Tristan Chetty and Rachelle Smuts.
- Required exact reconciliation between document total, booking total, verified
  payments and zero balance before Xero submission.
- Added atomic duplicate prevention for direct booking invoices.

## Verification

- PMG GROUP `ZNG-HT3FEZ`: 13 guests, Johannesburg, R18,125 paid, R0 due.
- Preview: R16,240 ticket sales, R10 booking fee, R1,875 gratuity; total R18,125.
- Xero tenant: Zingara Productions (Pty) Ltd; connected; sync active; 16 approved
  mappings; zero active outbound items.
- 67 focused Xero tests, TypeScript, changed-file ESLint, diff check and the
  optimized Next.js Production build passed.
- Authenticated Production interface and Vercel deployment verified.

Application commit: `65377e0`

Rollback: `6259d46515303b56ad021d170f2a3c5f304aa083`

Business-data delta: none. One additive uniqueness index was applied; no
invoice, quote, contact, payment, communication or booking record was created or
changed during QA.
