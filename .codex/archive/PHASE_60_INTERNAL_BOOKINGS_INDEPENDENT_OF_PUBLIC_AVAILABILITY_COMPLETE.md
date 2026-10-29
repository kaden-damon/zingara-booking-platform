# Phase 60 - Internal Bookings Independent of Public Availability

STATUS: COMPLETE

DATE: 29 OCTOBER 2026

## Root Cause

Internal booking paths reused fragmented public show-status checks. Closed
performances were hidden from Admin creation, Sold Out performances could be
selected but failed at final creation, transfers accepted a different status
set, and Corporate conversion had another independent filter.

## Implemented Policy

| Show state | Internal result |
| --- | --- |
| Open / Active | Allowed for staff with existing booking permission |
| Closed / Inactive | Allowed internally; public sales remain closed |
| Sold Out | Allowed internally; public sales remain closed |
| Special Event | Management approval and mandatory reason |
| Active Buyout | Management approval and mandatory reason |
| Blackout / Venue Closure / Archived / Unknown | Blocked |

The policy is shared by Standard booking creation, trusted booking handoff,
Corporate conversion, transfers and guest-count reconciliation. Management
exceptions require the existing `bookings:reconcile` permission and create
auditable approval events.

## Safeguards

- Public show discovery and booking remain `active`-only.
- Internal status approval does not bypass operational zone/table capacity,
  temporary-table accounting, concurrency, payments or ticket safeguards.
- The 70% automatic-assignment threshold remains an assignment control and does
  not change ticket availability.
- Guest-count reductions remain possible; increases still undergo authoritative
  capacity validation.
- Blackouts and unsupported statuses fail closed.
- The transfer database function remains callable only by `service_role`.

## Production Scope

- 88 future Closed performances.
- 29 future Sold Out performances.
- 4 future Special Events requiring management approval.
- 5 active Buyouts requiring management approval.
- 1 future Blackout remaining blocked.

## Verification

- 64 focused tests passed.
- TypeScript passed.
- Supported webpack Production build passed, including route generation.
- `git diff --check` passed.
- Authenticated Production UI reached the final review step for a Closed Cape
  Town performance and displayed the internal-only status notice. The flow was
  cancelled before submission.
- The verified Closed performance was absent from public `/api/shows`.
- Production `/admin` and `/book` returned HTTP 200.
- Database verification confirmed `inactive` and `special_event` support in the
  atomic transfer function, with `anon` and `authenticated` execution denied.
- Scoped ESLint reported only existing legacy hook findings in large page files.
- The legacy Admin performance-budget checker is incompatible with Next 16's
  current client-reference manifest shape; this did not affect the successful
  application build.

## Release

- Application commit: `e541cfb3ecf9ba54a0e1955e3b4201007b3ab26f`.
- Previous Production / rollback: `74551c519a325149b0d37aed9f892128d769de0a`.
- Migration: `20261030090000_phase_60_internal_booking_status.sql` applied.
- Production business-data delta: zero.
- No bookings, show statuses, payments, tickets, seating assignments, customers,
  communications or Xero records were created or modified during QA.

FINAL: PHASE 60 COMPLETE - INTERNAL BOOKINGS INDEPENDENT OF PUBLIC AVAILABILITY.
