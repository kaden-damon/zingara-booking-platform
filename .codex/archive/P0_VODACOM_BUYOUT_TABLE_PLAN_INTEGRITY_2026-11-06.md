# P0 Vodacom Buyout Table Plan Integrity

## Status

COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

Date: 6 November 2026

## Scope

Urgent export-only correction for Full Show Buyout `ZNG-48B964B9`, Vodacom,
Johannesburg, 6 November 2026 at 17:00. No Production booking, seating or
financial record was modified.

## Root Cause

The booking is an exclusive Full Show Buyout with 400 guests but deliberately
has no section entitlements or table claims. The Table Plan exporter only
associated a booking with rows claimed through `show_tables.booking_id`.
Consequently it emitted the operational table structure but no Vodacom
identity or booking financials.

The same legacy booking predates structured financial allocation evidence.
Its authoritative R73,750 service fee was correctly displayed in payment
summary wording but was not reaching the existing numeric gratuity-paid
column. Its staff-recorded 37 Strictly Halaal guests existed only in the
authoritative operational note.

## Financial Reconciliation

Authoritative current booking values:

- Ticket & Show: R531,000
- VAT: R79,650 (15% of R531,000)
- Gratuity: R73,750
- Total: R684,400
- Paid: R684,400
- Outstanding: R0

The sum reconciles exactly: R531,000 + R79,650 + R73,750 = R684,400.

The R73,750 gratuity is 12.5% of the original fixed Private Salon base of
R590,000. On 5 November 2026 Lisa Rodderick recorded two management
reconciliations. The final event, reason `Vodacome Deal`, changed the subtotal
from R678,500 to R610,650 and the total from R752,250 to R684,400 while
retaining the contractual R73,750 gratuity. This is not a recalculation at
12.5% of the revised R531,000 base.

The note also records 37 Strictly Halaal guests at R9,250, 36 additional
guests at R1,312 each and R164 gratuity each. Production contains no separate
payment, structured add-on, legacy payment evidence, corporate-operations
record or outstanding balance for those figures. They are therefore retained
as operational agreement detail and are not added again to the settled
R684,400. The exporter exposes the confirmed quantity of 37 in the existing
Halaal column and preserves the complete note once.

One local-only, unsynced Xero quote for R510,000 also exists. It is historical
document evidence, does not match the final management reconciliation and was
not used to change or calculate the current booking.

## Correction

- When exactly one active Full Show Buyout has no zone entitlements or table
  claims, every available operational table row receives the buyout booking
  identity as coverage.
- Coverage rows always use zero allocated pax. No table claim, section
  allocation or seating assignment is created or inferred.
- Disabled tables remain disabled and are never labelled as buyout coverage.
- Company identity repeats on coverage rows, while booking reference, contact,
  notes, payment summary and financial values remain on one row only.
- For fully paid Corporate/Buyout records without explicit allocation
  evidence, the persisted service fee supplies the existing gratuity-paid
  column once, bounded by the confirmed paid amount.
- Legacy staff-note dietary quantities are used only as fallback when the
  structured dietary add-on quantity is absent.

## Verification

Before release, the authenticated Production workbook contained the full
table structure but zero Vodacom operational rows and zero numeric gratuity.

The corrected workbook generated against read-only Production data showed:

- 30 currently available operational tables labelled `Vodacom`.
- Exact tables: 1-12, 14-24, 200, 406, 506, 900, 901, 800 and 801.
- Zero allocated guests on all coverage rows.
- One `ZNG-48B964B9` reference and one payment/financial row.
- `Paid R684,400 · Outstanding R0`.
- `GRATUITY COLLECTED: R73,750.00` and numeric gratuity R73,750 once.
- Strictly Halaal quantity 37 once.
- All disabled table rows remained unlabelled and unchanged.

Verification completed:

- Focused buyout workbook regression: 1/1 passed.
- Table Plan financial tests: 22/22 passed.
- TypeScript: passed.
- Targeted ESLint: passed.
- Whitespace validation: passed.
- Production build and Admin performance budget: passed.
- The wider workbook suite has five pre-existing stale assertions expecting
  payment summaries without the recently deployed gratuity-status line; the
  new buyout regression passes and the failures are unrelated to this P0.

After deployment, an authenticated live export was downloaded as
`Zingara_Table_Plan_JHB_2026-11-06 (2).xlsx` and all values above were
reverified directly from the actual workbook.

## Release

- Application commit: `b6eaf36c`.
- Deployment: `dpl_2fhThxc5fArvLFeKeJscjfrhBevY`.
- Production status: Ready and aliased to `book.zingara.co.za` at 12:57 SAST.
- Migration: none.
- Performance delta: no normal-load request, query, polling, dependency,
  background task or client-side work added.
- Business-data delta: zero.

## Rollback

Revert application commit `b6eaf36c` and redeploy. No database or business
data rollback is required.
