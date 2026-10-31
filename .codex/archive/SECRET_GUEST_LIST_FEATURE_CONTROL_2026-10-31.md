# Secret Guest List ON/OFF Control

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION - FEATURE OFF

DATE: 31 OCTOBER 2026

## Toggle Clarity Follow-up

- Authoritative Production state remains OFF.
- Replace the low-contrast inherited-colour thumb with explicit green ON and grey
  OFF tracks, a white positional thumb and a matching state label.
- Fetch the saved value without caching on every page/session load.
- After a failed update, show the failure and restore the authoritative server
  state instead of leaving an uncertain local value.
- Focused tests, TypeScript, targeted lint and the Next.js Production build pass.
- Application commit `9769445c60a561329b4dd504fcd55d30c25d376e`
  deployed successfully as Vercel deployment `ArPzLjeZgoPnp9FxsfMNih4LAfko` at
  12:10:43 SAST.
- Kaden's fresh authenticated Production Admin page reported the switch as
  `The Secret Guest List is OFF`. Desktop and 390 x 841 responsive inspection
  confirmed a clear grey OFF track, left-positioned white thumb and explicit
  OFF label without overlap.
- The live public settings response remains false, direct Secret Guest List
  submission returns HTTP 409, and the saved database state remains OFF.

## Root Cause

The Secret Guest List had independent acknowledgement and staff-notification
configuration, but no operational feature switch. Public prompts were always
rendered when their availability conditions matched, and the shared Waitlist API
accepted Secret Guest List payloads without checking a feature state.

## Correction

- Added one existing-infrastructure workflow configuration with an OFF default.
- Added a compact management-only toggle under Admin Settings > Venue.
- Added server-side permission enforcement and immutable audit logging for state
  changes.
- Reused the public venue-settings response so the booking journey incurs no new
  request.
- Hid every Secret Guest List invitation and panel while OFF.
- Added API and database enforcement against direct submissions while OFF.
- Preserved the standard Waitlist and all existing communications configuration.

## Safety And Verification

- No booking, payment, ticketing, seating, capacity or customer workflow changed.
- The migration does not update or delete Waitlist records.
- Focused tests: 9/9 passed.
- TypeScript, targeted lint, diff validation and the full webpack Production build
  passed.
- Production migration `20261031120000_secret_guest_list_feature_control.sql`
  applied successfully at 11:46:23 SAST.
- The feature is OFF in Production. Secret Guest List and standard Waitlist
  customer acknowledgements remain independently enabled.
- All 404 Waitlist entries and the 39 existing Secret Guest List enquiries remain
  present.

## Release Evidence

- Application commit: `f5226995b33489fdf97ff374f7490bde7e9c762c`.
- Vercel deployment: `4TFJEGnf1LysAzRd7G633vwtU9nH`, completed at
  11:49:23 SAST on 31 October 2026.
- Kaden's authenticated Production interface shows the management control under
  Settings > Venue > Public Booking with value OFF.
- The live public booking calendar contains no Secret Guest List label or
  `See If There's Room` action.
- The Production public settings endpoint reports the feature disabled and the
  direct submission endpoint returns HTTP 409 while OFF.
- The management endpoint requires authenticated staff access and returned HTTP
  401 without a session.
- Rollback-only Production verification proved standard Waitlist acceptance,
  Secret Guest List rejection while OFF and restoration while ON. No fixture was
  retained.
- Public booking and ticket routes are healthy. Business-data delta is one OFF
  workflow configuration row only; historical enquiries and all unrelated data
  are unchanged.
- Follow-up verification reran the rollback-only state check: the standard
  Waitlist remained accepted, OFF rejected Secret Guest List submissions, and
  ON restored the feature inside the rolled-back transaction. Final Production
  state remained OFF with 404 Waitlist records and 39 Secret Guest List entries
  unchanged.
