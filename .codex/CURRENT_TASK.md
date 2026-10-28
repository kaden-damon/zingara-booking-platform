# Phase 54.1 - Authoritative Seating Configuration

STATUS: COMPLETE

DATE: 28 OCTOBER 2026

## Objective

Introduce Richard's approved 74-table physical seating master as an additive,
venue-specific and immutable versioned configuration for Cape Town and
Johannesburg, ready for the future Phase 54.2 assignment engine.

## Approved Authority

- Source: `Table Plan Template.xlsx`.
- Source SHA-256: `43bf6bca8d0e1094aba7f05b01cc945a992dc4c77e590750db9d3dcfcd88a5b7`.
- Golden Circle: 23 tables / 120 guests.
- Middle Ring: 24 tables / 125 guests.
- Private Booths: 23 tables / 138 guests.
- Royal Balcony (ESA): 4 tables / 32 guests.
- Total: 74 physical tables / 415 guests.
- Table 400 is Middle Ring; Golden Circle begins at table 401.
- The same approved master currently applies independently to both venues.

## Safety Boundary

- Additive configuration only; do not replace the operational table catalogue.
- Do not change ticket-sale capacities or current show availability.
- Do not alter existing tables, assignments, merges, temporary tables,
  bookings, payments, tickets, exports or financial records.
- Do not adopt any performance automatically.
- Keep automatic assignment disabled.
- Flag current/future physical-capacity conflicts for controlled reconciliation.
- Preserve Phase 51 performance protections and add no booking-path requests.

## Verification

- Exact 74-table identity, zone and maximum-capacity reconciliation.
- Exact 415-seat total and approved zone subtotals.
- Independent approved versions for Cape Town and Johannesburg.
- Immutable approved configuration and service-only access.
- No performance adoption and no automatic assignment.
- Existing operational objects remain unchanged.
- Focused tests, TypeScript, changed-file ESLint, diff check, migration
  validation and Production build.

## Outcome

- Cape Town and Johannesburg each have an independent approved version 1.
- Each version contains the exact 74-table / 415-seat master.
- Corrected master interpretation: table 400 is Middle Ring, producing the
  approved 120 Golden Circle and 125 Middle Ring totals.
- Both venue settings keep automatic assignment disabled.
- No performance adopted the new layout and the service-only availability
  interface returns no rows until explicit future adoption.
- Forty-four current/future performances are queued for controlled
  reconciliation. This supersedes the Phase 54.0 count of 41 because the
  approved table 400 zone correction exposes three additional performances.
- Existing operational table records, assignments, temporary tables, merged
  tables, bookings, ticket-sale controls and financial totals were unchanged.
- Release commit: `faaf34e61e1389f92cd5db6074577b6c4a62445b`.
- Vercel deployment: `dpl_HLoWnodAxYWnKx35RNgCmDH4HbeG`.
- Rollback point: `fb0d65a1135d685cc467704b278e4da233693626`.

## P0 Steer - Missing Production Tables

- Affected show: Cape Town, 15 December 2026 at 18:00
  (`8d62c27d-a96a-4ee1-aebe-a6c4c02622e9`).
- Confirmed state: 63 legacy/override rows and zero permanent physical rows.
- Root cause: Phase 37 seeded permanent rows only for shows active on 25 August
  2026. This show was inactive then and was activated on 1 October, but the
  status-transition path did not seed the operational physical catalogue.
- Scope: 31 current/future shows have zero permanent rows; 14 contain 152 active
  bookings / 1,918 guests.
- Repair boundary: add only missing permanent rows from the existing operational
  catalogue, preserve every existing row and prevent future inactive-to-active
  transitions from retaining an incomplete layout.
- Phase 54.1 approved versions remain dormant; no automatic assignment or
  ticket-sale capacity change is authorised by this repair.

### P0 Outcome

- Restored the unchanged 79-row operational physical catalogue to all 31
  current/future performances that were missing one or more permanent rows.
- Cape Town, 15 December 2026 at 18:00 now has 79 permanent physical rows:
  24 Golden Circle, 28 Middle Ring, 4 Royal Balcony and 23 Royal Booths.
- The affected performance remains at 28 active bookings / 198 guests and its
  disabled `Lisa` temporary override remains intact.
- Golden Circle and Middle Ring inherit the existing operational catalogue's
  unconfigured state and are rendered by Floor as `Seats not set`; no capacity
  value was guessed or introduced.
- Added an idempotent safeguard for future show status changes so missed
  catalogue rows self-heal without touching booking or assignment logic.
- Completeness guard confirms zero missing operational catalogue rows across
  current/future performances after repair.
- Added 2,449 permanent `show_tables` rows and 31 append-only repair audit
  events. No booking, assignment, payment, ticket, ticket-sale capacity,
  temporary-table, merged-table or financial record changed.
- Focused tests: 4/4 passed. TypeScript, changed-file ESLint and diff check
  passed. Live migration rehearsal rolled back successfully before release.
- P0 release commit: `d287e65397204ee4d45f3ab8b4ba7d923c61840a`.
- Vercel Production deployment: `dpl_G9D7W9ZMRQSBgRyyDMQeDpfFipWb`.
- P0 rollback point: `0fee678944d3cfc97f7d2690d825318ff6d6ba84` / deployment
  `dpl_GW9qmvprHLWZ7qQtXK8Yxbu6YDHm`. Restored rows should remain in place if
  application code is rolled back, because removing them would restore the
  operational defect.
