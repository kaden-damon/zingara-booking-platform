# Phase 55.1 - Box Office Verification & Handover

STATUS: COMPLETE

DATE: 28 OCTOBER 2026

## Outcome

- Authenticated Production Floor & Arrivals was inspected directly. Automatic
  assignment status, occupancy, available tables/seats, queue, threshold, reason,
  pause/resume, reminder, temporary-table and merged-table controls are present.
- The Production display reconciles the approved 415-seat master: Golden Circle
  120, Middle Ring 125, Private Booths 138 and Royal Balcony 32. Public seats,
  grandfathered staff-only capacity and physical table seats are shown separately.
- Server-side authorization requires booking and table management permissions,
  venue scope and a reason for pause/resume. Venue defaults additionally require
  settings management permission.
- One confirmed wording defect was corrected: singular queue summaries now read
  `1 booking ... needs ...` rather than `1 bookings ... need ...`.
- Remaining queue: 303 bookings / 4,370 guests across 58 performances. Every row
  is classified, prioritized and given an exact Box Office action in the handover
  workbook.

## Handover Workbook

`reports/Phase_55_1_Box_Office_Assignment_Handover_2026-10-28.xlsx`

Breakdown:

- Grandfathered capacity exceptions: 196 bookings / 1,785 guests.
- No safe table combination: 66 bookings / 494 guests.
- No physical table seats available: 34 bookings / 120 guests.
- Buyout manual planning: 5 bookings / 1,950 guests.
- Insufficient physical table seats: 2 bookings / 21 guests.
- Priority within 7 days: 69 bookings / 637 guests.

## Verification

- Focused automatic-assignment, approval, capacity, wording and master-layout
  tests: 20 passed. The standalone Table Plan export test could not resolve the
  repository path alias under Node's native test runner; the unchanged export code
  was covered by the successful Production build.
- TypeScript, changed-file ESLint and `git diff --check`: passed.
- Next.js Production webpack build: passed. Turbopack was unavailable in the
  restricted local worker environment because it could not bind its helper port.
- No new requests, polling, effects or database work were introduced.
- Authenticated desktop Production UI was inspected. An authenticated mobile
  session was not available for direct visual inspection, so mobile visual QA is
  not claimed; the responsive control structure and Production build passed.
- Production routes after deployment: `/admin` 200 and `/book` 200.

## Release

- Application commit: `d45d805` (`Polish Box Office assignment summary`).
- Vercel Production deployment: successful.
- Rollback application commit: `5c1bf38e73ddf10945fcd1ca14c1d0166bb69c2a`.
- Business-data delta: none. No booking, assignment, table, capacity, payment,
  ticket, customer, Xero or financial record changed.

PHASE 55.1 COMPLETE - BOX OFFICE READY FOR OPERATIONAL HANDOVER.
