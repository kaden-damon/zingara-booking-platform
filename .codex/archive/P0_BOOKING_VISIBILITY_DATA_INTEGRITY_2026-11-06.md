# P0 Booking Visibility & Data Integrity

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 6 NOVEMBER 2026

## Incident

Floor & Arrivals displayed zero guests in every zone for Johannesburg on
10 November 2026 while Automatic Table Assignment displayed 350 guests. The
same buyout also appeared to be waiting for automatic assignment.

## Authoritative Findings

- Performance: Johannesburg, 10 November 2026, 17:00
  (`c6a28375-6011-4402-93dd-8c169d322cff`).
- Booking: `ZNG-DA5D8B36`, NTT DATA - Internet Solutions, 350 guests, Full
  Show Buyout, awaiting payment.
- The booking has no zone allocation and no table assignment. Its buyout
  control record reports 350 unallocated guests, so Floor's zero zone totals
  were authoritative pending manual section planning.
- `get_box_office_assignment_approval_status` counted all active tableless
  bookings. It did not exclude Full Show Buyouts, despite the automatic
  assignment services already treating them as manual-planning bookings.

## Production Audit

- Scope: 264 performances; 6,469 active operational bookings; 47,097 guests.
- Current/future Cape Town: 126 performances, 1,361 bookings, 11,206 guests,
  1,141 assigned, 216 needing tables and 4 buyouts.
- Current/future Johannesburg: 49 performances, 1,242 bookings, 12,737 guests,
  986 assigned, 253 needing tables and 3 buyouts.
- Integrity checks: zero cross-show primary tables; zero cross-show table
  claims; zero active buyout guest mismatches; zero active buyouts missing a
  `corporate_buyouts` record; zero shows with multiple active buyouts.
- Eight active buyouts were included in the generic waiting calculation: CPT
  3, 13, 19, 20 and 21 November; JHB 6, 7 and 10 November.
- Two historical imported JHB 400-guest records on 1 and 16 October have null
  section evidence and notes describing a buyout but no authoritative buyout
  control record. They remain unchanged manual-review exceptions.

## Implementation

- `supabase/migrations/20261106013000_p0_booking_visibility_integrity.sql`
  replaces the assignment-status function and excludes active Full Show
  Buyouts with an indexed `not exists` lookup.
- `src/app/admin/page.tsx` displays a compact buyout context banner from the
  already-loaded selected-show state; it adds no request or polling path.
- `src/app/admin/AutomaticTableAssignmentPanel.tsx` scopes queue wording to
  eligible bookings.
- `src/lib/bookingVisibilityIntegrity.test.ts` protects the buyout exclusion,
  Floor explanation and unchanged automatic-assignment eligibility rules.

## Verification

- Focused tests: 16/16 passed.
- TypeScript: passed.
- Production webpack build: passed.
- Migration dry run: only the intended migration was pending.
- The existing broad Admin lint still reports two unrelated pre-existing
  `react-hooks/set-state-in-effect` findings; changed-line checks passed.
- After migration, the JHB 10 November assignment status returned 350 booked
  guests, 84.34% occupancy and zero waiting bookings / guests.
- Authenticated Production UI verified the 350-guest buyout banner, manual
  section-planning explanation, zero zone allocations, `All eligible bookings
  have tables`, and Needs a Table at 0 / 0.
- Mobile 390 x 844 verification found no horizontal overflow.

## Release

- Local application commit: `5f4240bc`.
- Production Git commit with identical tree:
  `51b04b225661ce3dc8779e2438235b0badc0f49f`.
- Production deployment: `6xZnU6aEsdL39x351FFTVeJo2Ti2`, READY.
- Migration: `20261106013000_p0_booking_visibility_integrity.sql`, applied.
- GitHub's normal receive path rejected the verified ref update with a server
  `commit_refs` failure. The same tree was published through the authenticated
  Git Data API; source content and deployment commit were verified.

## Data Integrity & Rollback

- Business-data delta: none. The migration replaced one read function only.
- No booking, buyout, seating, table, capacity, payment, ticket, customer or
  financial record was inserted, updated or deleted.
- Roll back by redeploying the parent application and restoring the prior
  function definition. No business-data rollback is required.

P0 COMPLETE - BOOKING VISIBILITY AND DATA INTEGRITY RECONCILED.
