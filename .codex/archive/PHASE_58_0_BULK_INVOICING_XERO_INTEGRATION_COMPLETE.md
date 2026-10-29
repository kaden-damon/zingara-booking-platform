# Phase 58.0 - Bulk Invoicing & Xero Integration

Completed: 29 October 2026

## Delivered

- Added a compact Bulk Invoicing panel inside the existing Zingara x Xero
  workspace, visible only to Tristan Chetty and Rachelle Smuts.
- Added weekly and custom booking-creation date ranges, payment filters,
  booking selection and one authoritative local invoice draft per booking.
- Included reconciled fully paid, partially paid and unpaid bookings without
  changing or allocating historical payments.
- Added durable batches with per-booking progress, resumable chunks of 10 and
  a hard limit of 50 bookings per batch.
- Added duplicate prevention, missing billing-data blockers and financial
  reconciliation checks.
- Corrected the database queue guard so accepted-quote invoices and verified
  direct booking invoices retain their distinct fail-closed rules.
- Kept live bulk Xero posting disabled. Production does not have
  `XERO_BULK_INVOICE_POSTING_AUTHORISED` configured.

## Financial Safety

- No invoice, Xero contact, payment allocation, customer communication or
  Xero financial record was created during QA or release.
- No historical document was queued or posted.
- Existing approved venue mappings and ordinary controlled Xero sync were not
  changed.
- Missing billing details are shown as blockers and are never invented.

## Verification

- Production read-only payment-position and billing-readiness queries passed.
- 15 focused bulk/direct invoice/Xero activation tests passed.
- TypeScript, changed-file ESLint and `git diff --check` passed.
- Supabase migration dry run and Production application passed.
- Full Next.js Production webpack build passed.
- The default Turbopack build was blocked locally by an operating-system
  compiler worker port restriction in an unrelated Table Plan file. The Vercel
  Production build completed successfully.
- Production Admin returned HTTP 200 and the new API returned HTTP 401 without
  authentication.
- Authenticated visual verification was not claimed because the available
  browser session could not be used without interrupting active user work.

## Release

- Commit: `e5a8dd5`
- Deployment: `dpl_4aSbUobkcF3Hy2Esvg6gHS69aDHZ`
- Production: `https://book.zingara.co.za`
- Rollback: `0555e9ee2f4a43c1ca2f4b1c2de04020aef029de`

## Production Business-Data Delta

- Added empty durable batch and item tables.
- Replaced the invoice queue function with the verified direct/bulk-compatible
  guard.
- Batch rows: 0 after release.
- Batch item rows: 0 after release.
- Booking, customer, payment and Xero financial rows changed: 0.

## Remaining Approval

Bulk posting to Xero remains unavailable until Accounts approves the final VAT
and posting scope and Production explicitly configures
`XERO_BULK_INVOICE_POSTING_AUTHORISED=true` in a separate activation release.

PHASE 58.0 COMPLETE - BULK INVOICING READY; BULK XERO POSTING DISABLED.
