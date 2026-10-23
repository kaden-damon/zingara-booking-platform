PHASE 51.2 - BACKGROUND ACTIVITY OPTIMISATION

STATUS: COMPLETE - DEPLOYED AND VERIFIED

DATE: 23 OCTOBER 2026

SCOPE

- Reduced non-critical background requests, timers, and hidden-tab browser
  processing without changing screens, controls, workflows, permissions, or
  business rules.
- Preserved active booking/show lock heartbeats, session presence, payment
  verification, notifications, maintenance checks, and concurrency controls.

ROOT CAUSES

- Notifications and maintenance continued on fixed intervals while documents
  were hidden.
- Global booking/show lock lists refreshed in every Admin workspace even when
  their status was not visible.
- Module-owned refreshes continued in hidden tabs, and separate focus and
  visibility events could request the same refresh twice.
- The public location page rerendered once per second in hidden tabs.

CORRECTIONS

- Added a shared visibility-aware polling scheduler with in-flight suppression,
  immediate foreground refresh, event deduplication, and complete cleanup.
- Scoped booking-lock lists to Bookings/Corporate or an open booking, and
  show-lock lists to Calendar or an open show.
- Paused notifications, maintenance, module status, report-lock, public
  maintenance, and local clock work while hidden.
- Kept exact-session booking and show edit heartbeats at their original
  30-second cadence and retained all server expiry/revision safeguards.

PERFORMANCE

- Hidden inactive tab: up to 10 non-critical network refreshes/minute and 60
  local clock renders/minute before; zero after.
- Visible Admin: steady-state background cadence falls from 10 requests/minute
  to 8 in Bookings/Calendar (20%) and to 6 in other workspaces (40%).
- Active notifications and maintenance retain their original cadence. No new
  polling, stale cache, dependency, or background request was introduced.
- Phase 51.0 recorded 1,873 of 10,000 Production requests (18.7%) in the
  targeted background families. The deployed change removes only unnecessary
  executions; already-open tabs use their prior bundle until refreshed.

VERIFICATION

- Focused polling, booking-lock, same-show concurrency, and report-lock tests:
  35 passed.
- TypeScript: passed.
- Changed files other than the pre-existing large Admin file: ESLint passed.
- Admin changed lines introduced no ESLint errors; two historical errors remain
  at unchanged lines 8407 and 8420.
- git diff --check: passed.
- Production build: passed with only the existing ticket-PDF tracing warning.
- `/admin`, `/book`, and `/api/platform-maintenance`: HTTP 200 in Production.
- New deployment runtime errors: zero. New deployment HTTP 5xx responses: zero
  during release verification.

RELEASE

- Implementation commit: 1510c679f1ee82eeb3871275cfb99df81e91110f
- Production deployment: dpl_3BspcNCYG3E5sQS9rwwCCtBdW6Gg (READY)
- Production alias: https://book.zingara.co.za
- Rollback commit: a369fe06dc618cce5ecf57b83d76a31fe98925e2
- Production business-data delta: zero.
