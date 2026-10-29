# Phase 60 - Internal Bookings Independent of Public Availability

STATUS: IN PROGRESS

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
