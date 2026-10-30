# Phase 65 - Balance Payment Reconciliation & Table Plan Integrity

STATUS: COMPLETE - RELEASED AND VERIFIED IN PRODUCTION

DATE: 30 OCTOBER 2026

## Baseline

- Authoritative checkout: `/Users/kadendamon/.codex/worktrees/phase-50-12-admin-performance/zingara-booking-platform`
- Starting application commit: `00515e4fbe4e20400666f5da8f0dfd7defe51d3a` (`HEAD` and `origin/main`).
- Existing user-owned Markdown records and report artifacts remain preserved and excluded.

## Verified Diagnosis

- Checkout preparation reused the newest pending payment row for a booking and changed its amount for subsequent attempts.
- ITN amount validation and atomic confirmation also selected the newest pending row rather than the checkout that generated the signed callback.
- Delayed or out-of-order callbacks could therefore validate against, or update, a different payment attempt.
- Table Plan already loads every payment row for the selected performance and caps payment buckets against the booking aggregate. Its discrepancies originate when the authoritative payment row/aggregate is incomplete or mismatched, not from pagination or venue filtering.
- Settled bookings retained active historical payment links that could no longer represent a payable balance.

## Production Read-Only Audit

- 6,965 bookings audited: 2,403 Cape Town and 4,562 Johannesburg.
- 348 bookings have managed payment links: 132 Cape Town and 216 Johannesburg.
- 1,629 durable PayFast ITN receipts were inspected. All are processed, fully validated and linked to payment rows; 32 repeated callbacks were deduplicated safely.
- 130 bookings contain two to four confirmed PayFast payments. All 130 reconcile exactly to the booking aggregate with R0.00 discrepancy.
- 3,552 confirmed PayFast rows total R20,474,429.70 across both venues.
- Eight older linked bookings have R151,194.50 of aggregate value not represented by normalized confirmed payment rows. Their evidence predates durable ITN receipts or reflects imported/manual history, so no financial row was manufactured or changed.
- 44 active links belong to authoritatively settled bookings and are eligible for safe revocation while preserving their records and metadata.

## Implementation

- Every checkout now creates a distinct pending payment attempt.
- The signed PayFast payload carries the payment attempt ID in `custom_str3`.
- ITN validation binds to that exact booking-owned attempt. Legacy callbacks use an exact amount match and never consume an unrelated pending amount.
- Atomic confirmation serializes by booking, preserves provider-transaction idempotency and isolates the selected attempt before reusing the established financial core.
- Completed bookings revoke remaining active links without deleting historical evidence.
- Existing Table Plan columns, formulas and design are unchanged; regression coverage verifies deposit plus multiple balance payments, pending/failed rows and duplicate-safe totals.

## Verification

- 54 focused tests passed.
- TypeScript passed.
- Changed-file ESLint passed with two pre-existing warnings in the ITN route and no errors.
- `git diff --check` passed.
- Supabase linked migration dry run passed and identified only the Phase 65 migration.
- Next.js 16.3.4 webpack Production compilation and TypeScript passed. The separate pre-existing Admin client-reference performance-budget parser still rejects the current manifest format.

## Safety

- No real payment, charge, refund or customer communication was created.
- No booking, payment, ticket, seating, VAT or Xero value was changed during investigation or QA.
- Ambiguous historical financial gaps remain untouched for manual reconciliation.

## Production Release

- Application commit: `99640c8c14313b738d1a128aba0deee32e394a51` (`fix: reconcile balance payment attempts`), pushed to `origin/main`.
- Migration `20261030190000_phase_65_balance_payment_reconciliation.sql` applied successfully through the linked Supabase workflow.
- Vercel Production deployment completed successfully: GitHub deployment `7442936761`, environment URL `https://zingara-booking-platform-8pfnl1022-kaden-damons-projects.vercel.app`, aliased to `https://book.zingara.co.za`.
- Rollback application commit: `00515e4fbe4e20400666f5da8f0dfd7defe51d3a`.

## Production Verification

- Production exposes both Phase 65 functions and the pending-attempt index.
- The migration revoked 44 obsolete active links across 44 settled bookings; zero settled bookings retain an active link.
- All 1,630 durable ITN receipts present after release are processed and linked to payment rows; no receipt is incomplete or unprocessed.
- All 130 multi-PayFast-payment bookings still reconcile exactly to their booking aggregates.
- `https://book.zingara.co.za/book` returns HTTP 200 from Vercel.
- Business-data delta: 44 payment-link status changes from `active` to `revoked`, with a retained Phase 65 reason in metadata. No booking, payment, PayFast reference, VAT, refund, ticket, seating, customer, communication or Xero record changed.
