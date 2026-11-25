# BUG-000038: Full-Payment Guest Increase

Date: 25 November 2026. Status: verified correction installed; release in progress.

## Confirmed Cause And Impact

Production706ed8c request xksz8-1795608472014-e325f6412a36,25Nov12:07:52.999Z /
14:07:52 SAST failed in /api/admin/bookings/reconciliation with P0001:
FULL_PAYMENT_REQUIRED_BEFORE_TICKET_ISSUANCE. BUG reporter captured14:08:03 SAST.

ZNG-86Q76S is a native Standard public booking, CPT31Dec18:00, Golden Circle506,
three guests, R5820 total/paid, R0 outstanding, no gratuity/add-ons, three valid
individual tickets. Saved show-specific rateR1940; requested five guests adds
R3880, so correct proposed totalR9700/paidR5820/balanceR3880. No invented price,
deposit-only instalment, refund, free ticket or forced paid-state change.

The October4 guest-count AFTER trigger always synchronised guest tickets, while
the October26 NYE guard correctly prohibited issuing new tickets before full
payment. November19's reviewed-price increase reaches the same existing trigger.
The conflict is between ticket timing and the legitimate additional obligation,
not cancellation policy, lost lock, stale version or the unrecorded November12
payment-link migration. All installed functions needed for this increase exist.
The failed transaction rolled back; no successful guest-count amendment/audit or
new tickets/payment records from the failed save. Prior physical move602->506
by Nosi on24Nov remains preserved, including old metadata evidence.

Bounded logs24Nov12:00Z-25Nov12:20Z show11 matching errors across releases. Logs
do not identify every affected booking, so do not call this11 distinct bookings.
Current native full-payment-only/per-guest active cohort19, all future and none
currently outstanding; cohort eligibility is potential scope, not proven failure.
The wider14-day exact-message search timed out; no exhaustive count claimed.

## Smallest Correction

Migration20261125143000_full_payment_guest_ticket_sync.sql changes only the
existing reconcile_guest_tickets_after_pax_increase trigger function and its
existing trigger's update-event predicate. No new table/column or booking update.
Full-only increases save their authoritative obligation but defer new admission
entitlements until fully_paid, paid>=total and balance0. Existing QR identities
are untouched. The existing reconciler runs on subsequent full settlement for
active non-archived bookings; cancelled/archived settlement cannot reissue.
Standard/non-full-only increases retain their existing ticket behaviour.

Neither full-payment guard nor monetary amendment, population identity, seating,
permission, revision, cancellation or communication functions changed. Direct
unpaid ticket creation remains rejected. No side-channel to bypass payment.

## Verification And Production Boundary

-46 targeted tests pass: exact added value, native/deposit/COMP pricing,
  per-guest identities/reduction safety and cancellation allocation regressions.
- TypeScript, new-test ESLint and diff validation pass. No UI/runtime bundle code
  changed. Existing local Turbopack restriction reused; clean Vercel build and
  unchanged performance budget are release gates, not silently bypassed.
- Temporary-table clone tests use actual installed amendment, payment-policy,
  ticket-population and ticket-guard definitions. Old failure reproduced; failed
  save atomic. Permission/stale/price mismatches reject. After correction exact
 3->5 amount/table preserved,3 original ticket identities retained, unpaid issue
  rejected, full settlement creates exactly5, repeat settlement no duplicates,
  standard increase unchanged and cancelled/archived settlement no reissue.
- Tests stub the unchanged table-fit helper and isolate actual SQL in pg_temp;
  they do not claim a real Production capacity reservation or guest payment.
- Repeated against actual installed hook and trigger after migration. No real
  booking amendment/payment/ticket issue/email/Wallet push during verification.
- Before/after booking2304384735602f8a758c3c3f8cb94803,
  paymentsbf2745d3f24a1dde0cb56af6eeb6101d,
  tickets0208a90e58e9b6a354096526ef9add05,
  tableab58305461a408fc6965971e5d21fe21 hashes identical.
- Payment guard8652460256be6de2e69ceda2a79fc8dc, payment policy
 881e12bfaac02565a5c4add3b6f928e8, population0bc91a930afab4c040bd2df2d3a5891e
  and reviewed amendmentb3c8b55125a98ac9561f48111a6b456a unchanged.
  Hook changed2564a5cdecbf0a1220fe20d2dd324d8b ->6263a1ea96e29ca73907e7061ca8ef8c.
- Only new migration version recorded. Known20261112100000 ledger discrepancy
  remains unaltered and is not the cause; no db push of unrelated migrations.

## Release And Retry

Pending governance commit624b31f is expressly authorised in this release.
Application release evidence and issue completion follow after Vercel READY.
Fatima should reopen the latest booking, use existing Edit Guest Count and
review3->5/additionalR3880 before saving. Do not resubmit a stale form. Existing
availability/capacity/lock rules still apply. New tickets wait for full balance
settlement through existing payment controls; no free admission or duplicate pay.

Private evidence: local-evidence/bug38-original-functions.json (rollback
definitions), bug38-before.json, bug38-temp-results.json,
bug38-installed-temp-results.json, bug38-production-db-verification.json.
Rollback: restore original hook and its guest_count-only trigger definition
from the before evidence; no booking/payment/ticket data rollback. This restores
the old operational failure, not an alternative ticket-policy bypass.
Frontend2.0 and unrelated work/checkpoints remain untouched.
