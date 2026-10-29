# Phase 60 - Internal Bookings Independent of Public Availability

STATUS: COMPLETE

DATE: 29 OCTOBER 2026

## Goal

Allow authorised Box Office and Corporate Sales staff to create and manage
eligible internal bookings on restricted performances without changing public
show status, discovery, ticket availability or public capacity.

## Scope

- Audit and reconcile Standard, Corporate, transfers and guest-count amendments.
- Treat show statuses according to their operational meaning rather than as one
  generic unavailable state.
- Preserve authoritative operational capacity, temporary seating, merged tables,
  grandfathered commitments and the 70% automatic-assignment threshold.
- Keep public booking restrictions server-side and unchanged.
- Reuse existing booking, permissions, approval, audit and seating architecture.

## Safety

- No existing bookings, show statuses, payments, tickets, seating assignments,
  customers, communications or Xero records may be modified during QA.
- No public performance may be reopened or made discoverable by an internal action.
- Management-only exceptions remain fail-closed and server-authorised.
- Preserve unrelated working-tree files.

## Outcome

- Internal Standard, Corporate, transfer and guest-count workflows now use one
  server-authoritative show-status policy.
- `active`, `inactive` (Closed) and `sold_out` performances permit authorised
  internal bookings subject to the existing capacity and financial safeguards.
- `special_event` performances and active Buyouts require `bookings:reconcile`
  plus a mandatory audited reason.
- Blackouts, venue closures, archived shows and unknown statuses remain blocked.
- Public discovery and booking remain `active`-only.
- Production scope at verification: 117 future Closed/Sold Out performances are
  directly eligible internally, 9 Special Event/Buyout performances require
  management approval, and 1 Blackout remains blocked.

## Verification

- 64 focused tests passed.
- TypeScript passed.
- Production build passed with the supported webpack builder.
- `git diff --check` passed.
- Authenticated Production QA reached final review for a Closed CPT performance
  and displayed `CLOSED - INTERNAL BOOKINGS ALLOWED`; the flow was cancelled
  before submission and created no booking.
- The same Closed show remains absent from the public `/api/shows` response.
- Production `/admin` and `/book` both returned HTTP 200.
- The atomic transfer function accepts the intended internal statuses and
  remains executable only by `service_role`.
- Scoped ESLint retains pre-existing hook findings in the legacy Admin/public
  page files; Phase 60 introduced no new reported-line failures.
- The existing Admin performance-budget script cannot parse Next 16's current
  client-reference manifest format; the application build and route generation
  completed successfully.

## Release

- Application commit: `e541cfb3ecf9ba54a0e1955e3b4201007b3ab26f`.
- Rollback point: `74551c519a325149b0d37aed9f892128d769de0a`.
- Database change: one service-only transfer-function status guard; no booking,
  show, payment, ticket, seating, customer, communication or Xero rows changed.
- Production business-data delta: zero.
