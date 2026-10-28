# Phase 54.13 - Table Capacity Correction & UX Simplification

STATUS: IN PROGRESS

DATE: 28 OCTOBER 2026

## Objective

Restore authoritative permanent-table capacities where they are safely missing,
starting with Johannesburg on 18 December 2026 at 17:00, and simplify the
existing automatic-assignment controls for Box Office without changing seating,
ticket-sale or financial rules.

## Production Baseline

- Application and `origin/main`: `965773f`.
- Phase 54.12 is live; no Production threshold overrides or resume jobs were
  created during its release or QA.
- Existing unrelated untracked audit artifacts remain user-owned and untouched.

## Safety Boundary

- Use only Richard's approved venue-specific master table code, zone and maximum
  capacity as the source for a missing permanent-table capacity.
- Never overwrite a non-null performance capacity, manual adjustment, temporary
  table, merged table, blocked table, existing claim or assignment.
- Do not change ticket-sale capacity, show status, public availability, exports,
  bookings, payments, tickets or financial records.
- Do not manufacture a 70% override or force an assignment.
- Keep all operations bounded, indexed, audited and idempotent.

## Plan

1. Audit the affected show and compare it with the approved master and working
   performances in both venues.
2. Classify every missing capacity as safely inheritable or requiring manual
   management review.
3. Add the smallest guarded capacity correction and apply it only to independently
   verified affected performances.
4. Rewrite only automatic-assignment labels and status explanations in plain
   Box Office language.
5. Verify assignment eligibility, queue delta, exports, performance and responsive
   control layout before release.
