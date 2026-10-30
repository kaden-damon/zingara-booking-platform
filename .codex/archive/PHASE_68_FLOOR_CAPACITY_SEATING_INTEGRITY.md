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

## Follow-up - Strict Single-Table Rule

On 30 October 2026, Box Office clarified the authoritative business rule:
automatic seating must never split one booking across multiple tables. An
existing valid merged table is one operational table; creating a merge or
claiming separate tables must remain a manual, authorised action.

### Verified Additional Root Cause

- `findBestTableAllocation` still built a multi-table fallback after exhausting
  single operational tables.
- `buildInitialFloorPlan` could create a merged parent automatically.
- `buildZoneFloorCapacityPlan` could recommend multiple existing or temporary
  tables for one booking.
- Production functions `try_automatic_table_assignment`,
  `try_automatic_table_assignment_phase_54_5`,
  `try_hybrid_table_assignment_phase_54_11` and
  `try_phase55_existing_booking_assignment` could accumulate more than one
  table before completing an automatic assignment.

### Historical Review Baseline

- Active split allocations: 481.
- Future active split allocations: 456.
- Cape Town: 230; Johannesburg: 251.
- No historical assignment was changed.

The six Phase 68 review candidates at the read-only snapshot were:

| Booking | Performance | Guests | Zone | Current tables | Available single table | Review reason |
| --- | --- | ---: | --- | --- | --- | --- |
| `ZNG-BJ2HVX` | JHB, 30 Oct 2026 17:00 | 8 | Middle Ring | 205 + 300 | 316 (8) | Current split; one fitting table is available now, but original availability is not retained. |
| `ZNG-FE7Y5R` | JHB, 12 Nov 2026 17:00 | 4 | Golden Circle | 601 + 603 | 602 (4) | Current split; one fitting table is available now, but original availability is not retained. |
| `ZNG-8S8TDX` | CPT, 18 Nov 2026 18:00 | 8 | Middle Ring | 210 + 309 | 203 (8) | Current split; one fitting table is available now, but original availability is not retained. |
| `ZNG-CK395Q` | CPT, 18 Nov 2026 18:00 | 8 | Middle Ring | 207 + 307 | 203 (8) | Current split; the same available table is a competing option and requires Box Office review. |
| `ZNG-QB3LX4` | CPT, 18 Nov 2026 18:00 | 7 | Middle Ring | 209 + 308 | 300 (7) | Current split; one fitting table is available now, but original availability is not retained. |
| `ZNG-WMQKTX` | CPT, 25 Nov 2026 18:00 | 18 | Middle Ring | 203 + 400 | SANLAM (130) | Current split; a show-specific operational table fits, but suitability requires Box Office review. |

These are operational review candidates, not approved reseating instructions.
The follow-up implementation and release evidence will be added below without
rewriting the completed Phase 68 release history.

### Follow-up Correction Verified

- Removed automatic multi-table fallback from the shared recommendation helper.
- Removed automatic merge creation from initial-floor planning.
- Restricted show-wide recommendations to one existing operational table or
  one reviewed temporary-table proposal for manual Box Office action.
- Added an API cardinality guard requiring exactly one recommended table.
- Prepared a fail-closed migration for every active automatic database engine.
- Preserved valid merged parents as one operational table unit.
- Preserved the service-role-only manual split RPC, its authenticated
  `bookings:manage` and `tables:manage` checks, and staff-attributed audit event.

Focused tests passed 42/42, TypeScript passed, changed-file ESLint reported no
errors, the Production webpack build passed, and the linked migration dry run
listed only the Phase 68 follow-up migration. Booking eligibility tests confirm
that lack of one suitable table does not block valid Standard or Corporate
bookings; it routes the seating exception to manual resolution.

### Follow-up Production Release

- Application commit: `81a9b1efb6a208cebf84f86a4e3a94198a7336cc`.
- Migration: `20261030235910_phase_68_strict_single_table_assignment.sql`,
  applied successfully.
- Deployment ID: `dpl_5SEnPUKhWXCinXisvHQzxMVkTMXA`.
- Deployment URL:
  `https://zingara-booking-platform-neswt2cfw-kaden-damons-projects.vercel.app`.
- Production aliases: `book.zingara.co.za`, `www.book.zingara.co.za` and the
  established Vercel aliases.
- Deployment status: `Ready`.
- Rollback commit: `ca3bbedd701db8072de6d629d7be5f9f24a55249`.

Live read-back confirmed that all four automatic assignment functions stop
after the first table candidate and reject any candidate set with more than one
table. The active historical split count remains 481 and all six named review
candidates retain their original assignments. The current-time future subset
is 445 because the date/time boundary advanced after the earlier snapshot; no
historical assignment was removed or changed.

The released public booking journey and stable Admin login rendered correctly.
An authenticated Admin session was unavailable in the controlled browser, so
authenticated visual Floor interaction was not claimed. Business-data delta is
zero: only application code and function definitions changed.

### Follow-up Final Status

Phase 68 follow-up is complete and released. Automatic splitting is prevented
in recommendation, planning, reviewed API and database assignment paths. A
valid existing merged parent remains one operational table. No suitable single
table leaves the booking unassigned for authorised manual Box Office action
without blocking booking creation, checkout or payment.

## Follow-up - Overall Capacity Integrity & Legacy Adjustment Review

