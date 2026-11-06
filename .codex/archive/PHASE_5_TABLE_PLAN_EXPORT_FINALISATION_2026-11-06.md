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
