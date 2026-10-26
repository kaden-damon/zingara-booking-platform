# P0 - Emergency Admin Login Reload Loop

STATUS: COMPLETE - PRODUCTION VERIFIED

DATE: 26 OCTOBER 2026

## Root Cause

The shared Admin header requested protected venue settings before login. Commit
`bdf34d07` had also made every Admin API `401` trigger local sign-out and a hard
navigation to `/admin`. The expected pre-login venue-settings `401` therefore
caused a reload, remounted the header and repeated indefinitely. Production
logs recorded the endpoint returning `401` approximately every 0.6-0.8 seconds.

## Correction

- Unauthenticated venue settings now use the existing public endpoint.
- Authenticated Admin continues to use the protected endpoint.
- Hard session recovery now runs only for the explicit server code
  `STAFF_SESSION_REFRESH_REQUIRED`, preserving normal unauthenticated `401`
  handling and Supabase token refresh.
- No UI, permissions, staff credentials or business rules changed.

## Verification

- Clean Production `/admin`: stable login, no protected venue-settings request,
  no repeated reload and no post-release `401` storm.
- Authenticated Production Admin: session recovery and navigation operational.
- Corporate Bookings: exact-reference search, rapid typing, request cancellation
  and clear-search paths worked without a crash or reload.
- Vanessa Robinson remains active with her existing Super Admin/all-venue access.
- Focused tests: 16 passed. TypeScript, changed-file ESLint, diff check and
  Production webpack build passed.
- Production deployment: `dpl_AXcby5cBjeWnxgP8k555hQ1hTPq2`.
- Production commit: `50d374f9d0cd0f7d5fe2ca26fbc35a51b30b3099`.
- Rollback: `f343ded90823e0c10ba8c3914542fb322fe8659d`.
- Production business-data delta: none.

Current Chrome/Edge compatibility follows standard browser APIs and clean
Chromium verification. Vanessa's physical Windows computer was not available
for direct native-device confirmation.
