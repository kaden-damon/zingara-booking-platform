# P0 Booking Fee & Financial Integrity

STATUS: COMPLETE - DEPLOYED AND AUTHENTICATED PRODUCTION VERIFIED

DATE: 11 NOVEMBER 2026

## Root Cause

- The shared pricing helper treated the legacy R10 booking fee as an amount
  embedded in the ticket price. Fee-free Corporate invoice and EFT paths
  therefore deducted R10 from ticket revenue instead of simply omitting a
  transaction fee.
- The public Corporate flow repeated that subtraction independently, while
  the guest-allocation calculator contained the same legacy rule.
- Corporate gratuity was rounded to a whole rand before totals were assembled.
  This produced R32,330 tickets, R4,041 gratuity and R36,371 total for the
  21-guest reference case, while a separate balance path retained a different
  amount.

## Correction

- Booking obligations now retain the full configured ticket and eligible
  add-on values. The booking fee is no longer deducted from either ticket
  revenue or the Corporate / Buyout gratuity base.
- Currency percentages and totals are calculated and normalised to cents in
  the shared pricing and guest-allocation paths.
- New bookings record forward-only fee policy `payment-method-v2`. Existing
  legacy records remain unchanged and continue to use their recorded evidence.
- PayFast payment links and online checkout retain the configured R10
  transaction fee at the existing payment-transaction boundary. Invoice
  outstanding, invoice paid in full and manual EFT remain fee-free.
- No migration or historical financial backfill was required.

## Reference Reconciliation

Johannesburg, 6 January 2027, Golden Circle, 21 guests:

- Tickets: 21 x R1,540.00 = R32,340.00
- Corporate gratuity: 12.5% x R32,340.00 = R4,042.50
- Booking obligation: R36,382.50
- PayFast transaction fee where applicable: R10.00
- PayFast amount payable: R36,392.50
- Invoice / EFT amount: R36,382.50 with no booking fee

The reference performance had no persisted bookings or payments at audit time;
the reported discrepancy was confined to the booking preview.

## Production Audit

- Audited 332 future active legacy `payment-method-v1` bookings across both
  venues: 209 Cape Town and 123 Johannesburg.
- 324 records retain explicit historical fee treatment supported by their
  stored booking evidence.
- Nine Corporate-direct legacy records (five Cape Town and four Johannesburg)
  may reflect the superseded embedded-fee calculation. They require manual
  financial review because historical agreements, add-ons and payment terms
  cannot be safely inferred. No record was automatically repriced.
- Business-data delta: none. No booking, payment, invoice, gratuity, VAT,
  deposit, PayFast transaction or export record changed.

## Verification

- Focused financial regression suite passed 43/43, covering shared pricing,
  guest allocations, gratuity, temporary tables, balance links and manual EFT.
- Exact-cents formatting checks passed 6/6.
- Production build and `git diff --check` passed. The existing unrelated
  `ticketPdfServer.ts` Turbopack warning remains unchanged.
- Admin bundle stayed within its established budget: 1,295,631 raw bytes,
  313,832 gzip bytes and 167,299-byte largest gzip chunk. No request, polling,
  database-query or background-processing path was added.
- Authenticated Production verification confirmed:
  - PayFast: R32,340 tickets, R4,042.50 gratuity, R36,382.50 booking amount,
    one R10 transaction fee and R36,392.50 payable.
  - Invoiced paid in full: R36,382.50 total, R0 due and no fee.
  - Invoiced outstanding: R36,382.50 balance due later and no fee.
- No booking was submitted and no payment or customer communication was
  initiated during verification.

## Release

- Application commits:
  - `dd580fc9b1ca2758b5a8948bef36ad040d93067c`
  - `d1619eedb54f4bad71794d6134f46d943187a325`
  - `a213a0875b1c357f68ba2368f878dea74e2dff9f`
- Final Production deployment: `Fa6teYkVZiiD4r2bjqTWi4XTTjic`, Ready at
  14:21:31 SAST on 11 November 2026.
- Rollback is an application revert of the three commits above. No database
  rollback is necessary.

