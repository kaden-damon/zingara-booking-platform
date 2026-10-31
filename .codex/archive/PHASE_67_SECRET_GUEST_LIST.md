# Phase 67 - The Secret Guest List

STATUS: COMPLETE - PRODUCTION LIVE

DATE: 30 OCTOBER 2026

## Customer Acknowledgement Follow-up

STATUS: COMPLETE - PRODUCTION ACTIVE

### Production Activation

- Kaden Damon explicitly approved immediate Production activation on
  31 October 2026.
- The existing `secret_guest_list_customer_acknowledgement` workflow was enabled
  at `2026-10-31 07:20:00.250368 SAST`.
- The configuration records Kaden's authoritative auth user ID as `updated_by`.
- Immutable audit event `3c578834-3421-4699-81e2-9cba9dc3da53` records Kaden's
  active Super Admin/platform-owner identity, the explicit approval reason and
  the `enabled` / `activatedAt` change.
- Post-activation verification confirmed the workflow is enabled with the
  approved branded subject unchanged.
- The existing staff route remains enabled with five TO and three CC recipients;
  no staff email preferences or routing records changed.
- The one-time Communications uniqueness index remains present. Customer
  acknowledgement Communications stayed at one pre-activation preview record,
  confirming that activation did not replay historical enquiries or send email.
- The deployed public Waitlist path invokes the acknowledgement only after a
  newly accepted enquiry and runs it asynchronously alongside the unchanged
  Box Office notification.
- No code, migration, commit, deployment, enquiry, booking, customer email or
  business-data change was required beyond the single workflow configuration
  activation and its append-only audit event.

### Approval-Gate Evidence

- Before activation, automatic delivery remained disabled until Kaden approved
  one isolated Production-template email sent to his authoritative staff address.
- The follow-up reuses the existing Waitlist acceptance, branded customer email,
  Microsoft 365 and Communications infrastructure.
- Commit `d542509cc32c032d263d44f06fc7dc9c834a5be0` deployed through Vercel
  deployment `dpl_CtsGJsXW2qzVYGQ7uJescC3SU7JB`.
- Migration `20261030223000_phase_67_customer_acknowledgement.sql` is applied.
  The workflow remains `enabled = false` with no activation timestamp.
- 37 focused tests, TypeScript, changed-file ESLint, diff validation, migration
  validation and the webpack Production build passed.
- The Production-template email passed a 390 x 844 rendered check without
  horizontal overflow.
- Microsoft 365 accepted one isolated preview to `kaden@kaden.co.za` with the
  exact subject `🎪 You're on Zingara's Secret Guest List!`.
- Communications record `5ad56ae4-050d-4430-9e96-ddde2cccc252` records the
  preview as sent at 19:28:37 SAST. No Waitlist enquiry or staff notification
  was created by the preview.
- Activation requires Kaden's explicit approval, followed only by enabling the
  existing workflow row and recording its activation timestamp.

## Waitlist Communications & Data Integrity Follow-up

STATUS: COMPLETE - PRODUCTION RELEASED AND VERIFIED

- A strict Production audit found 131 confirmed rapid-retry duplicate rows in
  93 customer/performance groups. All were legacy standard Waitlist submissions;
  the Secret Guest List atomic path had no confirmed duplicates.
- Historical rows and audit evidence remain preserved without deletion or
  merging. Production still contains 390 Waitlist rows after release.
- Both sources now share one atomic, contact-and-performance duplicate guard.
- New standard Waitlist enquiries reuse the Phase 67 staff notification route
  and branded email infrastructure.
- Standard Waitlist customers receive an asynchronous, idempotent acknowledgement
  only after a newly accepted enquiry. The subject is
  `You're on Zingara's Waitlist!`; zero historical entries were replayed.
- The existing live Secret Guest List acknowledgement remains enabled and
  unchanged.
- A bounded daily reminder runs during the 08:00 SAST hour and includes future
  active/contacted enquiries from both sources only.
- Two independent existing-style preferences are live: `New Waitlist Enquiry`
  and `Daily Waitlist Reminder`.
- Nicci Richardson's 12 October 2026 09:04 SAST timestamp is the correct display
  of the authoritative creation time and was verified in authenticated
  Production.
- Commit `a11e8c71bb9921abb205ab9ac92db6932f505386` was pushed to
  `origin/main` and deployed through Vercel deployment
  `CLxjUtfWUzu7KfaMe1NWsCsq9nLH` at 07:35:55 SAST on 31 October 2026.
- Migration `20261031060000_waitlist_communications_integrity.sql` applied
  successfully.
- Rollback-only Production verification passed atomic first-create,
  cross-source duplicate suppression and separate-performance creation, then
  left zero test records.
