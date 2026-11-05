# Pre-Show Attendance Confirmations

STATUS: COMPLETE - PRODUCTION VERIFIED

DATE: 5 NOVEMBER 2026

## Existing Workflow Evidence

- `pre_show_reminder` was active before this change, with activation timestamp
  26 October 2026 12:12:02 SAST and a one-day timing offset.
- Reminders are due exactly 24 hours before venue Show Starts and are dispatched
  by the existing 15-minute scheduler within its bounded delivery window.
- Eligibility remains confirmed bookings with `deposit_paid`, `fully_paid` or
  `comp_vip` evidence, a valid customer email and no operational exclusion.
- Production evidence for the preceding 30 days: 734 records, 714 sent, 14
  failed and six historical `sending` records. The application stores the
  attempted email body but not the Microsoft 365 provider failure reason, so
  the precise causes of those failures cannot be reconstructed from retained
  Communications evidence.

## Implementation

- Encrypted random tokens are stored only as a hash plus an AES-GCM envelope;
  links expire six hours after the performance start.
- The email buttons open a compact confirmation page. This extra explicit
  confirmation protects attendance integrity from automated email-link
  scanners.
- The atomic database function accepts only Confirmed or Declined, locks the
  booking row, increments a response version only when the answer changes and
  writes a booking audit event.
- Declines use that response version as the Box Office notification identity,
  allowing delivery retry without duplicate staff notifications.
- Attendance is presentation metadata only. It is not arrival/check-in state,
  cancellation, no-show evidence, table release, refund authority or ticket
  state.

## Verification

- Focused attendance tests: 4 passed.
- TypeScript and changed-file ESLint: passed.
- Next.js 16 Webpack Production build: passed.
- Linked migration dry run and application: passed.
- Rollback-only Production transaction proved Confirmed and Declined updates,
  response versioning and preservation of booking status, payment status,
  table, guest count, total and amount paid. Rollback left no QA link.
- Live page: HTTP 200; invalid-link API: HTTP 404 with the safe unavailable
  response. Browser verification confirmed the branded unavailable state.
- No reminder, customer response, Box Office alert or customer communication
  was fabricated during Production QA.

## Release

- Application commit: `510a003f0533c9bf0161ce0682e9b6a61cc2b9b6`.
- Migration: `20261105193000_pre_show_attendance_confirmations.sql`.
- Vercel deployment: `dpl_Gvd6aAxqbKwfwjdmbuSGkTTrjQd9`.
- Production Ready and aliased at 20:56:46 SAST.
- Business-data delta: zero.

## Outstanding Evidence Gap

- The 14 failed and six historical `sending` reminder records should be
  monitored separately. Their retained records do not include a provider error
  or accepted-message identifier, so no cause is asserted here and no resend
  was attempted.
