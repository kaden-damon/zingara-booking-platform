# Secret Guest List ON/OFF Control

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 31 OCTOBER 2026

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
