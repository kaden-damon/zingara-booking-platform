# Phase 68 - Floor Capacity & Seating Integrity

STATUS: COMPLETE - RELEASED TO PRODUCTION

DATE: 30 OCTOBER 2026

## Verified Diagnosis

- Current single-table recommendation priority is intact.
- Automatic multi-table assignment optimises remaining seat fit but does not
  consider the approved physical master order after selecting the first table.
  This can place one group at distant tables even when a compatible nearby
  combination exists.
- Floor data is fetched with the authoritative show ID, but several local
  totals still filter by the selected UI alias. A legacy show alias can
  therefore omit otherwise authoritative booking rows from Floor counts.
- No duplicate capacity mechanism is required. The existing capacity model
  already separates booked guests, public capacity, staff-approved additional
  seating, total operational capacity, physical table seats and remaining
  capacity.

## Read-only Production Audit

- Active bookings audited: 5,948.
- Future active bookings audited against zone entitlements: 2,541.
- Future populated show/zone combinations: 364.
- Guest/zone-entitlement mismatches: 0.
- Future zones above authoritative operational capacity: 0.
- Cross-show table claims: 0.
- Invalid claimed-table statuses: 0.
- Primary booking table missing from its claims: 0.
- Future multi-table bookings: 455.
- Future split bookings with a valid single-table alternative available now: 6.

The six current review candidates are `ZNG-BJ2HVX`, `ZNG-FE7Y5R`,
`ZNG-8S8TDX`, `ZNG-CK395Q`, `ZNG-QB3LX4` and `ZNG-WMQKTX`. These are review
candidates, not proven historical allocation errors, because retained records
do not establish whether those single tables were available when each booking
was originally assigned. No assignment will be changed automatically.

## Corrections Implemented

- Preserved single-table fit as the first recommendation and assignment rule.
- Added approved-master proximity as the next tie-break when multiple tables
  are genuinely required. Minimum table count, capacity, minimum occupancy,
  section, locks, thresholds and atomic ownership checks remain intact.
- Applied the same ordering to Floor planning, current automatic assignment,
  hybrid assignment and local recommendation paths.
- Corrected Floor counts, queue filtering and table hydration to use the
  authoritative show ID instead of a legacy selected-show alias.
- Added no new capacity lock, request, polling path or business rule.

## Historical Review

- `ZNG-MKA3M2` was the confirmed current example: eight Middle Ring guests were
  assigned tables 205 and 302. No approved eight-seat permanent table was
  available, so a split was required; the previous allocator selected the
  exact-capacity pair without considering physical order.
- Six future bookings currently have a single fitting table available:
  `ZNG-BJ2HVX`, `ZNG-FE7Y5R`, `ZNG-8S8TDX`, `ZNG-CK395Q`, `ZNG-QB3LX4` and
  `ZNG-WMQKTX`. They remain manual-review candidates because retained evidence
  cannot prove that table was free at original assignment time.
- No booking was automatically reseated or otherwise modified.

## Verification

- Focused Phase 68 tests passed, including single-table precedence, nearby
  unavoidable splits, Floor-planning proximity, capacity presentation and
  migration non-mutation.
- Capacity-model tests passed (12/12).
- TypeScript passed.
- Changed-file ESLint reported no new errors; one pre-existing unused-variable
  warning remains in `zingaraDemo.ts`. Full Admin-page lint still reports two
  pre-existing hook errors outside the changed lines.
- `git diff --check` passed.
- `next build --webpack` completed successfully. The default local Turbopack
  build could not bind its restricted compiler port; this was an environment
  limitation, not an application compilation failure.
- Post-migration read-back confirmed the Production definitions and comments
  for both allocator functions contain the Phase 68 proximity ordering.
- Post-release read-only verification confirmed `ZNG-MKA3M2` still owns tables
  205 and 302 with the original assignment timestamp.
- The available Chrome profile was unauthenticated and displayed the stable
  Production Admin login. Authenticated visual Floor verification was not
  represented as completed.

## Production Release

- Application commit: `419002aac89d7d6d93dda0af4ba18d7fb3266a2d`.
- Migration: `20261030235900_phase_68_seating_proximity.sql`, applied
  successfully through the linked Production workflow.
- Deployment ID: `dpl_E4vY19Co48wS9Ew74BdTTnd2JgmX`.
- Deployment URL:
  `https://zingara-booking-platform-ousv0sv4r-kaden-damons-projects.vercel.app`.
- Deployment status: `Ready`.
- Rollback commit: `d3a59ccdead68760ae88bb4ef5d91d19ea3ec0eb`.
- Business-data delta: zero. The migration replaced function definitions only;
  it did not mutate bookings, assignments, tables, capacities, payments,
  tickets, Xero records or communications.

## Final Status

Phase 68 is released. New eligible assignments retain one-table priority and
unavoidable splits now prefer physically compatible nearby tables. Historical
review candidates remain unchanged for Box Office assessment.
