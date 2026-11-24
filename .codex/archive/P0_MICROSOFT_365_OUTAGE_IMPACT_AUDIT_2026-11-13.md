# P0 Microsoft 365 Outage Impact Audit

STATUS: READ-ONLY AUDIT COMPLETE - PROVIDER INCIDENT ACTIVE; RECOVERY RECONCILIATION REQUIRED

DATE: 13 NOVEMBER 2026

AUDIT SNAPSHOT: 13:09 SAST

## Baseline

- The worktree was clean and `HEAD` matched `origin/main` at
  `e28cdb91ad848cb316108d4630e4060ecab80a6a` before this record was added.
- Production deployment `dpl_Bh2Vow72kUBWXhrjAmmPxgpm5XLs` was `Ready`,
  created 12 November 2026 at 09:18:48 SAST, and served
  `book.zingara.co.za`.
- Public home, booking and Admin shells returned HTTP 200 in 0.40-0.58s. A
  non-mutating GET to the PayFast ITN route returned the expected HTTP 405.
- Microsoft publicly reported Microsoft 365 service degradation. The public
  page did not expose a tenant incident identifier or Exchange-specific detail:
  https://sdf.status.cloud.microsoft/

## Confirmed Provider Failure

- Zingara customer and staff email uses authenticated Microsoft 365 SMTP at
  `smtp.office365.com:587`. It does not use Microsoft Graph for sending.
- The first confirmed Zingara provider failure was 12 November 2026 at
  19:52:30 SAST. Failures were still occurring at 13:05:17 SAST on
  13 November.
- Bounded Vercel logs contained 132 Microsoft 365 SMTP failure events. The
  provider errors were `read ECONNRESET`, `Greeting never received`, TCP 587
  connection timeouts, and Outlook SMTP `451 4.7.0 Temporary server error`.
- The same deployed code and credentials produced intermittent successful
  sends during this period. This supports an external Microsoft degradation,
  not missing Zingara credentials or a new application defect.
- Application logs currently include recipient addresses in SMTP failure
  context. No addresses are reproduced in this record.

## Delivery Impact

The durable Communications ledger contained 104 failed email records in the
outage window. Two custom-message failures were followed by a confirmed sent
record. At the snapshot, 102 failed records remained unresolved across 61
distinct bookings:

| Workflow | Failed | Recovered | Unresolved |
| --- | ---: | ---: | ---: |
| Booking/ticket confirmation | 34 | 0 | 34 |
| Payment confirmation/receipt | 30 | 0 | 30 |
| Complimentary confirmation | 2 | 0 | 2 |
| Custom operational email | 38 | 2 | 36 |

The custom operational failures comprised:

- Eight payment-link email attempts across five bookings.
- Twelve manual ticket-delivery attempts across four bookings.
- Seventeen attendance-confirmation staff notifications, plus one imported
  attendance notification.

Other delivery evidence:

- Attendance notifications: 17 failed and four sent. Attendance responses are
  committed before the asynchronous staff email, so the guest response remains
  recorded even when the email fails.
- Daily booking review: three failed staff deliveries with `read ECONNRESET`;
  other deliveries completed.
- Review-management daily summary: one failed delivery with `read ECONNRESET`.
- Daily Waitlist reminder: the 13 November delivery claim remains `processing`.
  It was not confirmed sent and must not be treated as delivered.
- No new pre-show reminder, post-show review, quote/invoice email, dietary
  notification, Waitlist acknowledgement, Secret Guest List notification,
  platform-feedback email or Dineplan digest was attempted in the incident
  window. Their Microsoft dependency remains a risk, not a confirmed failure.
- Secret Guest List public submissions remain disabled; the standard Waitlist
  and its acknowledgement workflow remain enabled.
- No password-reset or staff-invitation event was present in the Supabase Auth
  audit window. Those paths delegate email delivery to Supabase Auth; the
  tenant SMTP provider configuration is not evidenced in the repository, so
  their outage impact is unverified.

## Core Platform Health

