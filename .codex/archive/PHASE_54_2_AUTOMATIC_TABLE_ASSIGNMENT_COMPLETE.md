# Phase 54.2 - Automatic Table Assignment

STATUS: COMPLETE - DEPLOYED DISABLED PENDING PERFORMANCE RECONCILIATION

DATE: 28 OCTOBER 2026

## Delivered

- Controlled automatic table assignment for new single-zone Standard and
  Corporate bookings.
- Atomic, show-scoped best-fit allocation with duplicate-table prevention.
- Manual queue fallback for Buyouts, multi-zone bookings, insufficient tables,
  disabled shows and all assignment failures.
- Configurable show threshold with a 70% default, audited pause/resume and
  deduplicated Box Office notifications.
- Venue-specific settings and independent Phase 54.1 approved layouts.
- Lightweight Table Plan controls loaded only with the active Floor view; no
  polling or normal booking-load requests were added.

## Permanent Table Capacities

For a performance explicitly adopting the approved layout, the adoption
transaction populates only unset permanent-table capacities from the approved
74-table master. It requires an exact structural match and refuses adoption if
there are capacity conflicts, assigned unset tables or reconciliation issues.
It does not overwrite manual values, assignments, temporary tables, merged
tables or historical layouts. Consequently, safely adopted permanent tables
do not display `SEATS NOT SET`, while temporary-table capacities remain
configurable.

## Production Reconciliation

- Future performances inspected: 189.
- Performances structurally and operationally eligible: 0.
- Closest structural match: 71 of 74 approved permanent tables.
- Performances with configured capacity conflicts: 189.
- Global automatic assignment: disabled.
- Venue defaults enabled: 0.
- Shows adopted/enabled: 0 / 0.
- Assignment attempts/notification events: 0 / 0.

No existing performance was adopted because the operational catalogues require
controlled table-by-table reconciliation against the approved master. This is
the required next operational step before enabling any show.

## Verification

- 16 focused Phase 54.2, allocator and refresh tests passed.
- TypeScript passed.
- Changed-file ESLint passed.
- `git diff --check` passed.
- Migration was rehearsed in a rolled-back Production transaction and then
  applied successfully.
- Production build and Admin performance budgets passed.
- Live `/admin` and `/book` routes returned HTTP 200.
- The protected assignment API returned HTTP 401 without authentication.

## Release

- Application commit: `72ccd59b8f4d79a5bc93a00b75032867b45533a6`
- Production deployment: `dpl_HyApuLX3upW9mgW9wQYn62T4G5SB` (`READY`)
- Rollback source commit: `be84b1fbf6380e758a071244b751389ab32794fb`

## Business-Data Delta

None. Schema and dormant configuration were added. No bookings, assignments,
table capacities, ticket-sale capacities, payments, tickets, exports or
financial records were modified. Automatic assignment remains inactive until
a performance passes reconciliation and is explicitly enabled.
