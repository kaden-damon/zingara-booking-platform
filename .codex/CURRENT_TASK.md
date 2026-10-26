# P0 - Two-Seater Box Office Override

STATUS: COMPLETE - PRODUCTION VERIFIED

DATE: 26 OCTOBER 2026

## Result

- Public bookings remain strictly limited to twenty active two-person bookings
  per performance and retain bounded alternative-date suggestions.
- Authorised Box Office, Box Office Manager, Box Office Staff and Super Admin
  roles can retry a blocked internal creation, qualifying amendment or show
  transfer with a mandatory reason.
- Venue Manager and all other roles remain unable to override the quota.
- Every exception is exact-booking/exact-performance scoped, expires after ten
  minutes and is consumed under the existing performance advisory lock.
- Successful use writes immutable audit evidence containing staff identity,
  timestamp, performance, booking reference and reason.
- Venue, zone and table capacity checks execute independently and remain
  authoritative. Payment, ticket, temporary-table and concurrency rules are
  unchanged.

## Verification

- Focused quota and override tests: 9 passed.
- Related booking/reconciliation suites: 51 passed; two unrelated historical
  source-copy assertions remain pre-existing failures.
- TypeScript and `git diff --check`: passed.
- Changed server/helper ESLint: zero errors; the two large existing client
  pages retain their pre-existing hook-rule findings on unchanged lines.
- Next.js webpack Production build: passed.
- Supabase dry run identified exactly one migration; migration applied.
- Production read-only verification confirms the private override table,
  active quota trigger and audit hook, with zero override rows created by QA.
- Vercel deployment completed successfully. Live `/book`, clean `/admin` and
  the existing authenticated Admin session render normally.

Production commits:

- `ca0932069c3f9ef8d0852beb68329b14e75d32a6`
- `e53974756a0dbd6c470e26dc61a9c118dddc0358`

Vercel deployment: `nkTcwucEKT4cULZVob2ihZojQJqy`

Rollback code point: `0505832e3d4879811bafebb2db5883b7a7d84bae`.

Database rollback requires restoring the previous
`enforce_two_seater_booking_limit()` function before dropping the private
override authorisation table. No automatic rollback was executed.

Production business-data delta: none. One private control table and one
trigger-function revision were deployed; no booking, customer, payment,
ticket, capacity or financial rows were changed.
