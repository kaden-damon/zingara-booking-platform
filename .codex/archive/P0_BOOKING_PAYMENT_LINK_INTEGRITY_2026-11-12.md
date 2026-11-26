# P0 Booking & Payment Link Integrity

STATUS: COMPLETE - SHARED FIX DEPLOYED; CUSTOMER REMEDIATION PENDING APPROVAL

DATE: 12 NOVEMBER 2026

## 26 November Follow-Up: BUG-000040

- Authority: current user authorises scoped fix/release, no invented transactions.
  Existing reservation API, getBookingFinancials, paymentControls, Table Plan finance
  and customerExportServer reused; no new workflow, query, dependency or migration.
- staff_issue_reports2a58030e-c8d8-4b96-84a7-31f94868c9a7 lacks attachment/reference.
  Fatima's exclusive lock on booking40614773-2081-415f-a8a7-aeab9b985b3e,
  ZNG-QA6N4W,11:10:55.797-11:14:15.954 SAST brackets11:13:25 report. Only her
  acquisition in bounded preceding20min; competing lock rejected11:12:27.
- CPT15Dec18:00,15PB guests, native admin_staff/admin pending_payment, unassigned.
  Original12Nov10:34:47 SAST creation already saved R21600 total/R0 paid/R13350
  balance, subtracting requested15xR550 deposit before payment. Original notes
  match; no later financial amendment. One R0 pending platform payment, no provider
  identity/receipt; no successful or legacy payment evidence. This is a persisted
  projection/display defect, not actual collection or recent cancellation regression.
- Root path: checkout balanceDue legitimately projects balance AFTER requested
  payment. Trusted Admin reservation copied that projection while paid remained0;
  public authoritative pricing already used full unpaid total. Correct new native
  reservations before getBookingPayload, including embedded notes, without changing
  generic historical booking update semantics. Shared narrowly guarded resolver
  corrects active native pending/zero-paid presentation and exports; reuses exact
  cents total-minus-confirmed-paid. Imported/corporate_direct/paid/cancelled/refunded/
  COMP balances and original loaded snapshots remain untouched. Deposit requested
  distinguishes demand from receipt. Existing payment links already use total-paid.
- Bounded indexed active/unarchived unpaid mismatch query found32 native Admin
  bookings,21 future and11 past; all32 have zero successful payment entries. Three
  Corporate-direct candidates ZNG-9EXVKZ(R30600),ZNG-YY5W8V(R51975),ZNG-BE4CYH
  (R48600) have zero paid/balance and require separate contract evidence, not this
  native correction. Counts are a dated candidate scan, not platform-wide loss.
- Historical row/metadata values are intentionally NOT rewritten. Accounts review
  and separate authorised reconciliation needed for raw balances; reduction-basis
  mismatch safeguard remains active. No bypass or automatic repricing. No customer
  communications, payment, seating, tickets, public prices or Frontend2 changes.
- Verification:90 focused tests before additional CRM regression;17/17 subsequent
  CRM/payment-controls/link checks overlap prior suites. TypeScript passed, lint0
  errors/3 existing route warnings, diff check passed. Original BUG37/38/39,
  cancellation/partial-paid/outstanding-allocation/ticket-sync tests retained.
- Isolated authenticated fixture uses actual GET/link handlers, real staff permission
  checks and temporary cloned SQL functions with rollback, actual financial function
  and extracted Full price breakdown JSX. Paid0/deposit requested8250/outstanding
  21600/link21600; close/reopen correct, original raw13350 preserved, no payment
  created.390/1280 screenshots have no overflow. Harness is minimally styled, NOT
  a full authenticated Production Admin interaction or physical iPhone verification.
  Private local-evidence/bug40-workflow-results.json and bug40-breakdown-*.png.
- Release baseline Main1d92065/dpl_58qBfqYtpbZVeyMVwn6zStWMBQq6; pending local
  documentation93f07ed included. Final READY/alias/budget evidence to follow.
- Staff note after verified release: "An unpaid deposit was reducing the amount
  shown as owing. The breakdown now shows the full unpaid amount, and new bookings
  save it correctly. Refresh Booking Details."

## Reference Reconciliation

### ZNG-C7CD9T - Standard

- The booking was created for 14 Golden Circle guests at R1,540 each. Its
  original R21,560 full-payment link was therefore correct when created.
- Staff later reduced the booking to 10 guests. The shared reduction function
  changed the guest count but intentionally retained the old financial values,
  leaving the link at R21,560 and the deposit basis at 14 x R550 = R7,700.
- R7,700 was a requested deposit basis, not a collected payment. No payment,
  PayFast ITN or provider settlement exists for this booking.
- A subsequent manual reconciliation changed the live total to R17,325. That
  amount is R15,400 tickets plus R1,925 (12.5%), even though this Standard
  booking's gratuity is payable at the venue. The embedded booking metadata and
  the active payment link remained at R21,560.
