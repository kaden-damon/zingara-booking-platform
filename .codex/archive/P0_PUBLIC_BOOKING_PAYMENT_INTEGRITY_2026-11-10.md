# P0 - Public Booking And Payment Integrity

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 10 NOVEMBER 2026

## Scope And Safety

- The public path was traced from availability and reservation creation through
  PayFast checkout, provider returns and ITNs, payment reconciliation, booking
  confirmation and Admin visibility.
- Production investigation was read-only. No booking, payment, ticket, seating,
  communication or financial record was created, changed, replayed or deleted.
- The audit window began at 00:00 SAST on 9 November 2026 and included activity
  through 10 November 2026.

## Authoritative Reconciliation

- 103 online reservations were created: 72 confirmed/paid, 28 expired payment
  holds, two superseded holds and one still-active pending hold.
- The confirmed set contains 58 fully paid and 14 deposit-paid reservations.
- 86 PayFast ITN receipts were received. All 86 were `COMPLETE`, processed and
  uniquely linked to an existing provider transaction, payment row, payment
  link and booking. Gross receipts totalled R519,108.00.
- There were zero complete receipts without a booking, zero captured payments
  without a visible booking, zero missing payment links and zero paid receipts
  linked to an archived/cancelled reservation.
- Twelve explicit PayFast cancelled returns were recorded. Ten belong to the 28
  expired holds; 20 expired holds have no return or ITN and are classified as
  abandoned. There were no PayFast failed returns and no checkout 500/503
  preparation failures in the audited window.
- Thirty-seven candidate references had no booking, payment or ITN. Each failed
  reservation creation before persistence, overwhelmingly under the existing
  two-seat restriction. They are journey telemetry identifiers, not bookings or
  payment references, and were not presented as completed reservations.

## Confirmed Root Causes

1. Find My Booking exposed Continue Payment whenever either booking or payment
   status was pending. Expired holds retain `payment_status = pending_payment`
   after their booking is cancelled and archived, so the page incorrectly
   offered PayFast checkout for records that could no longer be paid.
2. Admin's default booking list uses active-only and hide-cancelled filters.
   Exact reference searches inherited those filters, excluding durable expired
   reservations and making them appear absent to Box Office.
3. PayFast cancelled/failed return recovery linked to a fresh `/book` journey,
   increasing duplicate-reservation risk instead of recovering the already
   persisted reference.

`ZNG-VYBT2X` demonstrates the combined failure: it was created at 22:10 SAST
on 9 November, received a cancelled PayFast return at 22:16, expired at 22:42,
and later generated 12 rate-limited direct checkout retries between 07:42 and
07:48 SAST on 10 November. It has no ITN, provider payment or captured funds.

## Correction

- Exact `ZNG-` and `DP-` Admin searches override archive/hide-cancelled list
  filters while all ordinary search and list behaviour remains unchanged.
- Find My Booking receives authoritative archive state and only offers payment
  for a non-archived, non-cancelled, non-refunded reservation with a positive
  outstanding balance and pending status.
- Cancelled/failed PayFast returns now open Find My Booking with the same durable
  reference. The reference is prefilled; a new booking is not started.
- Payment preparation errors explicitly tell the guest that the reservation is
  saved and should be recovered through Find My Booking.
- Existing atomic booking persistence, PayFast ITN authority, idempotency,
  payment ownership, rate limits and duplicate protection remain unchanged.

## Verification

- Focused tests passed 44/44 across booking persistence, reference search,
  recovery, manual payment links, PayFast ITNs/reconciliation, duplicate safety
  and Production security.
- TypeScript and the Production build passed. The build retains an unrelated
  existing ticket-PDF filesystem tracing warning.
- Admin initial-route budget passed: raw 1,294,390 / 1,320,000 bytes; gzip
  314,260 / 320,000; largest gzip chunk 167,512 / 170,000.
- No database query, API request, polling, timer or background task was added.
  Migration: none. Business-data delta: zero.

## Manual Review

- `ZNG-BQQQWT` is the only active pending reservation past its expiry in the
  audited window. It was created at 15:39 SAST on 9 November, has R0 paid and
  R5,760 outstanding, and has no provider transaction, ITN or ticket. An
  existing communication causes the established cleanup function to preserve
  it. This is not evidence of captured money, but Box Office should decide
  whether to retain or cancel the reservation. It was not changed by this P0.

## Release Evidence

- Application commit: `2d3b3ed18916896895b561d02b091b9dffc86274`.
- Vercel reported a successful deployment for that exact commit at 07:34:45
  UTC / 09:34:45 SAST. Deployment: `dpl_6mdYxauKwqiUf7pxFH6NchCJW9au`.
- Kaden's existing authorised session restored and loaded the Production Admin
  calendar and Booking Management interface.
- The live Admin JavaScript contains the exact-reference override that sends
  `archive=all` and `hideCancelled=0`. The Production database still contains
  archived/cancelled `ZNG-VYBT2X`, confirming it remains recoverable by that
  deployed search path without a data change.
- The live Find My Booking asset contains archive-state enforcement and query
  reference prefill. The live booking asset contains `Check Reservation`, the
  same-reference recovery link and the saved-reservation payment error message.
- Production routes were healthy: `/book` HTTP 200 in 0.48s, `/find-booking`
  HTTP 200 in 0.26s, `/admin` HTTP 200 in 0.70s, `/api/shows` HTTP 200 in 1.05s
  and `/api/venue-settings` HTTP 200 in 0.57s. Safe GET verification of the
  POST-only PayFast ITN route returned the expected HTTP 405 in 0.46s.
- No real payment, callback, booking, ticket or communication was created.
  Migration: none. Business-data delta: zero. Rollback: revert `2d3b3ed1` and
  redeploy; no database rollback is required.
