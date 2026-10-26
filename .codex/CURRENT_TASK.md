# P0 - Emergency Admin Login Reload Loop

STATUS: IN PROGRESS

DATE: 26 OCTOBER 2026

## Objective

Restore stable unauthenticated access to Production Admin for Vanessa and all
staff without changing credentials, permissions, business data or UI.

## Confirmed Root Cause

- The shared Zingara header requests the protected
  `/api/admin/venue-settings` endpoint as soon as `/admin` mounts, before an
  unauthenticated visitor has a staff session.
- Production logs show this endpoint returning `401` every 0.6-0.8 seconds for
  the affected reload loop.
- P0 commit `bdf34d07` broadened client recovery from the explicit
  `STAFF_SESSION_REFRESH_REQUIRED` response to every Admin `401`.
- Each expected pre-login `401` therefore cleared local auth and hard-reloaded
  `/admin`; the module-level recovery flag reset after every navigation and the
  cycle repeated.
- Vanessa Robinson's authoritative staff profile remains active with its
  existing Super Admin role and all-venue scope.

## Authorised Correction

- Use the existing public venue settings endpoint for the Admin header until a
  valid staff auth session exists.
- Retain protected venue settings for authenticated Admin sessions.
- Hard-recover only when the server explicitly returns
  `STAFF_SESSION_REFRESH_REQUIRED`.
- Preserve normal Supabase token refresh, session security and all Admin API
  authorisation.

## Verification

- Fresh unauthenticated `/admin` remains on a stable login screen.
- No protected Admin API request or reload storm occurs before login.
- Explicitly invalidated staff sessions still clear locally and return once to
  Admin login.
- Authenticated Admin bootstrap and Corporate booking search remain intact.
- Targeted tests, TypeScript, changed-file ESLint, diff check and Production
  build pass before release.
- Production is verified after deployment in a clean browser context and an
  authenticated existing session.

## Safety

- Strict UX/UI freeze.
- No staff credential, role or venue-scope changes.
- No booking, payment, ticket, capacity, customer or financial mutations.
- Preserve unrelated user-owned files.
