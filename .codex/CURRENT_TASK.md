# Phase 62 - Table Merge & Seating Integrity

STATUS: COMPLETE - RELEASED AND VERIFIED IN PRODUCTION

DATE: 30 OCTOBER 2026

## Baseline

- Authoritative checkout: `/Users/kadendamon/.codex/worktrees/phase-50-12-admin-performance/zingara-booking-platform`
- Baseline commit: `edd7dadb853d12e42fcaf7c1af8d598a7f8a46ba` (`HEAD` and `origin/main` at task start).
- Existing user-owned Markdown records and report artifacts are preserved.
- No commit, push, migration application or deployment is authorised.

## Objective

Correct the Floor & Arrivals merge restoration, recommendation ordering and show-isolation defects without changing existing bookings, assignments, capacities, financial records or historical Production seating data.

## Verified Diagnosis

- Production merge relationships are currently structurally show-scoped: 297 merged parents and 1,027 child links were inspected read-only, with no missing children, cross-show children, parent/link mismatches, cross-section children or assigned child rows.
- The live `show_tables` capacity trigger handles inserts and updates through `NEW`, but is also installed for deletes without a delete branch. Deleting a merged parent during atomic restore therefore raises `TABLE_CAPACITY_REQUIRED`, which the API masks with the generic save error.
- The reviewed floor-planning recommendation path ranks lowest combined capacity before table count, allowing multiple exact-fit tables to beat one suitable table.
- Client table replacement removes only the requested show identifier. Where the authoritative and display show identifiers differ, an older alias can remain in memory and present stale floor state.

## Planned Safe Corrections

1. Make the table-capacity trigger return `OLD` for deletes while retaining all insert/update validation.
2. Prioritise the fewest suitable tables before spare capacity in the affected recommendation path.
3. Replace both requested and returned show aliases when refreshing Floor state.
4. Add focused regression tests and validate the new migration locally only.

## Local Outcome

- Added a delete branch to the authoritative `show_tables` capacity trigger. Insert and update capacity validation remains unchanged; atomic unmerge can now delete the merged parent and restore its physical members.
- Preserved the existing unmerge transaction, which locks the parent and members, rejects attached bookings, verifies matching show/zone membership, retains member capacities and restores each member to `available` or `disabled` according to its existing capacity configuration.
- Changed reviewed seating recommendations to rank the fewest tables first, then the least unused capacity. One suitable table now wins over a tighter multi-table combination; combinations remain available when no single table fits.
- Hardened client Floor refreshes to replace both requested and returned show identifiers, preventing stale alias-keyed rows from surviving navigation while preserving all independent performances.
- Added actionable handling when a merged parent or member has an attached booking.

## Verification

- Read-only Production integrity audit: 297 merged parents / 1,027 child links; zero missing children, cross-show children, parent/link mismatches, cross-section children or assigned child rows.
- Focused Phase 62 regression tests: 5 passed.
- Floor allocator regression tests: 9 passed.
- TypeScript: passed.
- Scoped changed-file ESLint: passed. The large Admin component retains two pre-existing effect findings and existing warnings outside the changed lines.
- `git diff --check`: passed.
- Next.js 16 Webpack Production build: passed.
- Default Turbopack build could not run because this environment blocks its internal compiler port. The existing Admin performance-budget script still reports the known unsupported Next.js 16 client-reference manifest format.
- The pre-release migration dry run confirmed `20261030120000` was the only pending migration.

## Production Release

- Application commit: `d624b5e6ec671f54d1263a7e73d76fde97951770`.
- Migration `20261030120000_phase_62_table_restore_delete_guard.sql` applied successfully and is present in linked migration history.
- Vercel Production deployment: `8n7HCR89Z9m7dqBtU83v5EL3dkjb` (`READY`, completed 30 October 2026 at 11:44:27 SAST).
- Rollback application commit: `edd7dadb853d12e42fcaf7c1af8d598a7f8a46ba`. The migration is intentionally forward-safe; rollback would restore the previous trigger definition only if required, without changing table data.

## Authenticated Production Verification

- Kaden Damon merged JHB 14 November 2026 Middle Ring tables 207 and 208 on a zero-booking performance. The UI immediately displayed `207+208` with combined capacity 8 and both source tables blocked under that parent.
- Restore succeeded and immediately returned tables 207 and 208 to separate available 4-seat rows with null merge parents and no bookings.
- JHB 15 November 2026 retained its independent zero-merge layout and separate 4-seat tables 207 and 208.
- CPT 31 October 2026 displayed single-table recommendations (including table 315 and table 19) where suitable; no booking assignment was executed.
- Pre/post integrity counts remained 6,903 bookings, 5,750 payments, 36,883 table rows, 297 merged parents and 1,027 member links. Structural exceptions remained zero.
- Production Admin returned HTTP 200.

## Business-Data Delta

- No booking, payment, financial, capacity or persistent seating assignment changed.
- The controlled zero-booking merge was fully restored. Two immutable audit events record Kaden's successful merge and restore at 11:45:33 and 11:45:44 SAST.
- Migration history and the trigger definition changed as authorised.
