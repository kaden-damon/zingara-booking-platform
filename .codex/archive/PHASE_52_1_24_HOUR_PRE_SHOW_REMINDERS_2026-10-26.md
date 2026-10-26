# Phase 52.1 - 24-Hour Pre-Show Reminders

STATUS: COMPLETE - RELEASE VERIFIED

DATE: 26 OCTOBER 2026

## Delivered

- Existing Pre-Show Reminder activated for live Production delivery.
- Reminder due timestamp is exactly 24 hours before the authoritative venue
  `Show Starts` value in Africa/Johannesburg time.
- Existing 15-minute scheduler dispatches on the first run at or after that
  timestamp, within a strict 20-minute window.
- Due timestamps before the Phase 52.1 activation boundary are never backfilled.
- Eligible bookings must be confirmed and have `deposit_paid`, `fully_paid` or
  `comp_vip` payment evidence.
- Reminder content now includes performance date, city/venue, guests, seating,
  Grounds Open, Guest Seating, Show Starts, booking reference and secure ticket
  link while preserving the existing Zingara HTML design and disclosures.
- Times are loaded from authoritative venue settings; they are not hardcoded in
  the renderer or saved template.
- Every delivery acquires an atomic one-time database claim before contacting
  Microsoft 365. Sending, sent and suppressed claims prevent concurrent or
  retried workers from duplicating a reminder; failed claims remain retryable
  only within the active delivery window.

## Preview Verification

One updated preview was sent to `kaden@kaden.co.za` only. Microsoft 365 provider
acceptance and mailbox receipt were verified. The message displayed:

- Cape Town — The Night Court.
- Performance date 4 November 2026.
- Four guests in Golden Circle.
- Grounds Open 17:00.
- Guest Seating 18:30.
- Show Starts 19:30.
- `ZNG-PREVIEW` and its secure ticket link.

No customer or additional staff email was sent during QA.

## Verification

- Focused workflow and scheduler tests: 14 passed.
- TypeScript: passed.
- Changed-file ESLint: passed.
- `git diff --check`: passed.
- Linked migration dry-run and application: passed.
- Next.js webpack Production build: passed.
- Atomic Production index and activated configuration: verified read-only after
  migration.

## Release Safety

- Rollback application commit: `850998ce5d87319e81989e24f41563526d4cbefd`.
- To pause delivery without changing history, restore the previous cron path or
  disable `pre_show_reminder`; the new unique index may remain safely in place.
- No booking, customer, payment, ticket, capacity or financial data changed.
- Existing communication history was not rewritten or backfilled.
