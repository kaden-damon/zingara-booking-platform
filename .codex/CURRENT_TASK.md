PHASE 51.2 - BACKGROUND ACTIVITY OPTIMISATION

STATUS: VERIFIED - READY FOR RELEASE

GOAL

Reduce unnecessary background requests, polling, browser processing, and
server workload while preserving real-time operational behavior, concurrency,
notifications, payment verification, and all existing UX and business rules.

BASELINE

- main / origin/main: a369fe06dc618cce5ecf57b83d76a31fe98925e2
- Production deployment: dpl_DYCy7ApG2khEVeHRdi9Fzfhm8fTk (READY)
- Production alias: https://book.zingara.co.za
- Rollback commit: a369fe06dc618cce5ecf57b83d76a31fe98925e2
- Phase 51.0 bounded sample: 1,873 of 10,000 requests (18.7%) were
  notifications, maintenance, booking-lock lists, system maintenance, or
  show-lock lists.
- Normal authenticated Admin cadence before correction:
  notifications every 15 seconds; Admin maintenance, booking-lock lists, and
  show-lock lists every 30 seconds; public maintenance every 60 seconds.

CONFIRMED TARGETS

- Non-critical refresh intervals continue while documents are hidden.
- Global booking/show lock lists poll every Admin session even when the owning
  workspace is inactive.
- Several module-specific operational refreshes continue in hidden tabs.
- Focus and visibility resumption can duplicate a request already in flight.

SAFETY BOUNDARY

- No screen, layout, navigation, control, style, workflow, permission, or
  business-rule change.
- Active booking and show lock heartbeats retain their current cadence and
  server-side expiry/revision safeguards.
- No booking, payment, ticket, capacity, customer, Xero, Table Plan, Academy,
  or other business-data mutation.
- No stale financial caching, missed notifications, extra polling, or unrelated
  refactoring.

RELEASE BOUNDARY

Deploy only after focused cadence, visibility, lock, notification, maintenance,
TypeScript, changed-file ESLint, diff, and Production build checks pass.

IMPLEMENTATION

- Added one shared visibility-aware polling scheduler with in-flight request
  suppression, immediate foreground refresh, focus/visibility deduplication,
  and complete listener/timer cleanup.
- Notifications and maintenance retain their existing visible-tab cadence but
  stop while the document is hidden.
- Booking-lock lists now refresh only in Bookings/Corporate or while Booking
  Details is open. Show-lock lists refresh only on Calendar or while a show is
  open. Exact-session edit heartbeats are unchanged.
- Platform Operations, System Status, report-generation locking, and public
  maintenance refresh only while their owning view is active and visible.
- The public location-selection clock no longer rerenders once per second in a
  hidden tab.

MEASURED EFFECT

- Hidden inactive tab: up to 10 non-critical network refreshes/minute and 60
  local clock renders/minute before; zero after.
- Visible Admin: background request cadence falls from 10/minute to 8/minute
  in Bookings/Calendar (20%) and to 6/minute in other workspaces (40%), while
  notifications and maintenance retain their original active cadence.
- No new requests, polling loops, caching, dependencies, or UI changes.

VERIFICATION

- Focused polling, booking-lock, same-show concurrency, and report-lock tests:
  35 passed.
- TypeScript: passed.
- Changed files other than the pre-existing large Admin file: ESLint passed.
- Admin changed lines: no new ESLint errors; the file retains two historical
  `set-state-in-effect` errors at unchanged lines 8407 and 8420.
- git diff --check: passed.
- Production build: passed with only the existing ticket-PDF tracing warning.
