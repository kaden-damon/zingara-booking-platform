# Customer Profile Integrity And Attending Guests

Date: 24 November 2026. Existing project workflow; no new development phase.
Status: released / READY; 120 targeted tests and Webpack build pass.

## Confirmed Case

Hannah's supplied message is evidence of the report, not authority to overwrite
historical profiles. Read-only Production inspection identifies customer
`0c028967-072f-4366-b768-8c10f018cb32` and four existing Cape Town bookings:

| Booking | Current show date | Recorded booking name | Guests | Recorded paid / total |
| --- | --- | --- | ---: | ---: |
| ZNG-M95T5B | 22 Nov 2026 | Marisa Salvarto | 4 | R6,160 / R6,160 |
| ZNG-TA6GL3 | 1 Dec 2026 | Marisa Salvarto | 6 | R5,760 / R8,640 |
| ZNG-24GZES | 1 Dec 2026 | Leigh-ann Lyons | 2 | R3,080 / R3,080 |
| ZNG-M2PAXQ | 29 Nov 2026 | Manuela Di Giovanni | 3 | R4,620 / R4,620 |

All four are confirmed at inspection. Current dates differ from the reported
summary: Leigh-ann's current show is 1 December, not 29 November. Do not change
dates or infer original scheduling from the email alone. The notes explicitly
identify the latter two as gifts, but contain spelling variants; staff should
confirm the preferred attending names before entering new structured fields.

Audit evidence: Hannah changed first_name Manuela -> Marissa at 24 November
11:35:20.753 SAST and surname Di Giovanni -> Salvarto at 11:36:13.622 SAST.
Current profile is Marissa Salvarto. Original booking snapshots remain stored;
there is no evidence of separate replacement profiles for these four bookings.
Profile updated_at is not a reliable timestamp for those audited identity edits.
Do not infer each earlier CRM-write time from booking creation alone: public
upserts did not create a complete customer-identity audit for those writes.

## Root Cause And Cross-Workflow Audit

- Public booking upsert resolves an email/mobile match, then spread the new
  payload over its customer record: first/surname plus default preferences,
  notes and dietary fields. Concurrent email-insert recovery repeated the write.
- Admin create/upsert similarly replaced matched identity fields; its combined
  contact OR query could choose a shared mobile match ahead of exact email.
  With no contacts it could scan all customers and match a name-derived key.
- Booking hydration intentionally reads linked CRM identity, so a changed shared
  name becomes visible on earlier bookings even when snapshots are unchanged.
- Corporate atomic conversion already preserves existing names, fills absent
  contacts only, rejects conflicting/ambiguous identity and reserves in the same
  transaction. Retained unchanged; existing Corporate regressions pass.
- Explicit CRM identity edits and merges remain permissioned/audited and are not
  disabled by this correction. They must not be used to name a gift recipient.
- Imported bookings remain linked to their existing identities/evidence. Legacy
  Dineplan and generic portability execution paths are retired/disabled, per
  LEGACY_DINEPLAN_WORKFLOW_DEACTIVATION_2026-11-10.md and current routes. Historical
  SQL/library import definitions retained; no reactivation or historical rewrite.
- Existing booking duplicate warnings, customer email uniqueness, booking/payment
  idempotency, seating checks and ticket security remain unchanged.

## Read-Only CRM Findings

12,854 customer rows examined for contact aggregates; 9,231 serialised booking
snapshots compared to linked names. Zero duplicate normalised-email groups among
unmerged profiles. Ten shared-phone groups are candidates, not proof of duplicate
people: households and shared contacts may be legitimate.

388 booking snapshots differ from current names across 291 customer profiles.
These include name completion, spelling corrections and legitimate authorised
edits; they are NOT classified automatically as corrupt or gift bookings.
The Marisa case is directly corroborated; other candidates require review.

Complete contact-redacted review list (all 291 profiles/388 references and ten
shared-phone groups): `local-evidence/customer-identity-review-list-2026-11-24.json`.
Private case/audit evidence: customer-identity-case-2026-11-24.json and
customer-integrity-audit-2026-11-24.json in the same directory. Do not publish
these files or expose customer email/mobile details. Queries used explicit
READ ONLY transactions and 15-25 second timeouts; no Production mutation.
One initial query failed on an entity-ID text/UUID comparison; corrected to a
text cast before successful read. No partial write was possible.

## Correction

Matched customer resolution no longer updates profile name, contacts, notes,
dietary fields, consent or VIP settings. Exact email takes priority; mobile
fallback requires a unique compatible name and no conflicting email. Merged-away
profiles are excluded. Names alone do not silently resolve/merge identities.
Unique insert races reuse the winning identity without overwriting it or
inventing a customer-edit/create audit for a match. Explicit ID-based CRM edits
remain available with their existing authorisation and audit mechanisms.

New optional checkbox, Booking for someone else?, reveals an attending guest
name (required when enabled, maximum 120 characters). Shared control is reused
in existing public/staff checkout and Booking Details metadata editor. Stored
as attendingGuestName in existing booking JSON; no new table, column or migration.
Normal unchecked bookings retain previous behaviour. Payment and communications
still route to the purchaser; no new recipient CRM profile is created.

