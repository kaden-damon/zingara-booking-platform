# Secret Guest List ON/OFF Control

STATUS: RELEASE IN PROGRESS - PRODUCTION FEATURE OFF

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

Application commit, Vercel deployment identifier and authenticated Production
verification will be recorded after the application release completes.
