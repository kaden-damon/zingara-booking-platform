# Phase 65 - Balance Payment Reconciliation & Table Plan Integrity

STATUS: IMPLEMENTED AND VERIFIED LOCALLY - PRODUCTION RELEASE IN PROGRESS

DATE: 30 OCTOBER 2026

## Scope

Resolve intermittent balance-payment reconciliation and Table Plan payment discrepancies without changing booking values, financial rules, checkout design or historical evidence.

## Root Causes

1. `prepare_payfast_checkout_attempt` reused and rewrote the latest pending payment row for every new checkout attempt.
2. ITN validation selected the latest pending row for the booking, irrespective of which payment link or checkout generated the callback.
3. Final confirmation repeated the same latest-row selection. Delayed and out-of-order callbacks could therefore attach to the wrong attempt.
4. Table Plan correctly consumes all payment rows and the authoritative booking aggregate, but cannot display a missing or incorrectly bound payment row.
5. Active historical payment links were not consistently retired after full settlement.

## Historical Audit

- Complete booking population audited: 6,965.
- Managed payment-link population audited: 348.
- Durable ITN receipts audited: 1,629; all processed and linked, with 32 duplicate callbacks safely deduplicated.
- Multi-PayFast-payment bookings audited: 130; all reconciled exactly, R0.00 discrepancy.
- Confirmed PayFast rows audited: 3,552, totalling R20,474,429.70.
- Historical aggregate/payment-row gaps: eight bookings, R151,194.50. These are imported, manual, platform-era or pre-durable-receipt records and remain unchanged pending authoritative manual evidence.
- Obsolete active links on settled bookings: 44, safe to revoke without deleting records.

## Correction

- Added a distinct checkout-attempt function and indexed pending-attempt lookup.
- Passed the attempt UUID in the signed PayFast payload.
- Added exact attempt validation and an atomic confirmation wrapper around the established financial core.
- Preserved the provider transaction ID as the immutable duplicate boundary.
- Retained an exact-amount legacy path without selecting a different pending amount.
- Revoked active links after authoritative settlement while retaining the link and metadata.
- Added focused Table Plan coverage for deposit plus multiple balance payments and non-confirmed rows.

## Verification

- 54 focused payment, link, idempotency, concurrency and Table Plan tests passed.
- TypeScript passed.
- Changed-file ESLint: no errors.
- Supabase migration dry run passed.
- Production webpack compilation passed; the existing performance-budget parser remains incompatible with the current client-reference manifest.

## Release Evidence

Pending controlled Production release.
