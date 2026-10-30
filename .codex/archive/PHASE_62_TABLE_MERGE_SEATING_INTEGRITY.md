# Phase 62 - Table Merge & Seating Integrity

STATUS: COMPLETE - RELEASED AND VERIFIED IN PRODUCTION

DATE: 30 OCTOBER 2026

## Root Causes

1. The live `enforce_show_table_zone_capacity` trigger was attached to DELETE operations but read `NEW` without handling DELETE. Atomic merged-parent deletion therefore raised `TABLE_CAPACITY_REQUIRED`; the API reduced this to the generic operational-save error.
2. The reviewed floor-planning path sorted valid combinations by total capacity before table count. Two exact-fit tables could therefore outrank one slightly larger suitable table.
3. Database merge relationships were already correctly show-scoped, but client refresh replacement removed only the requested show identifier. A returned display/authoritative alias could leave stale table rows in memory.

## Changes Prepared

- Local migration `20261030120000_phase_62_table_restore_delete_guard.sql` returns `OLD` for table deletes while preserving every existing insert/update capacity check.
- Seating recommendations now minimise table count before unused seats.
- Floor refresh state removes both requested and returned show aliases.
- Restore conflicts involving a member booking now return the existing actionable booking-reallocation response.

## Integrity Evidence

- Read-only Production audit covered 297 merged parents and 1,027 member links.
- No missing member, cross-show member, parent/link mismatch, cross-section member or assigned merged child was found.
- Existing merge/unmerge functions retain show and zone checks, row locks, booking guards and transactional execution.
- Member capacities are not rewritten during restore. Status returns to `available` when already configured and `disabled` otherwise, matching the pre-merge eligibility rules.

## Verification

- Phase 62 focused tests: 5 passed.
- Floor allocator tests: 9 passed.
- TypeScript: passed.
- Scoped ESLint: passed.
- Diff validation: passed.
- Next.js 16 Webpack Production build: passed.
- Pre-release verification did not apply the migration or change Production data.

## Production Release

- Commit: `d624b5e6ec671f54d1263a7e73d76fde97951770`.
- Migration: `20261030120000` applied successfully; linked migration history is aligned.
- Vercel deployment: `8n7HCR89Z9m7dqBtU83v5EL3dkjb` (`READY`, 30 October 2026 at 11:44:27 SAST).
- Rollback application point: `edd7dadb853d12e42fcaf7c1af8d598a7f8a46ba`.

## Production Verification

- Controlled authenticated QA used JHB 14 November 2026, a zero-booking Special Event performance.
- Tables 207 and 208 merged into `207+208` at capacity 8; the Floor refreshed immediately and displayed both physical members as blocked children.
- Restore completed successfully and returned both physical members to separate available 4-seat tables with null parent links and no booking assignments.
- JHB 15 November remained independent with zero merged tables and unchanged 207/208 rows.
- CPT 31 October showed single-table recommendations including table 315 and table 19; no assignment was executed.
- Final integrity remained identical to the pre-release baseline: 6,903 bookings, 5,750 payments, 36,883 table rows, 297 merged parents and 1,027 links. Missing, cross-show, cross-section and assigned child counts remained zero.

## Business-Data Delta

- No booking, payment, financial, capacity or persistent seating assignment changed.
- The controlled merge was restored completely. The only operational evidence added is the immutable successful merge/unmerge audit pair for Kaden Damon at 11:45:33 and 11:45:44 SAST.
- Phase 62 is complete.
