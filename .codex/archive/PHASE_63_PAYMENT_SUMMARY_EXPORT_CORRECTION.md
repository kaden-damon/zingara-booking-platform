# Phase 63 - Payment Summary Export Correction

STATUS: VERIFIED - RELEASE IN PROGRESS

DATE: 30 OCTOBER 2026

## Scope

Correct the existing Table Plan booking export headings and complimentary summary wording without changing booking finance, calculations, workbook structure or other export fields.

## Root Cause

The column labels introduced during Phase 55.3 were semantically reversed: column K held the payment breakdown while its heading said Payment Summary, and column L held the concise payment description while its heading said Payment Breakdown. Complimentary descriptions were also split between column K and category-specific labels in column L.

## Correction

- Column K: `PAYMENT BREAKDOWN`, preserving the existing paid/outstanding value.
- Column L: `PAYMENT SUMMARY`.
- All authoritative complimentary categories use exactly: `Complimentary, Dinner show comps, drinks and gratuity to be paid by client`.
- Paid and non-complimentary summaries are unchanged.
- No financial formulas, monetary columns, VAT, booking status or source data changed.

## Verification

- Focused Table Plan and financial export suite: 29 passed.
- Verified Standard, Media and Tradex COMP fixtures in both venues.
- Verified paid, deposit, unpaid, Corporate and multi-table rows remain aligned.
- TypeScript, scoped changed-file ESLint and `git diff --check`: passed.
- Next.js 16 Webpack Production build: passed.
- Default Turbopack remains blocked by the documented internal-port restriction in this environment; the existing performance checker retains its known Next.js 16 manifest limitation.
- Production release and authenticated live export evidence pending.
