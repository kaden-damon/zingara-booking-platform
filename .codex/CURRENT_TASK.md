# Phase 59 - COMP Booking Categories & Table Plan

STATUS: COMPLETE

DATE: 29 OCTOBER 2026

## Goal

Extend authorised internal Standard booking creation with explicit Standard,
Media and Tradex complimentary categories while preserving the existing
complimentary classification, financial safeguards and Table Plan export.

## Approved behaviour

- Standard COMP: R0 per guest and R0 payable.
- Media COMP: R550 per guest, retained as COMP, with the actual unpaid balance.
- Tradex COMP: R550 per guest, retained as COMP, with the actual unpaid balance.
- New internal complimentary bookings require an explicit category selection.
- Historical complimentary bookings without authoritative category evidence
  remain Standard COMP and retain their existing financial values.
- Media remains in Table Plan column S; Tradex is inserted immediately after it.
- No PayFast, Xero, seating, capacity, show-status or communication changes.

## Verification boundary

Implement and verify the internal booking UI, authoritative server pricing,
guest-count amendments, persistence, Table Plan formulas and generated workbook
outputs for both venues. Preserve all unrelated working-tree files.

## Completed implementation

- Added an explicit Standard / Media / Tradex category choice to authorised
  internal Standard complimentary booking creation.
- Kept Standard COMP at R0 and priced Media/Tradex at R550 per guest while
  preserving COMP classification, verified payment state and outstanding balance.
- Persisted the category in existing booking metadata and carried it through
  Booking Details, guest-count reconciliation, reporting and Table Plan export.
- Preserved all 850 historical complimentary bookings and their financial values;
  ambiguous free-text notes were not used to reclassify historical records.
- Kept Media in Table Plan column S and inserted Tradex in column T, shifting and
  reconciling every downstream formula, style, width, merge and summary reference.
- Kept actual receipts in the existing payment columns and excluded category
  obligations from ordinary ticket-sales totals to prevent double counting.

## Verification

- 46 focused tests passed, including booking pricing, amendments, generated
  workbook reloads, formulas, receipts, notes and payment summaries.
- TypeScript, scoped changed-file ESLint and `git diff --check` passed. ESLint
  retained four pre-existing warnings and introduced no new errors.
- Production build passed with the supported Webpack fallback. The local
  Turbopack runner could not open its internal worker port in the restricted host.
- Johannesburg and Cape Town workbooks were generated, reloaded and rendered at
  identical dimensions. Media R2,200 and Tradex R1,650 fixture values remained
  legible; no `###` clipping or formula errors were present.
- Authenticated Production UI verification confirmed explicit selection and live
  calculations: Standard R0; Media and Tradex R550 per guest with the balance
  outstanding. The verification booking was cancelled before submission.
- Production migration `20261029235963_phase_59_comp_booking_categories.sql`
  applied successfully; the amended function retains the existing seating guard.

## Release

- Application commit: `bbc3dc9b90c9526dcd6c3b30ef83b04f6748a053`
- Production baseline / rollback: `df27eaf59993f7534ecd5598af46710284967440`
- Production URL: `https://book.zingara.co.za`
- Business-data delta: zero bookings, payments, tickets, customer communications,
  Xero records, seating assignments or historical financial values changed.
