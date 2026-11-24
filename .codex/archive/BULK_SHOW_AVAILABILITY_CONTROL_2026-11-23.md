# Bulk Show Availability Control

DATE: 23 NOVEMBER 2026

STATUS: RELEASED TO PRODUCTION / READY; TARGETED BEHAVIOUR AND SAFE LIVE CHECKS VERIFIED

## Continuity And Scope

- Read AGENTS.md, CURRENT_TASK.md, README.md and the authoritative Shows &
  Availability cleanup/release record. Baseline main and Production were the
  prior ticket correction, d12249b / dpl_DNR1bxa9j13rcBLfGahfvB9SvaLs.
- Existing labels map Open to `active` and Closed to `inactive`. Distinct
  sold-out, blackout/Buyout, special-event, venue-closure and archived states
  are preserved and require their existing individual controls, not bulk reset.
- No calendar search exists: the earlier approved cleanup removed it. Existing
  month and venue filtering are reused, not replaced or supplemented.
- Existing individual show editor, status dropdown, locks, duplicate checks,
  custom pricing, per-show audit and deferred Wallet behaviour are retained.
- No database change, migration, new integration or dependency. No booking,
  payment, seating, ticket entitlement or customer communication changed in QA.
  Frontend 2.0, checkpoints and unrelated uncommitted work remain untouched.

## Implementation

- Added accessible per-show checkboxes to the existing calendar cards, selected
  count, Select All Visible, Clear Selection, Open Selected and Close Selected.
- Only visible eligible shows can be submitted. Month/venue changes clear
  selection/results; checkboxes and navigation are guarded while saving.
- One native confirmation states the action and number of selected shows.
  Submission is guarded against repeated clicks and never retries writes.
- Existing `PATCH /api/admin/shows` accepts a bounded availability payload;
  the original single-show branch remains. Maximum 100 distinct IDs in one
  visible month, four independent updates at a time, one browser API request.
- Server validates action, month, venue, ID uniqueness/statuses, `settings:manage`,
  staff venue scope, current status, edit locks, Buyout protection and duplicate
  show rules. Status/updated-at compare-and-swap rejects intervening changes.
- Reads are bounded to the displayed month/venue and selected references.
  Existing Buyout-summary and stale-lock mechanisms are reused. No per-show
  full-platform reload or per-show browser API request is introduced.
- Only `shows.status` is written. Shared extraction preserves the original
  single-show per-record audit and deferred Wallet notification semantics.
- Response reports each selected ID as saved, unchanged or failed. A saved
  status whose audit failed is explicitly reported as saved with a warning,
  never falsely reported as unsaved. Unknown transport outcomes require review.
- Client merges only successful authoritative status results into affected
  shows, preserving all other show data and leaving failed IDs selected for
  review. Occupancy/financial tables are not reloaded by a status-only update.
- Responsive controls wrap without horizontal overflow; primary actions stay
  paired. Buttons and checkbox labels provide 44px minimum-height touch targets.

## Verification

- **12 targeted tests pass**: opening/closing multiple shows, permissions before
  reads, venue scope/filter exclusion, input bounds/duplicates, special states,
  locks, stale revisions, partial write failures, no-op actions, saved/audit-failed
  reporting, four-write concurrency/no retry, shared single-show audit/Wallet
  behaviour and existing staff status labels.
- TypeScript, changed-module ESLint and whitespace pass. Admin page ESLint
  remains exactly its existing count: two pre-existing hook errors / 59 warnings;
  no unrelated cleanup introduced.
- Isolated browser fixture extracts the actual changed toolbar/checkbox JSX and
  actual submission handler from Admin source, rather than a hand-built copy.
  All API results are local fixture data; external network access is blocked.
- Chromium checks pass at **320, 375, 390 and 1280px**: selection/count, clear,
  open/close, exactly one confirmation per submission, partial failures,
  venue-change clearing, disabled sold-out selection, no page errors/overflow.
  Mobile/desktop screenshots inspected. This is not a physical-iPhone or
  authenticated full-Admin Production browser test.
- Evidence: `local-evidence/show-bulk-availability-browser-qa.cjs` and
  `local-evidence/show-bulk-{320,375,390,1280}.png`.
- Local optimised build was blocked by Turbopack worker port binding permission
  (`Operation not permitted`), including an elevated retry. No application build
  success or local bundle-budget result is claimed. Production build verification
  is required before completion; no build/config workaround was committed.

## Release

- Commit **6ffbcd2e2fe14b05107ca97d5e84c5458de2d321**, pushed to main.
- Only four files committed: Admin page, existing Shows API route,
  `src/lib/showBulkAvailability.ts`, `src/lib/showBulkAvailability.test.ts`.
- Git-triggered Production deployment identified:
  `zingara-booking-platform-n25fo9m2h-kaden-damons-projects.vercel.app`.
- Production **dpl_FxLpJrVg6hPbGrTATdRry77n9Qvn**, **READY**, exact commit
  6ffbcd2e2fe14b05107ca97d5e84c5458de2d321. Public domain inspection confirms
  `book.zingara.co.za` serves that deployment.
- Vercel build compiled successfully in 7.7s, completed TypeScript/static page
  generation and finished its build in 49s. Existing unrelated ticket PDF
  dynamic-filesystem tracing warning remains; no tracing refactor introduced.
