PHASE 51.3 - LIGHTWEIGHT ADMIN ARCHITECTURE

STATUS: VERIFIED - RELEASE IN PROGRESS

DATE: 23 OCTOBER 2026

GOAL

Reduce initial Admin JavaScript execution, React work, and memory pressure on
older computers through incremental, independently loaded operational
components while preserving the exact interface, workflows, permissions,
unsaved state, concurrency, and business rules.

BASELINE

- main / origin/main: c23c44a4d375778f10af08bfe6a8bd4cf3ad5f1b
- Production application commit: 1510c679f1ee82eeb3871275cfb99df81e91110f
- Production deployment: dpl_3BspcNCYG3E5sQS9rwwCCtBdW6Gg (READY)
- Production alias: https://book.zingara.co.za
- Rollback commit: c23c44a4d375778f10af08bfe6a8bd4cf3ad5f1b
- Admin client source: 46,745 lines.
- Phase 51.0: 330 state hooks, 67 effects, 1.55 MB raw / 376.5 KB gzip
  Admin route JavaScript, and a 1.00 MB raw / 226.3 KB gzip largest route chunk.
- Current rebuilt route chunks: 1,529,445 bytes raw / 370,765 bytes gzip for
  `src/app/admin/page.tsx`; largest chunk 1,002,926 bytes raw / 226,503 bytes
  gzip.

IMPLEMENTATION BOUNDARY

- Progressively defer existing operational components and supporting code until
  the existing screen or action requires them.
- Preserve all component props, state ownership, request boundaries, visible
  markup, styling, and user interactions.
- Do not move active booking/session/financial state where remounting could lose
  work.
- Preserve Phase 51.1 bounded Reports and Phase 51.2 background coordination.
- No business-data, schema, API, permission, layout, or workflow changes.

RELEASE BOUNDARY

Deploy only if bundle measurements improve materially and focused booking,
customer, report, lock, TypeScript, lint, diff, build, and Production checks
confirm functional parity.

IMPLEMENTED

- Moved the unchanged Academy curriculum and search helpers into an on-demand
  chunk loaded only when the Learning workspace is opened.
- Deferred existing booking-list, booking-detail, show-pricing, staff-issue,
  date-picker, and phone-input components until their current screens require
  them.
- Preserved state ownership in the Admin shell, so active booking locks,
  unsaved booking work, navigation state, and concurrency controls do not
  remount or move.
- Added focused architecture coverage for Academy completeness, on-demand
  module loading, and the existing booking/show lock cadence.

MEASURED RESULT

- Admin route chunks: 1,529,445 to 1,254,440 bytes raw (-18.0%).
- Admin route gzip: 370,765 to 301,254 bytes (-18.7%).
- Largest route chunk: 1,002,926 to 735,456 bytes raw (-26.7%) and 226,503 to
  159,657 bytes gzip (-29.5%).
- 6x CPU production-build run: 454,772 script bytes transferred versus the
  Phase 51.0 540 KB baseline (-15.8%); no long tasks observed across three
  reloads versus two long tasks / 243 ms in the Phase 51.0 baseline.
- Cold-run script duration was 198 ms; repeat runs were 40-47 ms. Cold FCP was
  804 ms and is not claimed as an improvement over the earlier 592 ms sample.
- Heap samples were not used to claim a memory reduction because authenticated
  garbage-collected measurement was unavailable. The initial executable and
  retained Academy source are materially smaller by construction.

VERIFICATION

- 62 focused Academy, Admin performance, booking management, concurrent
  booking, lock, report-lock, and visible-polling tests passed.
- TypeScript passed.
- Changed-file ESLint passed for the extracted module and tests. The Admin page
  retains two pre-existing `react-hooks/set-state-in-effect` findings in
  unchanged show/date synchronisation code; no new lint finding was introduced.
- `git diff --check` passed.
- Production build passed with only the existing ticket PDF filesystem-tracing
  warning.
- No schema, API, business-data, permission, layout, or workflow change.
