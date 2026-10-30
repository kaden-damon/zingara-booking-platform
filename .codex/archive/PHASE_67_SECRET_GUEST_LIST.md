# Phase 67 - The Secret Guest List

STATUS: COMPLETE - PRODUCTION LIVE

DATE: 30 OCTOBER 2026

## Customer Acknowledgement Follow-up

STATUS: IMPLEMENTATION IN PROGRESS

- Automatic delivery must remain disabled until Kaden approves one isolated
  Production-template email sent to his authoritative staff address.
- The follow-up reuses the existing Waitlist acceptance, branded customer email,
  Microsoft 365 and Communications infrastructure.

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
