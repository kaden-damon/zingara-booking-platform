# Phase 5 - Table Plan Export Finalisation

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Scope

Finalise the existing Table Plan export by completely exchanging columns K and
L while preserving every other booking, seating, dietary, financial and
formatting behaviour. Retain the completed Vodacom Full Show Buyout correction.

## Mapping

| Column | Before | After |
| --- | --- | --- |
| K | Payment Breakdown, width 53.55 | Payment Summary, width 38.86 |
| L | Payment Summary, width 38.86 | Payment Breakdown, width 53.55 |

The final workbook-layer exchange moves values, formulas, cell and column
styles, widths, hidden/outline state, notes and data validation together. No
other column is remapped. A focused regression also protects the K/L headings,
widths and distinctive header borders/number format.

## Implementation

- `src/lib/exports/tablePlan.ts` writes the established workbook and then swaps
  the complete K/L column state. This keeps all existing financial logic and
  avoids duplicating or rewiring payment calculations.
- The exact approved COMP Payment Summary remains unchanged for genuine legacy
  COMP records; it is no longer extended with an unrelated gratuity-status line.
- No query, request, API, dependency, migration, background process or client
  bundle work was added.

## Focused Verification

- `npx tsx --test src/lib/exports/tablePlan.test.ts`: 15/15 passed.
- `npx tsx --test src/lib/exports/tablePlanFinance.test.ts`: 22/22 passed.
- `npx tsc --noEmit`: passed.
- Targeted ESLint and `git diff --check`: passed.
- `npm run build`: passed. Existing Admin budget remained within limits:
  raw 1,293,349 / 1,320,000; gzip 313,906 / 320,000; largest gzip chunk
  167,417 / 170,000 bytes.
- Regression coverage includes permanent and temporary tables, merged-table
  layout, repeated headings, Standard, Corporate, legacy imported records,
  COMP/Media/Tradex, multi-zone records, singular Full Show Buyout financials,
  configured prices and Strictly Halaal/Kosher quantities.

## Workbook Integrity

- Generated a fresh Vodacom workbook from authoritative read-only Production
  records and compared it with the uploaded Production workbook. Across 142
  rows and 27 columns there were zero differences after applying only the K/L
  exchange, including values, formulas, styles, notes, validation and widths.
- Authenticated live exports after deployment:
  - JHB 6 November: `Zingara_Table_Plan_JHB_2026-11-06 (3).xlsx`.
  - CPT 6 November: `Zingara_Table_Plan_CPT_2026-11-06.xlsx`.
- Live CPT rows verified paid, deposit and complimentary summaries/breakdowns,
  ordinary financial columns, formulas and existing COMP cash-up treatment.
- Live Vodacom export retained company identification on 30 active operational
  tables; disabled tables remained unchanged; allocated pax remained zero;
  booking and financial details appeared once; R684,400 paid and R0 outstanding;
  R73,750 historical gratuity and 37 Strictly Halaal meals remained singular.

## Release

- Application commit: `fe694690` (`fix(exports): exchange payment summary columns`).
- Production deployment: `dpl_GHbn3e2MbUVKZM5zUFsAnjmdrtki`.
- Deployment became Ready and received the `book.zingara.co.za` alias at
  13:08 SAST on 6 November 2026.
- Migration: none.
- Rollback: revert `fe694690` and redeploy. No database rollback is necessary.
- Business-data delta: zero. Verification performed read-only exports only; no
  booking, seating, payment, financial, dietary, ticket or customer data changed.

## Outstanding

None within Phase 5 scope.

## P0 Financial Export Correction

### Root Cause

The finance normaliser correctly retained Vodacom's authoritative R684,400
payment as method-unknown because no payment row or other evidence identifies
the tender as card or EFT. The exporter wrote only method-specific N:Q values,
so the retained payment appeared in descriptive text but had no numeric cell
feeding `TOTAL FULL-PAID AMOUNT` or `BOX 0FFICE TOTAL RECEIVED`.

### Correction

- Method-unknown receipts are now classified as full-paid or prepaid from the
  authoritative booking payment status and written once to hidden calculation
  columns AB/AC. Existing visible financial columns and definitions are
  unchanged; no tender method is fabricated.
- Full-paid, prepaid and four zone-receipt formulas include those hidden values.
  Secondary buyout table rows clear the hidden cells with the other singular
  financial values, preventing multiplication across 30 operational tables.
- Column K remains `PAYMENT SUMMARY`; Column L remains `PAYMENT BREAKDOWN`.
- A Corporate Full Show Buyout receives the detailed contractual breakdown
  only when Ticket & Show, VAT and Gratuity note amounts reconcile exactly to
  the stored subtotal, service fee and total. Vodacom now displays:
  `Ticket & Show R531,000.00`, `VAT R79,650.00`, `Gratuity R73,750.00`,
  `Total Paid R684,400.00`, and `Outstanding R0.00`.
- The existing batched export query selects `subtotal_amount`; no additional
  request, query, dependency, polling or per-render calculation was added.

### Verification

- Focused tests: Table Plan 15/15 and finance 23/23 passed.
- TypeScript, targeted ESLint, `git diff --check` and Production build passed.
- Admin budget remained unchanged within limits: raw 1,293,349 / 1,320,000;
  gzip 313,906 / 320,000; largest gzip chunk 167,417 / 170,000 bytes.
- Fresh authenticated live JHB workbook:
  `Zingara_Table_Plan_JHB_2026-11-06 (4).xlsx`.
  It retains 30 Vodacom table labels, one financial row, R684,400 full-paid,
  R684,400 Box Office received, R73,750 T/GRT-PAID, R0 outstanding and the
  existing 37 Strictly Halaal quantity. A real spreadsheet-engine recalculation
  reproduced those totals.
- Fresh authenticated live CPT control workbook:
  `Zingara_Table_Plan_CPT_2026-11-06 (1).xlsx`. It recalculated to R429,250.50
  full-paid plus R20,900.00 prepaid, totaling R450,150.50 received, matching
  authoritative Production booking totals.
- Compared with the previous live JHB export, columns A-I are identical. The
  only A:J changes are the intended summary formulas/results in J; seating,
  tables, disabled rows and guest allocations are unchanged.

### Release

- Application commit: `a3007698` (`fix(exports): include reconciled buyout payments in totals`).
- Production deployment: `dpl_2JzqQ2pPA2qwVxSDf8RQ8wub976s`, Ready at
  13:59 SAST on 6 November 2026.
- Migration: none.
- Business-data delta: zero. Verification used read-only exports and did not
  modify bookings, payments, seating, tables, dietary records or financial
  history.
- Rollback: revert `a3007698` and redeploy. No database rollback is required.

### Outstanding

None within the reopened Phase 5 P0 scope.
