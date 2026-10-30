# Phase 68 Follow-up - Overall Capacity Integrity & Legacy Adjustment Review

STATUS: RELEASE IN PROGRESS

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

## Release Gate

Commit, migration, deployment and authenticated/read-only Production
verification are pending. Stop if the migration preflight detects any active
Full Show Buyout whose combined occupancy exceeds authoritative capacity.
