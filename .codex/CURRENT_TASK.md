# P0 - Guest Count Validation Defect

STATUS: IN PROGRESS

DATE: 29 OCTOBER 2026

## Incident

`ZNG-655TW7` (STANDARD BANK, Johannesburg, 19 November 2026) has 35 guests in
Golden Circle and a valid eight-table assignment with combined capacity 36.
Reducing the booking to 33 guests returned the zone-capacity error intended for
added guests.

## Confirmed root cause

The Corporate fixed-total reconciliation function performs a second capacity
check using the entire revised guest count. Unlike the authoritative booking
capacity trigger, this duplicate check does not distinguish increases from
reductions. A reduction can therefore be rejected when a performance is
already above its baseline capacity, even though the amendment lowers its
entitlement.

## Correction boundary

- Capacity validation remains mandatory for increases.
- Equal counts remain rejected as unchanged.
- Reductions use the authoritative net-change rule and cannot worsen capacity.
- Existing table-fit, revision, permission, pricing, payment and audit guards
  remain unchanged.
- No Production booking is modified during verification.

## Production exposure

There are 251 eligible current/future Corporate direct bookings on the shared
path: 119 Cape Town and 132 Johannesburg, across 71 performances. At the audit
time, no current/future Corporate booking was in a zone whose active entitlement
exceeded its corrected effective operational limit. The defect remains latent
for future grandfathered or temporary-capacity scenarios until this release.

## Verification and release

Pending focused tests, migration validation, TypeScript, changed-file ESLint,
diff check, Production build, deployment and non-mutating Production checks.

## Business-data delta

No booking, assignment, table, show, payment, ticket or financial row may be
changed by this release.
