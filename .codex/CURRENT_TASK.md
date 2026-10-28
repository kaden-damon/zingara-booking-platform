# Phase 54.1 - Authoritative Seating Configuration

STATUS: IN PROGRESS

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