- Bookings and payments remain functional. Since the first provider failure,
  Production recorded 39 confirmed bookings, seven pending-payment bookings,
  28 fully paid payments and eight deposit-paid payments.
- All 38 PayFast ITN receipts in the window were `processed`; none were failed,
  rejected or awaiting retry. Email failure did not roll back payment
  reconciliation.
- Seven active payment links, two used links and one revoked link were recorded
  in the window. Email delivery is affected; link creation and checkout remain
  available.
- The main scheduled workflow endpoint executed 45 times from 02:00 to 13:00
  SAST on 13 November and returned HTTP 200 on every run. The separate review
  scheduler also continued recording completed runs.
- Supabase booking/auth connectivity, PayFast callback processing, digital
  tickets, Apple Wallet pass generation, and Xero processing are technically
  independent of Microsoft SMTP. No evidence linked their core operations to
  this incident. Xero had no new email-delivery activity in the audit window.
- No booking, payment, ticket, attendance, seating, invoice or financial data
  was modified by this audit.

## Queues, Retries And Duplicate Risk

- Failed Communications rows are durable audit evidence but are not a general
  outbound queue. They will not all replay automatically when Microsoft
  recovers.
- Pre-show and review schedulers can retry failed claims while the item remains
  eligible. Pre-show reminders have a 20-minute delivery window and run every
  15 minutes. Sent claims and unique indexes prevent a later scheduler replay.
- Event-driven booking, payment, ticket, payment-link, attendance and dietary
  messages generally require an explicit safe resend or a repeated event; they
  are not a guaranteed recovery queue.
- SMTP timeouts and resets normally occurred before provider acceptance, but an
  ambiguous disconnect can never prove that no downstream copy exists. A bulk
  replay could therefore duplicate customer messages.
- On provider recovery, reconcile failed records per booking and send only the
  latest still-valid communication. Do not replay historical messages blindly.
- Payment links must be checked for current amount, active status and expiry
  before sharing. Tickets must be checked for current validity. Already-sent
  and recovered records must be excluded.

## Immediate Operating Alternatives

1. Booking confirmations and receipts: Box Office should verify the durable
   booking/payment in Admin, then provide the booking reference and Find My
   Booking route by phone or an already-approved non-email channel.
2. Payment links: use the existing create-without-send or copy-link control,
   confirm the current balance, and share the secure link manually. Do not
   generate repeated replacement links simply because email failed.
3. Tickets: use Find My Booking, the digital ticket route, Apple Wallet, or the
   existing Admin ticket download/copy controls. QR validation remains live.
4. Critical staff alerts: use Admin dashboards plus phone or an approved
   non-Microsoft channel. Do not rely on Teams while Microsoft 365 is degraded.
5. Corporate documents and Function Briefs: generate and verify them in Admin,
   then use an approved manual delivery route only when operationally urgent.

## If The Outage Continues

- At 18:00 SAST on 13 November, 78 Cape Town bookings representing 408 guests
  become eligible for the 24-hour pre-show reminder. Box Office should prepare
  a manual contact list before that window if Microsoft remains degraded.
- Monitor Microsoft service health and Zingara's failure ledger. Do not test by
  sending real customer or staff email.
- After Microsoft reports recovery, require consecutive successful provider
  handoffs before controlled reconciliation begins.
- Reconcile the 61 affected bookings and the failed/stuck staff
  deliveries. Prioritise current tickets, payment links, payment confirmations
  and imminent performances.
- A second provider or credential/routing change requires separate approval and
  was not introduced.

## Evidence Gaps

- Zingara records provider handoff success or failure, not final inbox receipt.
  A `sent` record means the provider accepted the submission; downstream delay
  or delivery cannot be independently confirmed from the application ledger.
- The public Microsoft status page confirms broad service degradation but does
  not expose the Zingara tenant's detailed Exchange incident ID.
- No real email was sent and no provider recovery was tested during this audit.

## Change Record

- Application, configuration and Production data delta: none.
- No migration, commit, push or deployment was performed.
- Only `.codex` incident records were updated locally as authorised.
