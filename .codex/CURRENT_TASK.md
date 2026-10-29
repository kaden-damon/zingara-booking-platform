# P0 - Guest Count Validation Defect

STATUS: COMPLETE - DEPLOYED AND VERIFIED

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

- Focused guest-count and financial regression tests: 23 passed.
- TypeScript: passed.
- Changed-file ESLint: passed.
- Diff check: passed.
- Migration dry run and Production application: passed.
- Production webpack build: passed.
- The default Turbopack build could not create its local loader process because
  of the execution environment's port restriction; no source compilation began.
- Rollback-only Production verification changed `ZNG-655TW7` from 35 to 33
  inside one transaction, preserved the R55,440 total and paid amount, zero
  balance, table assignment and sold-out show handling, then rolled back.
- Post-verification state remains 35 guests with no persisted QA audit event.
- Increase validation remains fail-closed and unchanged counts remain rejected.
- Production commit: `fc1aca0a1835c384080ee7cdf48cc47ff729ac6f`.
- Deployment: `dpl_FdCPtt6QumPwctXftQoLMZhQhkGp`, READY at
  `https://book.zingara.co.za`.
- Admin and public booking routes returned HTTP 200 after deployment.
- Rollback application commit: `116d2eabf7d7205ac22872fa178c395a9a337f68`.
- Database rollback: restore the Corporate reconciliation function definition
  from `20261014170000_p0_corporate_guest_count_and_price_editing.sql`.

## Business-data delta

Zero booking, assignment, table, show, payment, ticket or financial rows were
changed. The only Production database changes are the corrected function
definition and migration-history record.
