# P0 - Emergency Production Outage / Booking Search Crash

STATUS: IN PROGRESS - VERIFIED FIX UNDER RELEASE VALIDATION

DATE: 26 OCTOBER 2026

## Objective

Restore reliable Admin and Box Office operation after booking search caused
staff browsers to become unresponsive, while preserving every booking,
payment, ticket, capacity, customer and financial record.

## Confirmed Evidence

- Production edge routes, Vercel deployment and Supabase database were healthy.
- Authenticated Admin requests continued to succeed; this was not a total
  platform, database or deployment outage.
- Production logs recorded 491 rejected `/api/admin/bookings` requests in four
  hours, including sustained two-second request sequences from expired or
  unauthenticated browser sessions.
- The issue existed on both the current and preceding deployment, so rolling
  back the latest Table Plan export release would not correct it.
- Booking search launched new paginated requests without cancelling the
  superseded request.
- The shared client recovered only the special
  `STAFF_SESSION_REFRESH_REQUIRED` 401 response. A normal 401 from a missing or
  expired browser token left the rendered staff session active, allowing
  further search requests and repeated error/render work.

## Surgical Correction

- Treat every 401 from a protected `/api/admin/*` request as an expired Admin
  session and perform one guarded local sign-out/return to Admin.
- Cancel superseded booking-list requests when the search or filters change.
- Ignore intentional request cancellation rather than showing an error or
  allowing an older response to replace current results.
- Preserve the existing search field, filters, result ordering, permissions,
  database query and all UX/UI.

## Safety Boundary

- Strict UX/UI freeze.
- No database migration or business-data mutation.
- No rollback of legitimate releases.
- No change to booking, payment, ticket, capacity, Xero or financial rules.

## Release Verification

- Focused session/search recovery tests.
- TypeScript and changed-file ESLint.
- `git diff --check` and Production build.
- Authenticated Production Admin, Bookings, Booking Details and search.
- Public booking route and Production runtime logs after deployment.
