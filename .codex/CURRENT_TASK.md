# P0 - Temporary Table Capacity Override

STATUS: COMPLETE - DEPLOYED AND VERIFIED

DATE: 29 OCTOBER 2026

## Incident

Internal transfer validation still rejects `ZNG-XVFB2G` (Kerry, 10 guests,
Golden Circle) for JHB 12 November 2026 even though Lisa Rodderick created an
authorised ten-seat temporary table for that performance.

## Confirmed root cause

The shared operational capacity snapshot adds temporary tables to Richard's
permanent zone capacity, but Phase 55 grandfathered commitments above the
permanent master are not included in the operational baseline. Temporary seats
therefore absorb those preserved commitments before becoming available for
new internal bookings or transfers.

For the target Golden Circle:

- Permanent master capacity: 120.
- Phase 55 grandfathered active entitlement: 126.
- Temporary capacity present at Phase 55 activation: 2.
- Uncovered grandfathered baseline: 4.
- Current temporary capacity: 12, including `Kerry` once.
- Correct operational capacity: 120 + 4 + 12 = 136.
- Current entitlement: 126; Kerry transfer projection: 136.

## Correction boundary

- Preserve the permanent 74-table / 415-seat master.
- Preserve public sellable capacity and show statuses.
- Add only the grandfathered commitment not already covered by temporary
  tables or approved operational adjustments at Phase 55 activation.
- Count each current temporary table once.
- Exclude merged-table representations from temporary capacity.
- Apply the shared correction to internal creation, amendments and transfers.
- Do not move any booking or alter business data during release verification.

## Production result

- The permanent Golden Circle limit remains 120.
- The corrected operational Golden Circle limit is 136: permanent 120,
  uncovered grandfathered baseline 4 and temporary tables 12.
- Production entitlement was 122 at final verification, leaving 14 operational
  seats. A ten-guest transfer projects to 132 and is capacity-eligible.
- The full performance remains permanently configured for 415 seats while its
  performance-specific operational capacity is 444.
- Public sellable capacity and the SOLD OUT status are unchanged.
- `ZNG-XVFB2G` remains confirmed on JHB 4 November at table 406.
- Temporary table `Kerry` remains available, unassigned and unchanged.

## Shared audit

The corrected grandfathered baseline applies to 41 current/future
performances: 17 Cape Town and 24 Johannesburg. Thirteen currently contain
temporary tables. The correction covers 72 grandfathered show/zone records
and restores 314 operational baseline seats that were previously being
consumed twice. No booking was automatically moved or assigned.

## Verification and release

- Focused capacity and transfer tests: 16 passed.
- TypeScript: passed.
- Changed-file ESLint: passed.
- Diff check: passed.
- Migration dry run: passed.
- Production webpack build: passed.
- Production capacity snapshot verified after migration.
- Commit: `45bda54`.
- Deployment: `dpl_95gGBLL79vEadxvroeFiM2vJM1kd`, READY at
  `https://book.zingara.co.za`.
- Rollback application commit: `18aec05`.
- Rollback database function: restore the previous
  `booking_capacity_zone_state` definition from Phase 41.2Y.

## Business-data delta

Zero booking, assignment, table, show-status, public-capacity, payment, ticket
or financial rows were changed. The only Production change is the shared
operational capacity function definition and its migration-history record.
