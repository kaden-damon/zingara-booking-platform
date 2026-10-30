# P0 - Table Plan Export Section Regression

STATUS: COMPLETE - RELEASED AND VERIFIED IN PRODUCTION

DATE: 30 OCTOBER 2026

## Forensic Finding

The original master workbook places permanent table 400 with Golden Circle. The
affected CPT 30 October workbook placed it inside the Middle Ring merge block.

The introducing change was Phase 55 commit
`7ab1b575456ceac0319250088d34d4590ba0be99`. Its migration reclassified
table 400 to Middle Ring in the live physical-layout data. The exporter already
trusted mutable `show_tables.section` values for permanent workbook grouping,
so the migration made the export wrong without changing the export module.

- Migration activated at `2026-10-28 19:42:53.737827 SAST`.
- The corresponding Vercel deployment completed at
  `2026-10-28 19:43:35 SAST`.
- The earliest retained affected workbook was created at
  `2026-10-30 11:52:45 SAST`.
- Four retained CPT 30 October exports reproduce the defect.
- 171 current/future performance rows have table 400 saved as Middle Ring:
  130 CPT and 41 JHB. They were potentially affected when exported.
- The application does not retain a complete export-download history, so the
  exact number of previously generated files cannot be established.

## Production-Safe Correction

The exporter now uses the original master template's immutable 74-table
section map and ordering for unmodified permanent tables. Temporary tables,
merged relationships and show-specific overrides continue to use their saved
performance-specific sections. No live table or seating record was changed.

The regression safeguard verifies every permanent table's position and order,
including table 400 in Golden Circle and ESA order `900, 901, 800, 801`.
It separately verifies that a show-specific temporary table is not remapped.

## Verification

- Table Plan export tests: 12/12 passed.
- Changed-file ESLint and whitespace checks: passed.
- TypeScript and the Next.js Webpack Production build: passed.
- CPT live export: table 400 is Golden Circle; permanent order is correct;
  merged table `207+208`, temporary/show-specific rows and seven unassigned
  rows remain; 273 exported guests reconcile to 273 active Production guests.
- JHB live export: table 400 is Golden Circle; all 74 permanent tables are in
  master order; 361 exported guests reconcile to 361 active Production guests.
- Both workbooks have zero formula errors and retain financial, COMP and dietary
  columns.

## Release

- Commit: `9b5a4b984948c00554c96a6e0dd98ab7caf48365`.
- Vercel deployment: `dpl_HYpSRz9MXbcesErFAzP7GRyWx8Z5`.
- Deployment URL:
  `https://zingara-booking-platform-llsymcj5m-kaden-damons-projects.vercel.app`.
- Production alias: `https://book.zingara.co.za`.
- Ready at `2026-10-30 23:28:00 SAST`.
- Rollback: `b65b74b02f65d31a1834e5ace5eb052777ff6113`.

## Business-Data Delta

Zero. The release changed only Table Plan workbook generation and focused test
coverage. No bookings, assignments, tables, capacities, payments, VAT, tickets,
customers, communications or financial records changed.