- Two notification routes each retain five authoritative TO and three CC staff;
  two idempotency indexes and both customer acknowledgement workflows are active.
- Release verification created no customer, Waitlist, booking, communication,
  seating, payment, ticket or financial record.

## Baseline and Diagnosis

- Starting commit: `83cbae6f2428d02c6fd787d27a5ed7943afa4f7c`.
- The existing public Waitlist endpoint, `waitlist_entries` records and Admin
  Waitlist conversion workflow were retained.
- The previous invitation appeared only when an otherwise bookable performance
  had no compatible seating zone. A manually SOLD OUT performance could not be
  selected to reach it.
- The previous public form was a large inline section with preferred seating
  and notes fields. It had rate limits but no atomic duplicate claim and sent no
  staff email.
- Historical active duplicate waitlist rows exist. They were preserved rather
  than blocked by a destructive new uniqueness constraint.

## Implementation

- Added the approved `The Secret Guest List` invitation to SOLD OUT performance
  cards and insufficient-party-availability states.
- SOLD OUT dates can now be selected to view the invitation, but their show
  action remains disabled and cannot enter booking or checkout.
- Added a mobile-first slide-in/dialog with only performance, venue, guests,
  first name, surname, mobile and email.
- Public payloads are server-owned, bounded and rate-limited. The database
  function uses contact-and-performance advisory locks to return an existing
  active/contacted waitlist request instead of creating a duplicate.
- The existing Waitlist status and Admin conversion model remain unchanged.
- Added `The Secret Guest List` to each staff member's personal Staff Emails
  preferences. Missing preference rows default to enabled, matching the
  established subscription behavior.
- Seeded the verified routing using authoritative staff profile IDs:
  - TO: Sharon Ricketts, Rasmus Bjerregaard, Fatima MB, Michael Davis and Lisa
    Rodderick.
  - CC: Kaden Damon, Tracy Maltman and Nicky-Anne De Beer.
- Staff notifications use the existing Zingara HTML shell and Microsoft 365
  sender, retain TO/CC placement after individual opt-outs, link directly to the
  Admin Waitlist entry, use durable delivery claims, and write delivery evidence
  to Communications.
- Email work runs after the public response so it cannot delay the enquiry.

## Verification Before Release

- 20 focused Waitlist, security, notification-preference and Communications
  tests passed.
- TypeScript passed.
- Targeted changed-file ESLint passed; the large pre-existing booking page was
  additionally compiled by the Production build.
- `git diff --check` passed.
- Next.js 16.3.4 webpack Production build passed, including TypeScript and all
  27 static pages.
- Local rendered verification passed at 390 x 844 and 1440 x 900.
- A real future SOLD OUT performance remained non-bookable while displaying the
  invitation and opening the complete panel.
- Mobile safe-area containment, field reachability, dismiss behavior and desktop
  alignment passed. Browser console showed no errors or warnings.
- Normal booking screens and checkout logic were not changed.

## Migration

- `20261030210000_phase_67_secret_guest_list.sql` applied successfully to the
  linked Production project.
- Production rollback-only verification created one synthetic row on the first
  call and returned the same row with `was_created=false` on retry.
- The transaction was rolled back and left zero synthetic customer or Waitlist
  rows.
- No historical Waitlist record was modified or deleted.

## Release Evidence

- Commit `7e5f1e908eaf120deb97213b5388e122cd83bed8` was pushed to
  `origin/main`.
- Vercel Production served fresh immutable assets for the release. Verified
  response identifier:
  `cpt1::iad1::8lzfd-1793378707263-3e83b23836e9`.
- Live Johannesburg verification on 4 November 2026 confirmed that a SOLD OUT
  date can be selected for enquiry while its show action remains non-bookable.
  The invitation and complete Secret Guest List panel rendered correctly.
- The live panel passed at 390 x 844 with no horizontal overflow and with every
  required field and the CTA visible and reachable.
- An available Johannesburg performance on 5 November 2026 still progressed to
  the ordinary guest-count step.
- Direct unauthenticated Waitlist retrieval returned HTTP 401. The enabled
  Production notification route contains the exact approved five TO and three
  CC staff profile IDs. Individual preferences remain opt-out and default to
  enabled when no subscription row exists, as established by the existing
  Staff Emails model.
- No enquiry was submitted and no email was sent in live QA. Notification
  delivery, preferences, Communications logging and duplicate suppression were
  verified with focused tests and rollback-only database execution.
- Release QA created no customer, Waitlist, booking, payment or communication
  records. Existing business data and historical Waitlist entries were
  unchanged.

## Rollback

- Application rollback point: `83cbae6f2428d02c6fd787d27a5ed7943afa4f7c`.
- The migration is additive. If application rollback is required, the added
  function and notification route can remain dormant without changing existing
  Waitlist behavior or records.
