# Phase 54.12 - Box Office Assignment Approval

STATUS: IN PROGRESS

DATE: 28 OCTOBER 2026

## Objective

Let authorised Box Office management review a threshold-paused performance,
record one audited resume decision and drain its eligible assignment queue in
safe bounded batches without repeated approval.

## Production Baseline

- Application and `origin/main`: `baf39c458f98beea741c7f48da9bec70e671e78b`.
- 1,230 bookings across 39 performances require 70% threshold approval.
- Current per-performance queues range from 13 to 73 bookings.
- No Production threshold override will be created during implementation or QA.

## Confirmed Gap

The existing Table Plan panel exposes threshold controls, but legacy hybrid
performances have no durable control row. The existing resume RPC also requires
a fully adopted layout and processes only one direct batch, with no persistent
progress or per-booking continuation evidence.

## Safety Boundary

- Require active staff identity, venue scope, `bookings:manage` and
  `tables:manage` in both the API and database.
- Require a non-empty reason and record the staff identity, timestamp and
  assignment revision.
- Keep the override active until an authorised manual pause or the show ends.
- Snapshot the waiting queue once per approval and process each item once in
  bounded, atomic, idempotent batches.
- Reuse Phase 54.11 table-unit, capacity, zone, minimum occupancy and concurrency
  validation.
- Never manufacture an approval, move an existing claim, alter ticket-sale
  capacity, change show status or touch financial data.

## Implementation Plan

1. Add durable resume jobs and per-booking job items.
2. Seed control rows for the 53 verified Phase 54.11 legacy performances without
   adopting or replacing their layouts.
3. Add permission-protected hybrid pause/resume/threshold controls.
4. Extend the existing status API and panel with occupancy, available physical
   seating, waiting count and job progress.
5. Continue approved jobs asynchronously in bounded batches and expose an
   explicit progress refresh without background polling.
