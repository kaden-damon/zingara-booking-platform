# P0 - Temporary Table Capacity Override

STATUS: IMPLEMENTATION IN PROGRESS

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
