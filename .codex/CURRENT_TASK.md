# Phase 54.13 - Table Capacity Correction & UX Simplification

STATUS: COMPLETE

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

## Outcome

- Root cause: earlier whole-layout reconciliation correctly skipped the affected
  performance because its operational layout does not exactly match the approved
  master. The later hybrid assignment path supported that layout but deliberately
  did not inherit missing permanent-table capacities, leaving eligible tables in
  `SEATS NOT SET`.
- Corrected 1,884 independently safe permanent-table capacities across 55 future
  performances: 984 rows across 33 Johannesburg shows and 900 rows across 22 Cape
  Town shows.
- Johannesburg, 18 December 2026 at 17:00: corrected 39 missing permanent-table
  capacities. All 10 waiting bookings / 50 guests then received safe physical
  table assignments without a threshold override. The queue for this performance
  is now zero, with 51 tables / 272 seats still available.
- Preserved nine configured capacity conflicts and three master-table mismatches
  on the affected performance. Its reconciliation status therefore remains
  pending rather than being falsely marked complete.
- Left 1,244 non-matching future table rows disabled and unchanged: 1,209 use
  table codes outside the approved master and 35 have a zone mismatch. None had
  an assignment, merge or manual override; management must map or retire these
  explicitly rather than the system guessing.
- Simplified the existing automatic-assignment panel with plain-language status,
  occupancy, waiting-booking and available-table summaries. Controls now use
  `Auto Assignment Limit`, `Pause Auto Assignment`, `Resume Auto Assignment`,
  `Save Limit`, and `Review Reminder`, and clearly state that ticket sales remain
  open when automatic assignment pauses.
- Preserved the 70% default, staff approval rules, ticket-sale capacity, show
  statuses, exports, payments, tickets, financial records and existing seating.

## Verification

- 22 focused Phase 54 tests passed, plus 10 Phase 54.4/54.5 regression tests.
- TypeScript, changed-file ESLint, migration dry-run, migration rollback rehearsal,
  `git diff --check`, Production build and Admin performance budgets passed.
- Admin budget: 1,260,204 raw bytes / 302,648 gzip bytes, within the established
  limits. No polling or booking-path requests were added.
- Production `/admin` and `/book` both returned HTTP 200 after deployment.
- Production database checks confirmed the target queue is zero and every exact
  approved-master permanent table now has a configured capacity.

## Release

- Production commit: `b028ceab82683b757e8612de7536f09a7018ab88`.
- Vercel deployment: `dpl_8R5udSkiAfSPfE2XgebjSVgA7P1E` (`READY`).
- Rollback application commit: `965773f1a6c2cbf0995749631de7c344693116ee`.
- Business-data delta: 1,884 guarded permanent-table capacity/configuration
  corrections, 10 safe booking table assignments and their table claims, plus
  immutable audit evidence. No booking totals, payments, tickets, show status,
  ticket-sale capacity, financial data or threshold overrides changed.
