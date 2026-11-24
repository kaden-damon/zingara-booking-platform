# Phase 65 - Balance Payment Reconciliation & Table Plan Integrity

STATUS: COMPLETE - RELEASED AND VERIFIED IN PRODUCTION

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

The eight normalized-history gaps requiring manual evidence are:

- `DP-BL21NC`: R1,732.50
- `DP-JHB-3DAB35803661`: R17,160.00
- `DP-JHB-959E062D2E68`: R2,200.00
- `ZNG-98R23K`: R113,220.00
- `ZNG-FEED5M`: R2,200.00
- `ZNG-GQEC53`: R9,202.00
- `ZNG-HZRDAT`: R4,400.00
- `ZNG-JNSLL3`: R1,080.00

These figures are differences between the booking aggregate and normalized confirmed payment rows. They are not proof of missing cash and were not automatically corrected.

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

- Application commit: `99640c8c14313b738d1a128aba0deee32e394a51`.
- Supabase migration `20261030190000_phase_65_balance_payment_reconciliation.sql` applied successfully.
- Vercel Production deployment: GitHub deployment `7442936761`; environment `https://zingara-booking-platform-8pfnl1022-kaden-damons-projects.vercel.app`; `https://book.zingara.co.za` HTTP 200.
- Production functions and index verified present.
- Forty-four settled-booking links were revoked with preserved records and metadata; zero remain active.
- All 1,630 durable receipts are processed and linked after release.
- All 130 multi-PayFast-payment bookings retain R0.00 aggregate discrepancy.
- Rollback commit: `00515e4fbe4e20400666f5da8f0dfd7defe51d3a`.
- Business-data delta: payment-link status/metadata only. No financial, booking, payment, ticket, seating, communication or Xero row changed.

## 23 November 2026: Review Payment Shortcut Correction

Root cause: the Booking Details Needs attention shortcut checked only positive
balance, while the target Payment Controls section required canManageBookings
and !bookingIsReadOnly. Cancelled/archived ZNG-YW2USY therefore showed a hash
link with no target. Active read-only/unauthorised views were also susceptible.
Existing Theresa audit reused: cancelled/archived after 21 November hold expiry,
R0 paid/R7,700 outstanding. No new booking investigation or record change needed.

Small UI-only correction: reuse isPaymentLinkEligible (existing terminal status,
archival, payment-state and outstanding rules) plus the existing management and
editability checks. Eligible button explicitly scrolls/focuses its booking's
existing controls, now programmatically focusable. It does not initiate payment,
create/send a link, request an edit lock or reinstate a booking. Cancelled attention
copy now states Booking cancelled rather than prompting collection. Existing
financial summary, payment controls and authorised reinstatement paths preserved.

Verification: 15 targeted tests pass (five tests execute the actual page's AST
eligibility expression/handler; ten existing balance-link regressions). Cancelled,
archived, terminal, unpaid, deposit-paid, fully paid, complimentary and refunded
states covered, plus permission/read-only access and target identity. TypeScript,
test ESLint and whitespace checks pass. Initial TypeScript found a redundant
cancelled comparison after a new narrowing branch; removed before release.
Local synthetic Chromium checks at 320/1280px execute the actual button JSX and
eligibility expression: scroll/focus works, no hash navigation, cancelled shortcut
absent, no page errors. Evidence local-evidence/review-payment-browser-results-
2026-11-23.json and fixture script. This is not physical iPhone/live staff QA.

Only src/app/admin/page.tsx and src/lib/reviewPaymentControl.test.ts are in scope.
No API/server/payment processing/financial calculation/permission/schema change,
queries, dependencies or migrations; no booking/payment/customer/ticket/message
mutation, including Theresa. Frontend 2.0 and unrelated uncommitted work preserved.

Production release: **115c3f4380ab1152341f131d3910b372a6d7e402**, pushed to main;
**dpl_A5SCRiFYe8MxaWsWVtLoke8BZQ9J**, **READY**, exact SHA and
`book.zingara.co.za` alias verified. Initial status lookup returned 403 because
the existing Vercel session token expired; normal existing CLI whoami refreshed
the session, after which read-only verification succeeded. No project setting or
credential value was edited/exposed to work around this.

Actual live verification 23 November 18:53:06 SAST: `/admin` HTTP 200, served
`/_next/static/immutable/chunks/1av0hn9qhegi-.js` contains Review Payment's
booking-specific controls target and explicit scroll/focus handler. Read-only
unauthenticated payment-link lookup for ZNG-YW2USY returns 401 without link data.
No authenticated live staff session was available; the actual JSX/eligibility/
click behaviour was verified in local fixtures, not falsely claimed as live UI QA.
Evidence: local-evidence/review-payment-production-deployment-2026-11-23.json and
review-payment-production-http-2026-11-23.json. Documentation updates remain local;
only the two approved source/test files were committed. No real financial action.
