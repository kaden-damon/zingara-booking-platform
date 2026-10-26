# Phase 52.1 - 24-Hour Pre-Show Reminders

STATUS: COMPLETE - RELEASE VERIFIED

DATE: 26 OCTOBER 2026

## Objective

Correct and activate the existing branded Pre-Show Reminder exactly 24 hours
before eligible performances, using authoritative venue experience times and
durable one-time delivery controls.

## Authorised Scope

- Preserve the existing Zingara HTML email design.
- Include performance date, city/venue, guest count, seating area, Grounds
  Open, Guest Seating, Show Starts, booking reference and secure ticket link.
- Read all experience times from authoritative venue settings.
- Enable Production delivery for confirmed paid bookings only.
- Use a narrow SAST 24-hour eligibility window with no historical backfill.
- Claim each reminder atomically before provider delivery.
- Send exactly one updated preview to `kaden@kaden.co.za` only.
- Clearly mark the email as PREVIEW.
- Do not send to customers or any additional staff recipient during QA.

## Required Verification

- Exact 24-hour boundary and no-overdue behaviour.
- Authoritative CPT/JHB schedule rendering.
- Confirmed and paid eligibility; cancelled, unpaid and synthetic exclusions.
- Atomic claim under concurrent workers and retry after provider failure.
- Microsoft 365 acceptance and receipt of exactly one updated preview.
- Focused tests, TypeScript, changed-file ESLint, migration checks, diff check
  and Production build.
- Production configuration, scheduler and deployment verification.

## Safety

- Strict UX/UI freeze.
- No QA communications other than the approved preview.
- No booking, customer, payment, ticket or unrelated Production configuration
  changes.
- Preserve communication history and all unrelated workflows.
- Stop before release if eligibility, atomic delivery or duplicate safety fails.

## Verified Findings

- One preview of the unchanged current Pre-Show Reminder was sent only to
  `kaden@kaden.co.za`. Microsoft 365 accepted it and it was observed in the
  recipient mailbox. No customer communication record or business record was
  created.
- Immediate booking confirmations are operational. Recent Production evidence
  includes 1,792 sent reservation confirmations and 1,876 sent payment
  confirmations in the last 30 days.
- The immediate ticket/confirmation email includes the venue/city, performance
  date, guest count, seating section, Grounds Open, Guest Seating and Show
  Starts values from authoritative venue settings.
- Cape Town and Johannesburg currently both use Grounds Open 17:00, Guest
  Seating 18:30 and Show Starts 19:30.
- The Pre-Show Reminder configuration is enabled but is set to seven days, not
  one day. Its saved template includes date, location, guest count and seating,
  but omits Grounds Open, Guest Seating and authoritative Show Starts.
- The configured cron invokes `/api/workflows/run` every 15 minutes without
  `mode=send`. The route defaults to dry-run. Production contains zero
  `show_reminder` communication records, so automated guest reminder delivery
  is not active.
- The day-window calculation floors the millisecond difference. A one-day
  setting would mean 24 to just under 48 hours before the performance, not
  exactly 24 hours. The current seven-day setting means 168 to just under 192
  hours before the performance.
- Confirmation delivery has an atomic pre-send database claim. The reminder
  path checks prior communications but does not use the same atomic claim,
  leaving a concurrency gap if live sending is enabled later.
- Production history contains 78 booking-level duplicate sent
  `payment_confirmation` groups (86 extra sent records) and 12 email claims
  still in `sending` for more than one hour (8 payment confirmations and 4
  reservation confirmations). These require reconciliation before relying on
  delivery totals as unique guest deliveries.

## Phase 52 Audit Baseline

1. Schedule the reminder against an exact SAST show-time window at 24 hours.
2. Add the three authoritative venue experience times to the existing template.
3. Invoke the workflow explicitly in send mode through the authorised cron.
4. Add an atomic pre-send claim for `show_reminder` and reconcile stale claims
   and historical duplicate confirmation records.

These corrections are now authorised for implementation and Production release.

## Phase 52.1 Verification

- Reminder lead time is a fixed 24 hours from authoritative venue `Show Starts`.
- The existing 15-minute scheduler sends on the first run at or after the due
  timestamp and never after the 20-minute safety window.
- The migration activation timestamp is also the no-backfill boundary: a
  reminder whose due timestamp predates activation is excluded.
- Eligibility is restricted to confirmed bookings with `deposit_paid`,
  `fully_paid` or `comp_vip` payment evidence.
- A partial unique index covers `sending`, `sent` and `suppressed` reminders,
  and every delivery claims this identity before contacting Microsoft 365.
- Production configuration is enabled at one day and contains all three
  authoritative schedule placeholders.
- One updated preview was accepted by Microsoft 365 and observed in the Kaden
  mailbox. It contained the date, venue/city, four guests, Golden Circle,
  17:00 Grounds Open, 18:30 Guest Seating, 19:30 Show Starts, reference and
  secure ticket link. No other QA communication was sent.
- Focused tests: 14 passed. TypeScript, changed-file ESLint, migration dry-run,
  `git diff --check` and the Next.js webpack Production build passed.

Rollback point: `850998ce5d87319e81989e24f41563526d4cbefd`.

Production business-data delta: none. The only Production database changes are
the authorised workflow configuration activation and duplicate-protection index;
historical communications remain unchanged.
