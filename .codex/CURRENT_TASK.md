# Phase 50.12 - Admin performance and legacy hardware optimisation

Zingara is live Production. Diagnose first, implement only measured, surgical optimisations, preserve every existing workflow and release after complete verification.

## Goal

Make the existing Zingara Admin materially faster and more responsive on older, lower-powered PCs without rebuilding the platform, removing functionality, weakening safeguards or changing business data.

## Audit

- Profile JavaScript loading/execution, React rendering, hydration, CPU, memory, main-thread long tasks, network/API/database latency, background work, timers, retained state and module switching.
- Distinguish browser processing from server latency and examine the large Admin component and existing effect warnings based on evidence.
- Benchmark login/initial load, Bookings, search/filter, Booking Details, guest-count editing, booking creation, show switching, Table Plan, Customers, Companies and module switching.
- Use realistic CPU throttling and memory constraints where available; do not claim physical legacy-PC testing unless performed.

## Authorised optimisation

- Prefer route/component splitting, lazy loading, deferred non-essential work, reduced initial JavaScript execution, removal of proven redundant rendering/requests/effects, bounded list/modal rendering and correct listener cleanup.
- Preserve Phase 47.1 bounded server loading. No global booking/customer/company hydration, per-row queries, unnecessary polling or duplicate background work.
- Inactive modules must not perform unnecessary work, while booking-lock heartbeats, payment verification, operational notifications, session security, concurrency and auditing remain intact.
- Preserve all Standard/Corporate booking, CRM/Companies, Table Plan, Floor/Check-In, Reports, Reviews, Communications, Academy/Training, Xero, PayFast, ticket/QR, locking/View Only, capacity, financial and permission functionality.
- Preserve the approved black/gold UI, navigation and layouts. Table Plan output and the public booking journey are no-touch.

## Targets and verification

- Target common post-data interactions within 200 ms and booking-list usability within 1-2 seconds where infrastructure permits; report only measured results.
- Test normal and CPU-throttled operation, representative large datasets, repeated modal/module cycles and sustained use. Check long tasks, CPU, memory growth, duplicate requests, render loops, stale data and all critical workflows.
- Run focused regressions, TypeScript, changed-file ESLint, `git diff --check` and Production build.
- Do not create Production bookings/payments, send communications or modify business data.

## Release

Confirm baseline and rollback, preserve unrelated changes, commit only authorised files, push to main, deploy to Vercel Production and verify actual Production responsiveness.

Final status: Phase 50.12 complete - Admin performance optimised for legacy hardware.