On 30 October 2026, the capacity model was reviewed against the clarified
business rule that only valid show-specific temporary tables may add new
operational seating above the permanent layout.

### Verified Legacy Evidence

- `show_zone_operational_capacity_adjustments`: 24 retained records across 18
  performances, 306 seats. Their reasons identify corporate expiry recovery,
  capacity reconciliation and named booking restoration work.
- `phase55_show_zone_capacity_exceptions`: 101 retained records across 44
  performances, 740 seats. These snapshot historical commitments that exceeded
  the approved permanent layout during Phase 55 reconciliation.
- Thirty-eight future performances currently rely on historical compatibility
  protection in 69 show/zone combinations. The protected active overage is 414
  guests above permanent plus valid temporary-table capacity.
- The records are historical compatibility evidence, not physical seating.
  Deleting them or immediately removing their protection would invalidate
  legitimate existing commitments.

### Confirmed Defects

- The authoritative capacity function added legacy adjustment and Phase 55
  exception values to reusable operational capacity.
- Admin prechecks duplicated part of the calculation locally and could disagree
  with the database guard.
- An unallocated `Full Show Buyout` had no zone entitlement and could therefore
  fall through generic reporting logic into Middle Ring.
- The generic zone guard did not protect combined show occupancy when a Full
  Show Buyout had no zone allocation.

### Correction Prepared and Verified

- The pending migration applies a compatibility ratchet. It protects only the
  active historical overage proven by retained evidence, provides no reusable
  headroom, and automatically contracts when active occupancy falls.
- Permanent seating plus valid, performance-specific temporary tables are the
  only sources of new reusable operational capacity.
- The existing Admin shows response now includes the authoritative capacity
  state, avoiding another browser request. Admin prechecks call the same
  database calculation.
- A database trigger validates Full Show Buyouts against combined show
  occupancy and authoritative capacity.
- Operational reporting, Floor data and Table Plan no longer attribute an
  unallocated Full Show Buyout to Middle Ring.
- Existing assignments, temporary tables, strict single-table automation and
  public base availability remain unchanged.

### Verification Evidence

- 732 future show/zone states dry-run against the ratchet: zero existing active
  bookings invalidated and zero legacy reusable headroom remaining.
- Focused capacity and seating tests: 38/38 passed.
- TypeScript and Production webpack compilation passed.
- Changed-file lint introduced no new error. Two pre-existing Admin effect
  warnings remain outside the changed logic.
- Migration transaction rollback validation and linked dry run passed. The
  preflight rejects deployment if any active Full Show Buyout already exceeds
  combined authoritative capacity.
- No Production booking, table, capacity, payment, ticket or financial record
  was changed during investigation or verification.

Release evidence will be appended after the controlled migration and
Production deployment complete.

### Capacity Integrity Production Release

- Application commit: `826e0eff0aba4722b4c5f7b5da7a8f1eccfef611`.
- Migration: `20261030235920_capacity_integrity_legacy_ratchet.sql`, applied
  successfully through the linked Production workflow.
- Deployment ID: `dpl_E8eG1awVAfDXs9bL4UsLm5sufGET`.
- Deployment URL:
  `https://zingara-booking-platform-5qn4le57e-kaden-damons-projects.vercel.app`.
- Production alias: `https://book.zingara.co.za`.
- Deployment status: `Ready`.
- Rollback commit: `23b86d2257c04393a7708663257e97c83c84cd85`.
- Floor hydration correction commit:
  `90292b01bc980d96dead22ad68727a96e9cf10d4`.
- Final application deployment ID: `dpl_5puPBBhuGP9LLXTz9BMRNSCCToyN`.
- Final application deployment URL:
  `https://zingara-booking-platform-kf2iu3yyq-kaden-damons-projects.vercel.app`.

Post-release database verification returned 740 future show/zone states, zero
states above effective capacity, zero states with reusable legacy headroom,
five safe active Full Show Buyouts and an enabled combined-capacity guard. The
24 operational adjustment records and 101 Phase 55 exception records remain
unchanged as historical evidence.

Authenticated Production verification used Kaden's active Admin session. Floor
& Arrivals loaded with the approved permanent capacities and independent public
availability. For JHB 30 October, the displayed additional capacity reconciled
exactly to valid performance-specific temporary tables: Golden Circle 20,
Middle Ring 50, Private Booths 8 and Royal Balcony 40. No legacy adjustment was
needed to provide reusable headroom. The Floor summary initially counted a
legacy client-only flag and displayed zero temporary tables despite those
authoritative rows. The hydration correction now counts operational temporary
tables directly; authenticated Production displays 17 active temporary tables,
matching the database. The public booking and Admin routes both returned HTTP
200 after deployment.

Business-data delta is zero. No booking, assignment, show table, capacity
record, payment, ticket, Xero record or communication was inserted, updated or
deleted. The migration changed functions, permissions and a validation trigger
only.

### Capacity Integrity Final Status

The correction is live. Permanent seating and valid show-specific temporary
tables are the only sources of reusable operational capacity. Legacy evidence
continues to protect existing historical commitments but cannot authorise new
capacity. Admin prechecks, Floor capacity state and database enforcement now
share the same authoritative calculation, and unallocated Full Show Buyouts no
longer fall back to Middle Ring reporting.
