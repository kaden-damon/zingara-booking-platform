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

## End-To-End Email Integration Follow-Up

- Root cause: scheduled delivery already added secure attendance actions using
  the shared workflow renderer, but the Admin preview did not supply attendance
  links. The same Guest Emails page also exposed older generic show-reminder
  and post-show-review templates that are not used by the scheduler.
- The Admin preview now passes isolated preview links into the same renderer as
  scheduled delivery. Saved `workflow_configurations` remain the only source
  for the live pre-show subject/body, and Admin edits continue to flow into
  outgoing reminders without removing the attendance actions.
- The obsolete scheduled entries were removed only from the generic template
  selector. No saved template, schedule, eligibility rule or historical email
  was changed.
- The one-time test path is restricted to Super Admin, fixed to
  `kaden@kaden.co.za`, uses the live branded renderer and Microsoft 365 SMTP,
  logs to Communications and is protected by a narrow unique index.
- A synthetic attendance token returns representative booking context and
  accepts the confirmation UI flow without calling the attendance database
  function or sending decline notifications.

## Follow-Up Verification And Release

- Focused attendance checks: 6/6 passed. TypeScript, changed-server-file
  ESLint, whitespace checks and the Next.js 16 Webpack Production build passed.
- Authenticated Production preview matched the delivered email, including
  saved copy, branding, legal footer, `YES - I'LL BE THERE` and
  `NO - I CAN'T MAKE IT`.
- Exactly one email was accepted and logged with subject
  `TEST — Zingara Pre-Show Reminder` at 5 November 2026 21:25:20 SAST. Inbox
  receipt and rendering were visually confirmed in Kaden's Outlook.
- The isolated Confirmed link completed successfully. Production verification
  found one sent test Communication and zero persisted attendance links for
  the preview token; no real attendance or booking state changed.
- Two earlier attempts failed before SMTP because test claims supplied values
  to legacy `communication_batches` and `users` foreign keys. Both produced
  zero rows and zero email. The final implementation removed those invalid
  references while retaining endpoint authentication and database idempotency.
- Application commits: `642dd2f4`, `36138e4a`, `4d22837a`, `744d9e3c`.
- Migrations: `20261105214500_pre_show_email_template_integration.sql` and
  `20261105221000_pre_show_email_test_claim_fix.sql`.
- Final Production deployment: `dpl_DRTR4jiiSbNVERjrC9FAwcQbXYgv`, Ready and
  aliased at 21:23:40 SAST.
- Business-data delta: one sent QA Communications record. No booking, customer
  attendance, seating, payment, ticket or financial record changed.
- Rollback: revert the four follow-up commits and redeploy. The one-time test
  indexes may remain safely or be removed in a controlled migration; retain the
  sent QA Communication as release evidence.

## Reminder Email And UX Refinement

- The shared pre-show renderer now orders content as branding and editable
  welcome, attendance actions, booking details, venue inclusions, payment and
  gratuity guidance, age policy and the existing legal footer.
- Attendance labels are exactly `YES - ATTENDING` and `NO - NOT ATTENDING`.
  They remain linked to the existing encrypted response flow and render as
  full-width stacked pill actions for narrow email clients.
- Johannesburg reminders include a welcome drink, four-course dinner and
  2½-hour experience. Cape Town reminders include welcome drinks and canapés,
  a three-course dinner and a 2½-hour experience. Unknown venues do not receive
  invented inclusions.
- Deposit wording is selected from persisted `payment_status` or a positive
  authoritative balance. Other eligible reminders use the fully paid wording.
  Parties of six or more receive one discretionary 12.5% notice. Pricing, VAT,
  deposits, balances, gratuity calculations and the existing New Year's Eve
  full-payment rule were not changed.
- Production's saved body exactly matched the known legacy default. Guarded
  migration `20261105223000_pre_show_reminder_copy_refinement.sql` shortened
  only that unchanged body to the editable welcome, preserving future Admin
  edits and refusing to overwrite customised content.

## Refinement Verification And Release

- Six focused attendance checks, targeted ESLint, TypeScript, whitespace
  checks and two Next.js 16 Webpack Production builds passed. The direct Node
  workflow test runner remains unable to resolve the repository's `@/` aliases;
  the real Next build compiled and type-checked that renderer successfully.
- Authenticated Production preview confirmed the saved welcome and exact
  visual order, both attendance actions, Cape Town inclusions, responsive
  booking card, digital ticket, payment copy, age policy and legal footer.
  Preview and scheduled delivery continue to call the same renderer.
- No email was sent during this release. Production still contains exactly the
  one previously approved test Communication, last sent at 21:25:20 SAST.
- Commits: `368a13f6`, `1c8230e0`.
- Final deployment: `dpl_x2gRBzm6u3xbjRjWrzaQhxpHYTuw`, Ready and aliased to
  `book.zingara.co.za`.
- Business-data delta: the saved pre-show welcome body only. No booking,
  attendance, communication, seating, payment, ticket or financial record
  changed.
- Rollback: revert both commits and redeploy. Restore the prior body only if
  management explicitly wants the legacy copy; no schema rollback is needed.
