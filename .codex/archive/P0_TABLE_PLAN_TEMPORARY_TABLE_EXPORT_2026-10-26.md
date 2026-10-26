# P0 - Table Plan Temporary Table Export

STATUS: COMPLETE - VERIFIED FOR PRODUCTION RELEASE

DATE: 26 OCTOBER 2026

## Root Cause

The Table Plan export's legacy placeholder classifier used a non-physical table
and legacy-looking code as sufficient evidence. Production temporary table
`GC16` was an authoritative operational override, but the export downgraded it
to `UNALLOCATED (GC16)` and omitted its six-seat capacity from the table row.

## Production Audit

- 835 temporary tables across 72 performances.
- 546 assigned, 289 unassigned and 25 disabled temporary records.
- 4,714 temporary seats in total.
- One misclassified temporary table: Johannesburg, 5 September 2026 at 17:00,
  `GC16`, capacity 6, assigned to `DP-DXNYNC` for six guests.
- 14,910 genuine legacy placeholder rows remain on their existing path.

## Correction

Operational non-physical overrides with no merge parent or members are retained
as authoritative temporary tables before the legacy-code rule is evaluated.
No export layout, query, UI, permission, booking, financial or Table Plan logic
was changed.

## Verification

- Six focused Table Plan workbook tests passed.
- The regenerated Johannesburg 5 September export contains `GC16`, capacity 6,
  six allocated guests and booking reference `DP-DXNYNC`.
- The regenerated Cape Town 28 November export contains all 16 temporary tables,
  including assigned, available and disabled records, with exact capacities.
- Permanent and merged table structures remained present.
- TypeScript, changed-file ESLint, diff validation, Production build and Admin
  performance budget passed.

## Safety

Production business-data delta: zero. No Table Plan layouts, bookings,
assignments, capacity, payments or financial records were modified.

## Release

- Baseline / rollback: `cfc4551e560577de40c857aad8b04b7d58bea8c3`.
- Release commit and Production deployment recorded after publication.
