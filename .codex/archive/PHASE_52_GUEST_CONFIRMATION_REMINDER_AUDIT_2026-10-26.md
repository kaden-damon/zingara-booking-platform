# Phase 52 - Guest Confirmation & Reminder Audit

STATUS: COMPLETE

DATE: 26 OCTOBER 2026

## Scope

Read-only audit of Production guest booking confirmations and automated
Pre-Show Reminders. The only authorised communication was one unchanged current
reminder preview to `kaden@kaden.co.za`.

## Preview Delivery

- Recipient: `kaden@kaden.co.za` only.
- Subject: `[PREVIEW] Your Zingara experience is almost here ✨`.
- Template: current saved Pre-Show Reminder rendered through the existing
  Zingara HTML and Microsoft 365 delivery infrastructure.
- Sample: Cape Town, 4 November 2026, 18:00 saved show time, four guests,
  Golden Circle, reference `ZNG-PREVIEW`.
- Evidence: provider acceptance and mailbox receipt were both verified.
- No customer, booking, payment, ticket or Production communication record was
  created or modified.

## Confirmation Workflow

The immediate booking/ticket confirmation is operational and uses authoritative
venue settings. It contains:

- Venue/city and performance date.
- Guest count and seating section.
- Grounds Open, Guest Seating and Show Starts.
- Booking/ticket reference, ticket link and QR identity.

Current authoritative customer experience times for both Cape Town and
Johannesburg are:

- Grounds Open: 17:00.
- Guest Seating: 18:30.
- Show Starts: 19:30.

Production delivery evidence:

| Type | Sent total | Sent last 30 days | Sent last 7 days | Failed last 30 days | Failed last 7 days |
| --- | ---: | ---: | ---: | ---: | ---: |
| Reservation confirmation | 2,957 | 1,792 | 470 | 11 | 7 |
| Payment confirmation | 3,046 | 1,876 | 506 | 5 | 3 |

There are also 12 claims still in `sending` for more than one hour: eight
payment confirmations and four reservation confirmations.

## Reminder Workflow

- Production configuration is enabled with a seven-day offset.
- Saved subject: `Your Zingara experience is almost here ✨`.
- Saved content includes customer, show, date, saved show time, booking
  reference, location, guest count, seating zone and ticket URL.
- Saved content omits Grounds Open, Guest Seating and authoritative Show Starts.
- The displayed `showTime` comes from the show record rather than the
  authoritative customer-experience Show Starts setting.
- Vercel schedules `/api/workflows/run` every 15 minutes, but the route defaults
  to dry-run unless `mode=send` is explicit. The cron path has no send mode.
- Production contains zero `show_reminder` communication records. Automated
  reminder delivery is therefore not active.
- Timing uses a floored 24-hour difference. A one-day offset would be eligible
  from 24 hours through just under 48 hours before showtime, not at exactly 24
  hours. Seven days means 168 through just under 192 hours.

## Delivery Integrity

- Immediate confirmation delivery uses an atomic database claim before send.
- The reminder checks for prior successful communication but does not acquire
  an equivalent atomic pre-send claim. Concurrent runs could race if reminder
  sending is later activated.
- Production contains 78 booking-level duplicate sent payment-confirmation
  groups, representing 86 extra sent records. This is historical evidence that
  must be reconciled rather than treated as unique guest deliveries.
- `WORKFLOW_ALLOWED_RECIPIENT` is not configured in Production. This does not
  cause the present dry-run state, but it means there is no recipient allow-list
  if send mode is introduced.

## Corrections Required After Review

1. Use an exact SAST timestamp window for 24-hour reminder eligibility.
2. Include the authoritative venue experience schedule in the existing branded
   reminder.
3. Configure the authorised scheduler to invoke the reminder in send mode.
4. Add atomic reminder claims and reconcile stale/duplicate delivery evidence.

No application code, Production configuration or business data was changed.
No commit or deployment was made.
