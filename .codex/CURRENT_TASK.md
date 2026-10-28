# Phase 54.9 - 70% Assignment Queue Resolution

STATUS: IN PROGRESS

DATE: 28 OCTOBER 2026

## Objective

Resolve existing table-assignment queue entries held by the configured 70%
automatic-assignment threshold without changing that default for new bookings.

## Safety Boundary

- Assign existing bookings only where an authorised, staff-attributed and
  audited threshold-resume exception already exists.
- Never manufacture an override, raise or disable the threshold, move existing
  assignments, or exceed approved table and zone capacities.
- Preserve show availability, ticket-sale capacity, bookings, payments,
  tickets, financial records and the existing Table Plan interface.
- Perform bounded, atomic and idempotent reconciliation; leave ambiguous or
  physically unsuitable bookings in the manual queue.

## Baseline

- Application and `origin/main`: `749aa03c5496d45ba103c30f1e13f279c216305b`.
- Production deployment is the verified Phase 54.8 release.
- Current active assignment queue: 1,533 bookings / 15,277 guests across 68
  future performances.
- Current threshold-classified subset: 1,236 bookings / 13,489 guests across
  44 performances.
- Existing authorised threshold-resume audit records: none.

## Work In Progress

- Classify threshold-held performances and calculate safe proposed table sets.
- Produce a concise Box Office approval queue for performances without an
  existing authorised exception.
- Correct the existing `RESUME` workflow so it processes the selected
  performance's waiting bookings in a bounded atomic batch after the audited
  approval is recorded.
- Verify the 70% default remains unchanged for all new bookings.
