# P0 - Vercel Duration And Production Authentication Incident

STATUS: COMPLETE - PROVIDER RECOVERED, SAFEGUARD DEPLOYED AND PRODUCTION VERIFIED

DATE: 9 NOVEMBER 2026

## Incident

Vercel raised critical alert
`ag_01a1c032-e0d2-76e3-ba4e-83ae5b9e1ce1` at 12:05 UTC
(14:05 SAST). Function Duration increased 29x from a 0.23 GB-hour baseline to
6.48 GB-hours in the 15-minute detection window. Staff simultaneously reported
raw `Failed to fetch` login failures and sessions stuck on `RESTORING SESSION`.

## Confirmed Root Cause

- All failures ran on existing Production deployment
  `dpl_6FYgqyeFayT7KaoZWGjNrnRFhhDH`, which had served normal traffic before
  the spike. There was no coincident application deployment.
- Vercel runtime logs recorded Cloudflare 522/520 origin timeouts from
  `jekxwtvdskacsyjhhnzd.supabase.co`, including an
  `AuthRetryableFetchError` from `/auth/v1/user` during Admin validation.
- `/api/shows`, `/api/venue-settings`, Admin routes, telemetry, reviews and
  other unrelated database-backed routes waited approximately 19-300 seconds.
  CPU remained in the tens of milliseconds and memory remained approximately
  370-500 MB, excluding an application CPU loop or memory leak.
- Exact comparison: the 11:20-11:50 UTC baseline had 5,332 invocations and no
  recorded 5xx responses. The 11:50-12:12 UTC incident window had 2,720
  invocations and 866 5xx responses, a 31.8% error rate.
- Supabase management health reported Auth, Database, database-user access,
  REST, Realtime, Storage and PgBouncer unhealthy. Only the pooler control
  service was healthy. A management-plane read-only timestamp query returned
  HTTP 544: `Connection terminated due to connection timeout`.
- A Paris-region Vercel preview reproduced the same 20-second 500 responses.
  The proposed region change was therefore rejected and not released.

## Recovery

- The supported Supabase project restart endpoint returned HTTP 200 at
  12:34:28 UTC (14:34:28 SAST).
- The Supabase dashboard confirmed the restart was in progress. All eight
  checked services returned `ACTIVE_HEALTHY` at 12:39:53 UTC
  (14:39:53 SAST).
- No database record, migration, schema, credential, role, RLS policy or
  application configuration was changed by the recovery.

## Authentication Resilience Correction

- `getAdminAuthSession` and `signInAdmin` now use a bounded 12-second operation.
- The full Admin restore path aborts staff-profile validation after 12 seconds
  and cannot remain on the restoration spinner indefinitely.
- Expected upstream failures display a concise temporary-service message.
- A genuine empty or expired session still reaches login safely. A successful
  session continues through the existing authoritative `/api/admin/staff`
  profile, active-status, permission and RLS validation.
- No polling, timer loop, background task, role expansion or cached
  authentication decision was added.

## Verification

- Kaden's existing authorised Production session restored successfully and the
  Admin dashboard loaded authoritative calendar data and management controls.
- Live post-recovery checks before release: `/api/shows` HTTP 200 in 1.02s,
  `/api/venue-settings` HTTP 200 in 0.63s and a management-plane database query
  HTTP 201 in 0.47s.
- First post-recovery five-minute Vercel window: 93 Production function
  invocations, zero 5xx responses and 618ms average duration.
- Final checks after release: `/api/shows` HTTP 200 in 1.42s,
  `/api/venue-settings` HTTP 200 in 0.47s and `/admin` HTTP 200 in 0.71s.
- Focused tests: 6/6 passed. Production build and TypeScript passed.
- Admin performance budget passed in Vercel: raw 1,294,823 / 1,320,000 bytes;
  gzip 314,221 / 320,000; largest gzip chunk 167,512 / 170,000.
- Existing unrelated lint findings in the monolithic Admin page were not
  changed or broadened.

## Critical Services

- Public show and venue-settings reads recovered and returned authoritative
  data. Public booking pages and availability routes resumed normal traffic.
- Auth, database, REST, Realtime, Storage and PgBouncer all recovered.
- No PayFast callback, booking, ticket, payment or financial record was changed
  during investigation or verification. No test booking or charge was created.
- Existing scheduled jobs and payment handlers were not modified. Their shared
  Supabase dependency recovered with the project services.

## Release

- Application commit: `f1a2175061e3653ef95547025059abbc77a51490`.
- Production deployment: `dpl_BRdxFKBVf7BT16bhajqcfrXtXuBx`.
- Deployment Ready and aliased to `book.zingara.co.za` at 12:42:10 UTC
  (14:42:10 SAST).
- Migration: none.
- Business-data delta: zero.
- Rollback: revert `f1a21750` and redeploy. No database rollback is required.

## Remaining Risk

Vercel's alert record can remain labelled `active` until its rolling anomaly
window closes. Current live error and latency metrics are healthy. A recurrence
would be an external Supabase service incident; the deployed Admin safeguard
now fails clearly and within 12 seconds rather than hanging indefinitely.
