# P0 - Table Plan Temporary Table Export

STATUS: COMPLETE - VERIFIED FOR PRODUCTION RELEASE

DATE: 26 OCTOBER 2026

## Objective

Verify against authoritative Production performances that the existing Table
Plan export includes every permanent and temporary table with the correct table
number, zone, seating capacity, booking assignment, guest allocation, and
approved performance-specific table state.

## Safety Boundary

- Strict UX/UI freeze.
- Do not modify Table Plan layouts, bookings, assignments, capacity, payments,
  or Production business data.
- Diagnose before changing code.
- If no defect exists, make no application change or deployment.
- If a defect is confirmed, implement and release only the smallest verified
  export correction.

## Verification

- Compare the export query and renderer with authoritative `show_tables`, table
  claims, booking entitlements, and performance-specific changes.
- Test assigned and unassigned temporary tables alongside permanent tables.
- Confirm export totals and rows match the selected Production performance.
- Preserve existing export performance, permissions, and financial output.

## Release Boundary

Commit, push, and deploy only if a verified export defect requires correction.

## Root Cause

The export identified legacy placeholder rows solely from non-physical status,
zone and a legacy-looking table code. One authoritative operational temporary
table used code `GC16`, so the export incorrectly treated it as a legacy
placeholder and rendered `UNALLOCATED (GC16)` without its authoritative table
capacity. The live Table Plan itself remained correct.

## Production Evidence

- Audited 835 authoritative temporary tables across 72 Production performances.
- 546 temporary tables are assigned; 289 are unassigned; 25 are disabled
  performance-specific records retained for operational evidence.
- Total temporary-table capacity audited: 4,714 seats.
- Exactly one table was incorrectly classified by the export: Johannesburg,
  5 September 2026 at 17:00, `GC16`, capacity 6, booking `DP-DXNYNC`.
- Genuine legacy placeholder population: 14,910 rows, preserved unchanged.
- Johannesburg 5 September export now contains `GC16`, capacity 6, six allocated
  guests and booking reference `DP-DXNYNC`.
- Cape Town 28 November export contains all 16 temporary tables: one assigned,
  fourteen available and one disabled, with exact capacities and allocations.
- Permanent and merged table structures remained present in both verified
  Production-data exports.

## Correction

Authoritative non-physical operational override tables with no merge parent or
members are now classified as temporary tables before applying the legacy-code
placeholder rule. No query, workbook layout, financial calculation, permission,
or Table Plan workflow changed.

## Verification

- Focused Table Plan workbook tests: 6 passed.
- Production-data export comparison: passed for Johannesburg 5 September and
  Cape Town 28 November 2026.
- TypeScript: passed.
- Changed-file ESLint: passed.
- `git diff --check`: passed.
- Production build and Admin performance budget: passed.
- Production business-data delta: zero.

## Release

- Baseline / rollback: `cfc4551e560577de40c857aad8b04b7d58bea8c3`.
- Release commit and Production deployment recorded after publication.
