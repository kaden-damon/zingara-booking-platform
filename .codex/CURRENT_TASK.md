# P0 - Table Plan Export Regression

STATUS: COMPLETE - RELEASED AND VERIFIED IN PRODUCTION

DATE: 30 OCTOBER 2026

## Objective

Restore the original Table Plan master-template section grouping and ordering
without changing seating, booking or financial data.

## Root Cause

Phase 55 commit `7ab1b575456ceac0319250088d34d4590ba0be99` moved
permanent table 400 from Golden Circle to Middle Ring in the approved physical
layout data. The existing exporter grouped permanent tables from each mutable
`show_tables.section` value, so the Phase 55 migration caused table 400 to
render inside the Middle Ring workbook block.

- Phase 55 migration activation: 28 October 2026 at 19:42:53.737827 SAST.
- Phase 55 Vercel deployment completed: 28 October 2026 at 19:43:35 SAST.
- Earliest retained affected export: 30 October 2026 at 11:52:45 SAST.
- Four retained 30 October CPT exports reproduce the defect.
- Production contains 171 table-400 performance rows saved as Middle Ring:
  130 Cape Town and 41 Johannesburg. These performances could produce the
  incorrect export grouping. Historical export-download counts are not stored.

## Correction

- The export now owns the original 74-table master mapping and intended order.
- Permanent tables use that immutable workbook mapping for section placement.
- Table 400 exports under Golden Circle.
- Royal Balcony retains the original `900, 901, 800, 801` order.
- Temporary, merged and overridden tables continue to use their authoritative
  show-specific saved sections.
- No database migration or seating-data correction was made.

## Verification

- Focused Table Plan export suite: 12/12 passed.
- Changed-file ESLint and `git diff --check`: passed.
- Next.js 16.3.4 Webpack Production build and TypeScript: passed.
- Existing performance-budget parser retains its known unsupported Webpack
  client-reference manifest limitation.
- Authenticated Production CPT export:
  `Zingara_Table_Plan_CPT_2026-10-30 (4).xlsx`.
  Table 400 is Golden Circle; the `207+208` merge and seven unassigned rows
  remain present; 57 bookings and 273 guests reconcile to Production.
- Authenticated Production JHB export:
  `Zingara_Table_Plan_JHB_2026-10-30.xlsx`.
  Table 400 is Golden Circle; all 74 permanent tables retain master order;
  361 guests reconcile to Production.
- Both live workbooks contain zero formula errors and retain Payment Breakdown,
  Payment Summary, Media, Tradex, COMP, Halaal and Kosher columns.

## Production Release

- Application commit: `9b5a4b984948c00554c96a6e0dd98ab7caf48365`.
- Deployment ID: `dpl_HYpSRz9MXbcesErFAzP7GRyWx8Z5`.
- Deployment URL:
  `https://zingara-booking-platform-llsymcj5m-kaden-damons-projects.vercel.app`.
- Production alias: `https://book.zingara.co.za`.
- Deployment completed: 30 October 2026 at 23:28:00 SAST.
- Rollback point: `b65b74b02f65d31a1834e5ace5eb052777ff6113`.

## Business-Data Delta

Zero. No booking, seating assignment, table, capacity, payment, VAT, customer,
ticket, Xero or financial record changed. Only workbook generation logic and
regression coverage changed.
