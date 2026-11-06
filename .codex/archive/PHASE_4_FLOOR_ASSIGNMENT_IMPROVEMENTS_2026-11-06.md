# Phase 4 - Floor Assignment Improvements

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Objective

Let authorised Box Office staff see and immediately claim any suitable
available table from Floor & Arrivals while preserving seating integrity,
strict single-table automatic allocation and existing financial workflows.

## Root Cause

- The shared floor planner called `findBestTableAllocation`, which deliberately
  returned only the first best-fit table even when several valid tables were
  available.
- The Floor queue wrapped that one recommendation in redundant confirmation
  state for both ordinary and Corporate/manual assignments.
- The authoritative atomic database claim already supplied the required table
  lock, capacity validation, duplicate prevention, idempotency and audit trail;
  the missing behaviour was in option discovery and the interaction layer.

## Implementation

- Added `findSuitableTableAllocations` and exposed all valid single-table
  options on each floor booking plan. Sorting remains deterministic: exact and
  best fits first, followed by capacity and table code.
- Each option displays `Table N · X seats`; the first option adds `· BEST`.
- Clicking an option calls the established assignment endpoint immediately.
  Confirmation dialogs and their duplicate state were removed.
- Direct assignment reloads the current authoritative plan, validates that the
  selected table is still suitable for the requested booking zone and submits
  exactly one table to `assign_corporate_booking_zone_tables_atomic`.
- Existing valid merged tables remain single operational tables. No table
  combinations or automatic splits were introduced. Multi-zone bookings retain
  one manual claim workflow per authorised zone allocation.

## Integrity Verification

- Focused tests: 26/26 passed across suitability ordering, Floor presentation,
  Corporate allocation and strict no-split behaviour.
- `npx tsc --noEmit`: passed.
- Targeted ESLint: zero errors; one pre-existing warning for an unused legacy
  parameter in `src/lib/zingaraDemo.ts`.
- `git diff --check`: passed.
- Production Webpack build: passed. The local Turbopack worker could not open
  its temporary process port in the restricted environment, so the supported
  Webpack builder was used for the release build.
- Bundle comparison stayed within the existing Admin budgets: 1,243,872 raw,
  299,943 gzip and 169,872 largest gzip chunk. The change adds no request,
  polling, dependency, background work or extra render-time calculation.

## Production Evidence

- Rollback-only database verification used JHB 13 November 2026 booking
  `ZNG-3QXAJU`, two guests in Middle Ring, and exact Table 208. The first atomic
  claim succeeded; the repeat returned `idempotent: true`; the transaction was
  rolled back. Follow-up reads confirmed the booking remained unassigned and
  Table 208 remained available with its original timestamps.
- Kaden's authenticated Production session showed `ZNG-3QXAJU` with nine
  suitable tables: 208, 209, 210, 206, 204, 205, 211, 203 and 214. Every button
  included capacity and Table 208 was marked `BEST`.
- Additional live queue cards displayed all four suitable Private Booth tables,
  while Royal Balcony bookings with no valid fit remained unassigned and linked
  to Table Management. No assignment was executed.
- The actual rendered queue was visually verified on desktop and at a 390 x
  844 responsive viewport. Cards, labels and table buttons remained contained
  and readable.

## Release

- Local implementation commit: `a518532e`.
- Production application commit:
  `3781a9c81492467db246c509b8419ae82e052885`.
- Vercel deployment: `ASBVZxBEFBF7q1V6rineCcpyEQyk`.
- Deployment status: READY / healthy, reported by Vercel on 6 November 2026.
- Migration: none.
- Rollback: redeploy the prior Production commit; no schema or data rollback is
  required.
- Business-data delta: zero. No live booking, seating assignment, table,
  payment, ticket, customer, communication or financial record changed.

## Final Status

PHASE 4 COMPLETE - FLOOR ASSIGNMENT IMPROVEMENTS LIVE.
