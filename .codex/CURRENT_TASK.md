# Phase 62 - Table Merge & Seating Integrity

STATUS: IMPLEMENTED LOCALLY - AWAITING RELEASE AUTHORISATION

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
- Migration list confirms `20261030120000` is local-only and unapplied.

## Outstanding Release Verification

- Apply the pending migration only after explicit release authorisation.
- Deploy the application changes, then verify authenticated merge, immediate refresh, restore, show switching and recommendation behaviour using isolated unassigned tables on at least two performances.
- No Production seating records should be repaired or changed automatically.

## Release Boundary

Implementation may be prepared and verified locally. Production migration, commit, push and deployment require separate explicit authorisation.
