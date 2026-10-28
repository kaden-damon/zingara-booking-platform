# Phase 54.12 - Box Office Assignment Approval

STATUS: COMPLETE

DATE: 28 OCTOBER 2026

## Release

- Production commit: `d237f36661d0bcefbb82d68b1929c8b3158c8c8b`.
- Previous rollback point: `baf39c458f98beea741c7f48da9bec70e671e78b`.
- Vercel deployment: `dpl_13Fcc8RaFayogxTeK6quvYgc13rF` (READY).
- Production URL: `https://book.zingara.co.za`.

## Delivered

- Threshold-paused performances are identified in the existing Table Plan
  automatic-assignment panel.
- Occupancy, available physical tables/seats and waiting-booking counts are
  visible before approval.
- `RESUME AUTO ASSIGNMENT` requires an operational reason and records staff,
  venue, timestamp, assignment revision and audit evidence.
- Server and database both enforce active staff identity, venue scope,
  `bookings:manage` and `tables:manage`.
- One approval creates an idempotent durable queue and continues eligible work
  in atomic batches of 25. Existing Phase 54.11 zone, capacity, minimum
  occupancy and concurrency validation remains authoritative.
- Progress and final assigned/manual/skipped results are available through an
  explicit refresh, with no background polling.
- The approved override remains active until an authorised pause or a later
  explicit performance state change.

## Verification

- 18 focused tests passed.
- TypeScript passed.
- Changed-file ESLint passed.
- Migration dry-run and deployment passed.
- `git diff --check` passed.
- Production build and Admin performance budget passed.
- Admin and public booking routes returned HTTP 200 after deployment.

## Production State

- 53 non-destructive legacy control rows: 39 threshold-paused, 14 enabled.
- 0 threshold overrides, 0 resume jobs and 0 resume items created by release or
  QA.
- Remaining queue unchanged: 1,500 bookings / 15,114 guests; 1,230 bookings on
  39 performances await a real authorised Box Office threshold decision.
- No booking, assignment, capacity, show status, payment, ticket, customer or
  financial record changed.

## Rollback

Revert the application to `baf39c458f98beea741c7f48da9bec70e671e78b` if
required. Database rollback is forward-only and must preserve any future
approval and job audit evidence.