- Cloud Admin performance budget passed: raw **1,300,348 / 1,320,000 bytes**,
  gzip **315,094 / 320,000**, largest gzip chunk **168,468 / 170,000**.
- Live `/admin` returns HTTP 200. Its released static scripts contain Select
  All Visible, Open Selected and Close Selected. Unauthenticated bulk PATCH
  returns **401** before business writes. No real show status changed during QA.
- Authenticated Production bulk writes/full Admin browser interaction were not
  exercised against actual shows. Mutation/partial-failure behaviour was tested
  using the actual handler with isolated fixtures. No physical iPhone claim.
- Existing uncommitted records/evidence remain local and unstaged; only the
  approved four source/test files entered this release.

## Manage Toggle Follow-Up - 23 November

- Recovered AGENTS.md/CURRENT_TASK.md/README.md and this release record; prior
  Production/main baseline 6ffbcd2 / dpl_FxLpJrVg6hPbGrTATdRry77n9Qvn.
- Added one Manage toggle immediately after the existing venue-filter group.
  It sits beside the pills on desktop and wraps safely on narrow mobile layouts.
- Mode defaults false. Bulk toolbar/results and per-show checkboxes are mounted
  only while mode is active and existing permissions permit management.
- Clicking Manage again clears selection/results and exits selection mode.
  The submission guard also rejects hidden-mode actions; the toggle is disabled
  during an in-flight batch. Existing filters and safeguards are unchanged.
- No API, database, dependency, pricing, booking or other workflow changes.
  Only the Admin page and existing regression test were committed.
- 13 targeted tests pass, TypeScript/test lint/whitespace pass. Admin lint remains
  its unchanged two baseline hook errors and 59 warnings.
- Isolated actual-JSX/handler browser checks pass at 320/375/390/1280px:
  initially hidden controls/checkboxes, click and keyboard toggle, selection
  cleared on collapse/reopen, open/close confirmations, partial failures,
  filter clearing and no horizontal overflow. Screenshots inspected.
- Preserved previous screenshots; new evidence is
  `local-evidence/show-manage-{320,375,390,1280}-{collapsed,expanded}.png`.
- Commit **31a5d42351ee1bda0376700b8b264597b5059f3c** pushed through the
  existing main/Vercel workflow. Production **dpl_8mvd2p5wy7dDt7NUgxNsYnJScbyT**
  is **READY** and verified serving `book.zingara.co.za`.
- Cloud build compiled in 4.3s and completed in 39s. Performance budget passed:
  raw **1,300,964 / 1,320,000 bytes**, gzip **315,160 / 320,000**.
- Live Admin HTTP 200; released scripts contain the new Manage control/region
  and existing bulk controls. Unauthenticated bulk PATCH remains HTTP 401.
  Full authenticated Production UI mutation was not performed; actual interaction
  behaviour was verified with the isolated browser fixture, not live show edits.
- No real show state was changed during QA. Frontend 2.0 and unrelated local
  changes/checkpoints remain untouched; no physical-iPhone verification claimed.

## Status-Aware Action Buttons - 23 November

- Recovered current workflow and prior Manage release before editing. UI-only
  correction; server/API, database, confirmations, locks, permissions, partial
  results, filters and individual show controls remain unchanged.
- Added a small predicate alongside the existing eligibility logic, using only
  loaded selected show data. All Open disables Open Selected; all Closed disables
  Close Selected; mixed allows either change; empty/ineligible selections allow
  neither. Archived/Buyout/special status restrictions remain fail closed.
- Both button disabled state and the existing handler use that predicate, so a
  no-op cannot open a confirmation or issue an API request. Disabled controls
  use neutral grey styling and a not-allowed cursor.
- 14 targeted tests pass, including open/closed/mixed/empty, special/archived/
  Buyout exclusions and the existing bulk safety regressions. TypeScript,
  changed-module lint and whitespace pass. Admin lint unchanged at 2/59 baseline.
- Isolated actual-control/handler browser checks at 320/375/390/1280px verify
  both disabled states, distinct grey/gold rendering, direct no-op handler calls
  issuing zero requests/confirmations, mixed selections and existing bulk flows.
  Screenshot inspected; previous evidence preserved. New screenshots:
  `local-evidence/show-action-states-{width}-{collapsed,expanded}.png`.
- Commit **3bc0d6adf8daba7c151417decb04becbc92bafa6** pushed to main.
  Production **dpl_J9uJuqnW9NkfHnUgvUu52bb5S9bu**, **READY**, verified serving
  `book.zingara.co.za`; cloud build completed in 59s.
- Cloud Admin budget passed: raw **1,301,168 / 1,320,000 bytes**, gzip
  **315,211 / 320,000**, largest gzip chunk **168,585 / 170,000**.
- Live Admin HTTP 200, released disabled-action styles verified in its scripts,
  and unauthenticated bulk PATCH remains HTTP 401. Actual button-state matrix
  and zero-request no-op behaviour verified in isolated browser fixtures, not
  against real authenticated Production show edits; no physical-iPhone claim.
- No new queries, requests, dependencies, database changes or real show changes
  during QA. Frontend 2.0 and unrelated uncommitted records remain untouched.
