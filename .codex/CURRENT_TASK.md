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