The lead ticket name uses the attendee; other per-guest names and QR identities
are preserved. Existing guest lead-ticket edits keep the attendee in sync.
Wallet source resolution uses the attendee for the lead/group pass. Arrivals,
Daily/Floor Manifests, Floor cards and Booking Details show the attendee alongside
the purchaser when relevant. Table Plans retain the existing Booker column and
show Attendee (Booked by Purchaser), without shifting financial columns/formulas.
Attendee changes use the existing metadata save, permissions, venue/lock and
revision safeguards, local draft, rollback and audit flow. Timeline recognises
the field and retains existing private-detail redaction. No financial or ticket
state recalculation is introduced by the name itself.

No backfill, automatic attendee inference, customer merge/delete, historical
correction, repricing, refund, booking, payment, ticket issue or customer message
was performed. Hannah's changes and all existing operational notes remain intact.

## Verification

- 120 targeted tests pass across customer matching, repeat profiles, actual
  public/Admin upsert functions, actual attendee metadata save, form validation,
  stale revisions, imported history, Corporate conversion, ticket identity,
  generated Table Plan layout/formulas/financials, and Timeline permissions.
- Actual metadata handler fixture verifies one save leaves purchaser contacts,
  ticket identities, paid/total/balance and payment state unchanged; stale save
  returns 409 without a write. No real services used.
- Chromium shared-field/model checks at 320/390/1280px pass: conditional field,
  required-name validation, disabled access, correct gift/normal ticket names,
  purchaser retained and no horizontal overflow/page errors. 320px screenshot
  visually inspected; not physical iPhone/Safari or a complete live checkout.
- TypeScript and focused ESLint pass, with three pre-existing unused warnings
  in public bookings route. An additional old Corporate transaction test asserts
  a removed one-argument call spelling; current HEAD already passes an override
  argument. No unrelated test or payment behaviour rewritten to satisfy it.
- Local Turbopack failed on the documented CSS worker restricted-port limitation.
  Supported Webpack build fallback passed, including TypeScript/static generation.
  Existing performance-budget script rejects the current manifest format; no
  script/config changes made. Diagnostic Webpack Admin client-module referenced
  chunks: 1,256,863 raw /304,737 gzip bytes, largest 172,207 gzip. This is NOT
  full initial-route budget certification; largest exceeds the old 170,000-byte
  threshold. An isolated archive of baseline 75c747b was subsequently built with
  the same Webpack/dependencies: baseline raw 1,256,525 /gzip 303,913 /largest
  172,289. Change: +338 raw, +824 gzip (0.27%), largest -82 bytes. Therefore the
  largest-chunk overage predates this correction. No full budget pass claimed.
  Evidence: local-evidence/customer-guest-webpack-comparison-2026-11-24.json;
  baseline archive retained at /private/tmp/zingara-customer-baseline-Z2yMYO.
- No added customer/booking lookup or polling. Matched public customers no
  longer incur an UPDATE; Admin matching removes a redundant lookup/write.
  Existing booking JSON/data and payment endpoints reused, no dependencies.

## Outstanding Historical Review

Box Office should review the explicit gift notes on ZNG-24GZES and ZNG-M2PAXQ,
confirm spellings, then populate the attending field through normal authorised
Booking Details. Marisa's other two bookings and Hannah's restored CRM identity
must remain unchanged unless separately instructed. The other 291-profile name
differences and ten shared-phone groups require evidence-based CRM review, not
automatic merges or mass correction. No confirmed cash loss is inferred.

Frontend 2.0, rollback checkpoints and all unrelated uncommitted work preserved.

## Production Release

- Commit **460092ee6eba5562fe824c17fc673f4be62c2fe8**, pushed to main. Only
  nineteen relevant source/test files; all unrelated dirty records excluded.
- Vercel Production **dpl_DohKD4Rx4ZYH2m9LnrdRBZQNbzDG**, **READY**, exact
  SHA and `book.zingara.co.za` alias verified. Prior commit 75c747b is the
  code-only rollback point; no data/schema rollback is needed.
- Live verification 24 November 12:29:36 SAST: /admin and /book HTTP 200;
  served chunks 2v6fkyn-y7x4-.js and 42wv6nwy-algj.js contain separate
  attendee/purchaser display and Booking for someone else? / Attending guest
  name control respectively. No stale prior asset was used as release evidence.
- Unauthenticated /api/admin/customers and /api/admin/bookings return 401,
  with no customer rows disclosed. Exact deployed server commit matches locally
  tested handlers. No signed-in Production staff session/edit or real checkout
  was used; do not claim those interactions or physical iPhone QA were performed.
- Evidence: local-evidence/customer-guest-production-deployment-2026-11-24.json,
  customer-guest-production-http-2026-11-24.json and customer-guest-tests-
  2026-11-24.log. Local browser/screenshots and bundle comparison retained.
- No customer, booking, payment, financial, seating, ticket or communication
  mutation during investigation/QA; no migration or automatic historical backfill.
  All task records updated locally; unrelated work/Frontend 2.0 untouched.
