# Phase 68 - Floor Capacity & Seating Integrity

STATUS: IN PROGRESS

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

## Release Evidence

Pending implementation, migration, deployment and authenticated Production
verification.
