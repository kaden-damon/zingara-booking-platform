# P0 - Emergency Production Outage / Booking Search Crash

STATUS: COMPLETE - SURGICAL RECOVERY RELEASED

DATE: 26 OCTOBER 2026

## Incident

Admin remained reachable, but booking search could leave staff browsers
unresponsive and Box Office unreliable. Production logs contained 491 rejected
booking-list requests in four hours, including repeated two-second sequences.

## Root Cause

The rendered Admin session could outlive its browser authentication token. A
booking search then called the protected bookings API without valid
authorization. The API correctly returned 401, but the shared client recovered
only the special staff-rollout 401 code, so an ordinary missing/expired-token
401 left the stale Admin session rendered and able to issue more requests.
Booking searches also did not cancel superseded in-flight requests.

The issue was present on both the current and preceding Vercel deployments.
The latest Table Plan export release was therefore not the cause and was not
rolled back.

## Recovery

- All 401 responses from protected `/api/admin/*` requests now trigger one
  guarded local sign-out and return to Admin login.
- Superseded booking-list searches are aborted and cannot overwrite current
  results or continue consuming browser/server resources.
- Intentional search cancellation is handled silently.
- No UI, query semantics, permissions or business rules changed.

## Verification

- Focused session and booking-search recovery tests: 4 passed.
- TypeScript: passed.
- Scoped changed-file ESLint: no errors; two pre-existing unused-code warnings
  remain in the bookings client.
- Full Admin-page ESLint retains two pre-existing React effect errors outside
  the changed lines.
- `git diff --check`: passed.
- Webpack Production compilation: passed; standalone TypeScript passed.
- The repository's pre-existing refund route export prevents webpack's
  generated Next route-type stage from completing, while the normal Turbopack
  build could not open its local compiler worker port in the restricted local
  environment. Vercel Production build/deployment is the authoritative release
  build verification.
- Admin initial-route performance budget is verified by the Production build.

## Safety

- Database migrations: none.
- Production business-data delta: zero.
- Bookings, payments, tickets, capacity, customers, Xero and financial records
  unchanged.
- Rollback point: `fc84e2fbb79d50623fabf2b0fa1c1147980900b8`.
