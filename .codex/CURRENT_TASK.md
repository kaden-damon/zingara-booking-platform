# Phase 54.12 - Box Office Assignment Approval

STATUS: COMPLETE

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

## Outcome

- Production commit: `d237f36661d0bcefbb82d68b1929c8b3158c8c8b`
  (`Add Box Office assignment approval workflow`).
- Vercel deployment: `dpl_13Fcc8RaFayogxTeK6quvYgc13rF`, READY and aliased to
  `https://book.zingara.co.za`.
- Added server-enforced management permissions, venue scope, mandatory reason,
  immutable approval evidence and a durable per-booking resume queue.
- An authorised resume remains active until an authorised pause or subsequent
  explicit state change. New eligible bookings continue through the existing
  automatic-assignment path without repeated approval.
- Approved waiting queues run in atomic batches of 25, with independently
  recorded assigned, manual-review and skipped outcomes. Staff can refresh
  progress explicitly; no browser polling was added.
- The Table Plan panel now identifies threshold-paused performances and shows
  occupancy, available physical tables/seats, waiting bookings and job results.

## Production Verification

- 53 verified Phase 54.11 legacy performances received non-destructive control
  metadata: 39 threshold-paused and 14 enabled.
- Zero Production threshold overrides, resume jobs or resume items were created.
- No real Production performance was resumed during QA.
- Remaining assignment queue is unchanged from Phase 54.11: 1,500 bookings /
  15,114 guests, including 1,230 bookings across 39 performances awaiting an
  authorised threshold decision.
- Admin and public booking routes both returned HTTP 200 after deployment.
- 18 focused assignment tests passed. TypeScript, changed-file ESLint,
  migration dry-run, `git diff --check`, Production build and Admin performance
  budget all passed.

## Rollback

- Application rollback point: `baf39c458f98beea741c7f48da9bec70e671e78b`.
- Database rollback must be forward-only. Preserve approval/job audit records if
  the workflow has subsequently been used; no destructive migration rollback.

## Business-Data Delta

- Added control metadata for 53 previously verified legacy performances.
- Added zero overrides, zero assignments and zero job records.
- No booking, table claim, show status, ticket-sale capacity, payment, ticket,
  customer or financial record changed.
