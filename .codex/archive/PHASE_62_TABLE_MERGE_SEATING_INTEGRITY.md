# Phase 62 - Table Merge & Seating Integrity

STATUS: IMPLEMENTED LOCALLY - AWAITING RELEASE AUTHORISATION

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
- No migration was applied and no Production data was changed.

## Release Boundary

No commit, push, migration or deployment was performed. Authenticated Production mutation testing remains intentionally outstanding until explicit release authorisation. After deployment, use isolated unassigned tables on two performances to verify merge, authoritative refresh, restore and cross-show isolation without changing existing bookings.
