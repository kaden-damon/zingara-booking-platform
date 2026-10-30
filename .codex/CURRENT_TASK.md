# Phase 68 Follow-up - Overall Capacity Integrity & Legacy Adjustment Review

STATUS: COMPLETE - RELEASED TO PRODUCTION

DATE: 30 OCTOBER 2026

## Objective

Make permanent seating plus valid show-specific temporary tables the only
source of reusable operational capacity. Preserve historical over-capacity
commitments without allowing legacy recovery records to authorise new seats,
and align Admin, database, Floor and Table Plan calculations.

## Verified Production Findings

- `show_zone_operational_capacity_adjustments` contains 24 retained recovery
  records across 18 performances, representing 306 seats.
- `phase55_show_zone_capacity_exceptions` contains 101 retained historical
  exception records across 44 performances, representing 740 seats.
- Thirty-eight future performances currently rely on historical compatibility
  protection in 69 show/zone combinations. Their active bookings exceed the
  approved permanent layout plus valid temporary-table capacity by 414 guests.
- The existing capacity function treated both legacy sources as reusable
  operational headroom. These records were created for migration, restoration
  and reconciliation compatibility; they are not physical tables.
- Admin capacity prechecks independently recomputed capacity and could disagree
  with the database guard.
- Unallocated Full Show Buyouts could fall back to Middle Ring in operational
  reporting. The generic zone trigger also did not validate combined show
  occupancy for an unallocated Full Show Buyout.

## Safe Correction

- Introduce a compatibility ratchet: active historical overage is protected up
  to retained evidence, but it provides zero reusable headroom and shrinks as
  bookings reduce or cancel.
- Keep permanent capacity and valid show-specific temporary tables as the only
  reusable operational capacity sources.
- Route Admin prechecks and Floor capacity presentation through the same
  authoritative database calculation, within the existing request path.
- Add a database guard for combined Full Show Buyout occupancy.
- Exclude unallocated Full Show Buyouts from zone attribution so they no longer
  appear as Middle Ring occupancy.
- Preserve all legacy evidence, bookings, assignments and temporary tables.

## Verification

- Compatibility dry run: 732 future show/zone states evaluated; zero active
  bookings invalidated and zero legacy reusable headroom retained.
- Focused capacity, booking, seating and temporary-table tests: 38/38 passed.
- TypeScript: passed.
- Production webpack compilation: passed. The existing Admin performance-budget
  parser does not support the webpack client-reference manifest format.
- Changed-file lint has no new errors. Two pre-existing Admin effect warnings
  remain outside this correction.
- Migration transaction rollback validation and linked dry run passed; only
  `20261030235920_capacity_integrity_legacy_ratchet.sql` is pending.
- Business-data mutation during verification: zero.

## Production Release

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

## Production Verification

- Live read-back returned 740 future show/zone states, zero states above
  effective capacity and zero states with reusable legacy headroom.
- All five active Full Show Buyouts remain within combined authoritative
  capacity and the new database guard is enabled.
- The 24 adjustment and 101 Phase 55 exception records remain intact.
- Authenticated Kaden Admin loaded after deployment. Floor & Arrivals for JHB
  30 October showed permanent public capacities of 120, 125, 138 and 32, while
  every displayed additional seat reconciled to valid temporary-table rows for
  that performance. A hydration defect in the temporary-table summary was
  corrected and the hard-refreshed Production UI now shows 17 active temporary
  tables, matching the 17 authoritative rows. Public seats remained
  independently base-capacity limited.
- The public booking journey and Admin routes returned HTTP 200 from the
  Production alias.
- Business-data delta: zero. No booking, assignment, table, capacity record,
  payment, ticket, Xero record or communication was inserted, updated or
  deleted by the migration or release verification.

## Final Status

Overall capacity integrity is released. New reusable operational seating can
only come from valid show-specific temporary tables. Historical compatibility
evidence protects existing commitments without authorising future headroom.
