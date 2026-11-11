# P0 Booking Transfer & Platform-Wide Seating Integrity

STATUS: PLATFORM FIX COMPLETE - DEPLOYED AND AUTHENTICATED PRODUCTION VERIFIED; LIVE BOOKING CHANGE REQUIRES EXPLICIT APPROVAL

DATE: 11 NOVEMBER 2026

## Incident And Root Cause

- `BUG-000032` recorded the failed transfer for `ZNG-9Z6XMR` at
  09:25:38 SAST with HTTP 500 and request correlation
  `cpt1::iad1::6mkhh-1794381919255-bcfaa51b8cf1`.
- The booking has four current Private Booth claims (tables 1, 2, 3 and 4).
  The retired single-table transfer path released only the primary claim before
  changing the booking section. The three remaining Private Booth claims then
  violated the deferred booking/table zone-integrity constraint. The API
  collapsed that actionable integrity failure to a generic 500.
- This was shared logic, not a defect in temporary table `Lisa`. The same
  failure condition could affect any multi-table booking moved through the old
  one-table endpoint.

## Production Audit

- Audited all 8,115 bookings: 3,098 Cape Town and 5,017 Johannesburg.
- 5,623 bookings have table assignments. 464 use multiple operational tables;
  383 of those are future active bookings and were structurally vulnerable to
  the retired one-table transfer path.
- Audited 715 bookings on temporary tables and 258 on merged operational tables.
- Current corruption from this failure condition: zero cross-show claims, zero
  section mismatches and zero missing primary claims.
- One unrelated historical imported record, `DP-QLY8NC`, has 410 guests on a
  10-seat operational claim. It is a past legacy record and remains unchanged
  for manual historical review.

## Shared Correction

- Added service-role-only
  `reallocate_booking_zone_tables_atomic`, requiring both booking and table
  management permissions.
- The operation locks the booking and show table set, verifies the exact stale
  state, validates show, zone, temporary/merged-table integrity and combined
  capacity, then releases and claims the complete table set in one transaction.
- It preserves the strict multi-zone workflow, venue scope, audit history and
  all financial, ticket, payment and customer records.
- The old single-table endpoint now rejects multi-table bookings with a clear
  instruction to use `Manual table set`. Known stale, claimed, capacity and
  integrity conflicts return actionable 403/409 responses instead of HTTP 500.
- Booking Details now lazy-loads a compact `Manual table set` control only
  when expanded. It adds no polling, background work or normal page-load
  request.

## Reference Booking And Financial Reconciliation

- `ZNG-9Z6XMR` remains unchanged in Production: 21 guests, Private Booths,
  tables 1+2+3+4, total R31,880.00, paid R10,450.00 and outstanding R21,430.00.
- Current target tables are show-specific, approved and available:
  `407` Golden Circle capacity 11 and `408` Golden Circle capacity 10.
  Temporary table `Lisa` is also available with capacity 21.
- The safe two-table capacity orientation is therefore 11 guests on 407 and
  10 guests on 408. The requested 10/11 orientation conflicts with the recorded
  table capacities and was not applied.
- Authoritative current Golden Circle pricing is R1,540 per guest. Preserving
  this historical booking's pre-transition 12.5% collected gratuity treatment
  gives ticket value R32,340.00, gratuity R4,042.50, revised total R36,382.50,
  existing payment credit R10,450.00 and outstanding R25,932.50.
- No repricing, payment link or customer communication was performed. The live
  transfer/reprice requires explicit booking approval.

## Verification And Release

- Rollback-only Production verification passed for the reported four-table
  transfer to 407+408, an unassigned booking, same-zone multi-table state, a
  merged operational table, stale state, insufficient capacity and multi-zone
  rejection. Every transaction was rolled back.
- Focused seating tests passed 7/7. Changed-file lint introduced no errors; the
  Production build and Admin performance budget passed.
- Bundle impact was 55 gzip bytes (0.018%) in the largest measured Admin output,
  with no new request, query, polling, timer or background task.
- Migration `20261111113000_p0_booking_zone_table_set_transfer.sql` is applied
  and recorded in Production migration history.
- Application commit
  `b0789f3d7716687852068773ca6703a7be231e2f` is on `main`.
- At 10:02 SAST, Kaden's authenticated Production session restored
  successfully. Booking Details showed `Manual table set`; Golden Circle
  showed 407 (11), 408 (10) and Lisa (21), and the control stated
  `Financials unchanged`. No Save action was taken.
- Business-data delta: no booking, seating assignment, table, payment, VAT,
  gratuity, ticket or customer record changed. Only the new database function
  and its migration-history record were added.