- The authoritative current Standard calculation is R15,400 tickets,
  R0 upfront gratuity, R15,400 total and R5,500 deposit. A PayFast transaction
  adds the configured R10 fee only at checkout; it does not change booking
  revenue or the deposit obligation.

### ZNG-5P686H - Friends & Family

- The booking is 2 Golden Circle guests at the authorised R1,150 Friends &
  Family rate: R2,300 total.
- Its R1,100 link is the correct deposit: 2 x R550. No payment, PayFast ITN or
  provider settlement exists. If paid through PayFast, the current transaction
  boundary adds one R10 fee, producing R1,110 payable while allocating R1,100
  to the booking.

## Root Cause And Correction

- The generic guest-count reconciliation treated every decrease as financially
  neutral. That remains correct for paid retained-value workflows but was wrong
  for unpaid native per-person Standard and Friends & Family bookings.
- Manual financial reconciliation updated numeric booking columns without
  synchronising embedded metadata or invalidating an existing active link.
- Legacy deposit-link selection reconstructed deposits from a percentage of a
  stale total and rounded too early instead of preferring the saved or current
  authoritative fixed per-person deposit.
- New service-only atomic reconciliation now:
  - reprices only unpaid native per-person reductions from their saved ticket
    rate;
  - resolves the fixed deposit from saved provenance or authoritative venue
    configuration;
  - preserves exact cents and Standard pay-at-venue gratuity;
  - keeps existing table, capacity, ticket and audit guards;
  - synchronises booking metadata; and
  - revokes active payment links in the same transaction.
- Manual financial reconciliation now synchronises metadata and invalidates
  active links atomically. Paid reductions, Corporate fixed prices, imports,
  COMP and retained-value workflows remain on their established paths.
- Payment-link amount selection now prefers `depositPerPerson x current guest
  count` and preserves cents. No new request, polling, render or background
  path was introduced.

## Platform Audit

- Audited 2,667 future active bookings across Cape Town and Johannesburg.
- The audit found one active unpaid native booking with the exact reduction
  defect: `ZNG-C7CD9T`, overstated by R1,925 against its saved R1,540 rate.
- Audited 29 active unexpired payment links. Exactly one is stale:
  `ZNG-C7CD9T` for R21,560. Existing checkout protection rejects it before
  PayFast; Production Admin also labels it `STALE` and unusable.
- The Friends & Family link is financially correct. No duplicate booking fee,
  upfront gratuity, payment, ITN or settlement discrepancy was found for either
  reference.
- Existing mixed-allocation support does not combine two different paid rates
  within one ordinary booking. The two current reservations must not be merged
  or cancelled without explicit authorisation.

## Verification

- Focused financial/payment-link tests: 10/10 passed.
- Broader reconciliation, balance-link, payment management and PayFast suite:
  50/50 passed. TypeScript, changed-file ESLint and `git diff --check` passed.
- The Next.js webpack Production build compiled all routes and TypeScript. The
  existing performance-budget script cannot read webpack's client-reference
  manifest; the default Turbopack build cannot bind its local worker port in
  this execution environment. Vercel's authoritative Production build reached
  Ready in 29 seconds.
- The migration compiled successfully in a rollback-only Production schema
  check before application. Both new functions are deployed with execute
  permission restricted to `service_role`; `authenticated` has no direct
  execute permission.
- Authenticated Production Admin verified:
  - `ZNG-C7CD9T`: 10 guests, R17,325 outstanding, gratuity payable at venue,
    and the R21,560 payment link clearly marked `STALE` and unusable.
  - `ZNG-5P686H`: 2 guests, R2,300 total/outstanding, gratuity payable at venue.
- Production `/admin` returned HTTP 200. No booking form was submitted and no
  link, payment, booking, customer communication or customer record changed.

## Release And Rollback

- Application commit: `59a339aaf05d32bd8bf71fb9421ea327c3e91748`.
- Migration: `20261112100000_p0_booking_payment_link_integrity.sql`.
- Production deployment: `dpl_DVBLmnbrrnhC5GJKWTRKrbW6yrdX`, Ready and
  aliased to `https://book.zingara.co.za` at 09:08:17 SAST.
- Rollback: revert `59a339a`, deploy, then drop the two new wrapper functions if
  schema rollback is required. No data rollback is required because the
  migration contains no backfill or record mutation.
- Business-data delta: none.

## Customer Remediation Requiring Approval

Do not send or alter anything until authorised:

1. Reconcile `ZNG-C7CD9T` to subtotal/total/outstanding R15,400, paid R0,
   service fee R0, with synchronised metadata.
2. Revoke the stale R21,560 link atomically (the deployed reconciliation now
   does this automatically).
3. Confirm whether Box Office wants a R5,500 deposit request or R15,400 full
   payment request. PayFast will add one R10 transaction fee at checkout.
4. Leave `ZNG-5P686H` at R2,300 with its existing R1,100 deposit link unless
   separately instructed.
5. Do not merge or cancel the two bookings without explicit authorisation.
