# Attendance Management & Notification Integrity

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Findings

- Guest YES/NO persistence was already atomic and idempotent. YES recorded the
  response without a notification; NO previously used broad role routing for
  Super Admin, Venue Manager and Box Office roles through in-app/device push.
- No Attendance Confirmations Staff Emails workflow or email delivery existed.
  Bookings and Booking Details also lacked attendance controls, while Floor &
  Arrivals displayed statuses without an attendance filter.
- The first release preserved a stale pre-existing attendance route because its
  migration used `on conflict do nothing`. Production verification found Fatima
  and Kaden still stored on that route. The corrective migration replaced the
  route authoritatively with the four approved Box Office recipients and no CC.

## Delivered

- Declines now use one asynchronous, versioned and idempotent workflow across
  email, targeted in-app notification and targeted device push. Confirmations
  remain record-only. Notification delivery never controls response recording.
- Communications -> Staff Emails now exposes Attendance Confirmations with the
  existing ON/OFF, Edit, TO/CC and Save Recipients controls. Production is ON
  for Lisa Rodderick, Michael Davis, Rasmus Bjerregaard and Sharon Ricketts;
  CC is empty. Management and venue roles have no automatic fallback.
- Bookings now filters All, Confirmed, Declined and Awaiting Response through
  the existing paginated query/export path. Booking Details shows a compact
  attendance badge. Arrivals & Check-in has the same independent filter while
  arrival/check-in remains a separate state.
- Migration `20261106001500_attendance_management_integration.sql` registered
  the route, indexed attendance response and extended the bounded booking-list
  RPC. Migration `20261106003000_attendance_box_office_routing_correction.sql`
  removed stale management recipients from the existing Production route.

## Verification & Release

- Focused tests: 15/15 passed. TypeScript, Production build and whitespace
  checks passed.
- Admin performance budget passed: raw 1,290,287 / 1,320,000 bytes; gzip
  312,441 / 320,000 bytes; largest gzip chunk 168,485 / 170,000 bytes.
- Authenticated Production verification confirmed the enabled Box Office-only
  Staff Emails route, attendance taxonomy in Bookings, the Booking Details
  `Attendance: Awaiting Response` badge and the Arrivals attendance filter.
- Application commits: `78041bc7` and corrective `2c71b111`.
- Production deployments: `dpl_HyGpP4dQZdqappism7vTxuRMKhkF` and corrective
  `dpl_96DhfWokipKao2fzeypK546GWMgL`, both READY.
- Business-data delta: one notification route was added/corrected, one booking
  attendance index and the existing paginated booking RPC were updated. No
  booking, attendance response, arrival, payment, seating, ticket or customer
  communication record changed. No real notification was sent during QA.
- Rollback: revert `2c71b111` and `78041bc7`, redeploy, and restore the prior
  RPC only if the attendance filter is intentionally removed. Do not revert or
  delete guest attendance history.
- Full record:
  `.codex/archive/ATTENDANCE_MANAGEMENT_NOTIFICATION_INTEGRITY_2026-11-05.md`.

---

# Gratuity Transition & Financial Integrity

STATUS: COMPLETE - DEPLOYED AND ACTIVATED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Verified Findings

- New public online bookings currently include 12.5% gratuity for parties of
  six or more. The charge is calculated on the discounted seating and add-on
  subtotal and persisted in `bookings.service_fee`.
- The complete Production public-booking audit found 4,579 records: 1,315
  carry R1,962,126 recorded gratuity and 3,264 carry no gratuity charge.
- Payment-ledger evidence conclusively supports 741 fully settled gratuity
  bookings (R1,083,232). A further 568 bookings carry R871,939 in charged
  gratuity but are not fully settled. Six cancelled, fully-paid records carry
  R6,955 and remain review cases rather than being labelled collected.
- Deposit payments do not retain component-level allocation evidence. Partial
  bookings therefore remain `GRATUITY REVIEW`; the platform does not infer a
  collected component from the booking total alone.

## Delivered

- Customer-originated online pricing excludes gratuity in both browser and
  authoritative server calculations. Internal, Corporate and COMP pricing
  paths retain their existing rules.
- Each new public booking snapshots `pay-at-venue` in the existing booking
  metadata. Existing `service_fee` amounts and historical totals are not
  changed. Add-on amendments preserve the booking's original gratuity basis.
- Booking Details and Table Plan Payment Summary use one resolver for
  `GRATUITY COLLECTED`, `GRATUITY PAYABLE AT VENUE` and `GRATUITY REVIEW`.
  Explicit imported gratuity evidence takes precedence; cancellations and
  partial settlements fail safely to review.
- Checkout, confirmations, payment links, Find My Booking, Admin previews and
  pre-show communications use booking-aware venue-payment wording.
- Migration `20261105235900_gratuity_transition_activation_audit.sql` adds
  activation evidence only. Its linked dry run is clean and changes no
  booking, payment or financial row.

## Verification

- Focused status/disclosure tests: 8/8 passed.
- TypeScript and the Next.js 16 Production build passed.
- Admin performance budget passed: raw 1,287,914 / 1,320,000 bytes; gzip
  311,950 / 320,000 bytes.
- Full changed-page ESLint remains noisy only from pre-existing repository
  hooks and unused-code findings; no new build or type failure exists.

## Production Release

- Application and records commit: `70447e55`.
- Migration `20261105235900_gratuity_transition_activation_audit.sql` applied
  successfully. It created release evidence only and changed no booking or
  payment row.
- Production deployment: `dpl_8LZzfKP3DpqhTaSFvpSQa3cLjzZH`, READY and
  aliased to `book.zingara.co.za`.
- Activation recorded at 5 November 2026, 23:10:59 SAST for new
  customer-originated online bookings only.
- Live public Booking loaded successfully from the deployed build. No QA
  booking, payment or customer communication was created.
- Microsoft 365 accepted exactly one branded
  `Zingara — Gratuity Payment Update` email to authoritative Fatima MB with
  Kaden Damon copied. Communications contains exactly one `sent` record at
  23:13:36 SAST. Provider acceptance and Communications delivery are verified;
  direct inbox receipt was not claimed.
- Business-data delta: one financial policy release-evidence row and one sent
  internal Communications record. Existing bookings, totals, payments,
  refunds, VAT, seating, tickets and customer communications are unchanged.
- Rollback: revert `70447e55` and redeploy. Preserve historical booking data;
  mark the release evidence inactive only if the application rollback is
  deliberately activated.
- Full record:
  `.codex/archive/GRATUITY_TRANSITION_FINANCIAL_INTEGRITY_2026-11-05.md`.

---

# Guest Communication & Disclosure Integrity

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Findings

- The authoritative booking calculation applies a 12.5% service fee/gratuity
  for parties of six or more to the discounted seating and add-on subtotal and
  includes it in the booking total. Existing checkout totals were correct, but
  guest copy in checkout and the Pre-Show Reminder incorrectly described that
  charge as discretionary and payable on the night.
- Venue inclusions were correct in the Pre-Show Reminder but were absent from
  the public payment commitment, balance-payment, Find My Booking and booking
  confirmation touchpoints. Initial branded confirmation emails also did not
  consume the editable Reservation Confirmed body.
- Corporate enquiries already enforce the authoritative 20-guest minimum.
  Existing digital tickets, ticket PDFs and Apple Wallet passes contain the
  required event, venue, seating, timing and status information without a
  conflicting financial statement; they remain intentionally compact.

## Delivered

- One shared venue-aware disclosure source now supplies Cape Town and
  Johannesburg inclusions plus booking-derived payment/gratuity notices.
- Public checkout, secure balance-payment links and Find My Booking now show
  compact inclusions and payment disclosures before a guest pays or manages an
  outstanding balance.
- Booking confirmations, PayFast payment confirmations and Pre-Show Reminders
  now use the same authoritative content. Deposit bookings mention an
  outstanding balance; fully paid bookings do not. The persisted `service_fee`
  determines whether the included 12.5% notice appears.
- Initial branded reservation confirmations now include the saved editable
  template body. Admin template previews append the same authoritative
  disclosure content. Manual ticket resends retain their existing focused
  ticket presentation.
- Corporate wording now states that any applicable 12.5% gratuity is itemised
  in the quote and distinguishes additional drinks/gratuity payable at the
  venue unless covered by the agreed booking.
- No pricing, gratuity, VAT, deposit, NYE, PayFast, booking, seating, ticket or
  Wallet calculation changed. No migration was required.

## Verification & Release

- Focused disclosure/email tests: 14/14 passed. TypeScript, targeted lint,
  whitespace checks and the Next.js 16 Webpack Production build passed. The
  existing Admin performance script still cannot parse the Webpack
  client-reference manifest; no performance claim relies on that script.
- Browser verification covered the public booking flow and the live Corporate
  disclosure. Production returned HTTP 200 for Booking and Find My Booking,
  and the deployed Corporate page contained the corrected wording.
- The available browser session was not authenticated for Admin, so a direct
  live Admin preview inspection was not claimed. Shared renderer tests and the
  Production build verify the preview integration.
- Application commit: `6a9515bf`.
- Production deployment: `dpl_BVQ9EbmokQkGNqWx9BMFNKNgb9AH`, READY and
  aliased to `book.zingara.co.za`.
- Business-data delta: zero. No customer email was sent and no booking,
  payment, seating, ticket, communication or financial record changed.
- Rollback: revert `6a9515bf` and redeploy. No schema or data rollback is
  required.
- Full record:
  `.codex/archive/GUEST_COMMUNICATION_DISCLOSURE_INTEGRITY_2026-11-05.md`.

---

# Pre-Show Attendance Confirmations

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Production Baseline

- The existing `pre_show_reminder` workflow remains enabled and scheduled
  exactly 24 hours before the authoritative venue Show Starts time. The
  15-minute scheduler, confirmed-booking eligibility and paid/deposit/COMP
  evidence rules are unchanged.
- Production recorded 714 sent reminders in the preceding 30 days, including
  57 on 5 November. Fourteen failed records and six historical records left in
  `sending` were identified; the Communications schema does not retain the
  provider failure reason. No historical reminder was resent or altered.

## Delivered

- Existing branded reminder emails now include `YES - I'LL BE THERE` and
  `NO - I CAN'T MAKE IT` actions backed by encrypted, expiring,
  booking-specific links.
- A compact confirmation page prevents email-security scanners from recording
  false answers. Guests can update their response; unchanged retries are
  idempotent.
- Floor & Arrivals shows Confirmed, Declined or Awaiting Response on check-in
  entries and expanded floor-table bookings.
- A new decline creates one versioned, idempotent Box Office in-app/push
  notification for Super Admin, Venue Manager, Box Office Manager and Box
  Office Staff roles. A response never changes arrival, booking status,
  seating, tickets, payments, refunds or capacity.
- Every changed response creates immutable booking audit evidence.
- The authoritative Guest Emails editor, saved workflow configuration,
  Production preview and scheduled sender now share the same renderer. The
  Preview Email view includes the `YES - I'LL BE THERE` and
  `NO - I CAN'T MAKE IT` actions that customers receive.
- Legacy Reminder Before Show and Post-Show Review entries are no longer
  offered in the generic template selector. Their stored records remain
  unchanged; scheduled workflow content continues to be edited only in
  Automated Guest Journeys.
- A Super Admin-only, one-time Production test action renders the saved
  pre-show workflow through the live Microsoft 365 delivery path. Its
  attendance links use a synthetic preview token that never writes booking or
  attendance state.

## Verification And Release

- Focused tests: 4/4 passed. TypeScript, changed-file ESLint, whitespace checks
  and the Next.js 16 Webpack Production build passed. The default Turbopack
  build remains blocked by the local compiler port restriction.
- Linked migration dry-run and application passed. A rollback-only Production
  transaction recorded Confirmed then Declined, verified versioned audit state,
  proved all booking/payment/seating fields unchanged, rolled back, and left
  zero QA links.
- Live Production returned the new attendance page and rejected an invalid
  token with HTTP 404. Browser verification confirmed the branded unavailable
  state; no real customer response or notification was created.
- Follow-up verification passed six focused attendance checks, TypeScript,
  changed-server-file ESLint, whitespace checks and a Next.js 16 Webpack
  Production build. The Admin performance script could not read the Webpack
  client-reference manifest format; no performance claim is based on that
  script.
- Authenticated Production preview verification confirmed the saved subject,
  body, branding, legal footer and both attendance actions. The approved test
  email `TEST — Zingara Pre-Show Reminder` was provider-accepted at
  21:25:20 SAST and visually confirmed in `kaden@kaden.co.za` Outlook.
- The isolated Confirmed response completed successfully and displayed that
  the booking remains unchanged. Production contains exactly one sent test
  Communication and zero persisted links for the preview token.
- Two initial test-send attempts were rejected before SMTP by legacy foreign
  keys on `communications.batch_id` and `communications.created_by`. They
  created no Communications rows and sent no emails. The final claim uses no
  campaign batch or legacy user attribution and remains protected by a narrow
  unique index.
- Application commit: `510a003f0533c9bf0161ce0682e9b6a61cc2b9b6`.
- Follow-up commits: `642dd2f4`, `36138e4a`, `4d22837a`, `744d9e3c`.
- Migration: `20261105193000_pre_show_attendance_confirmations.sql`.
- Follow-up migrations: `20261105214500_pre_show_email_template_integration.sql`
  and `20261105221000_pre_show_email_test_claim_fix.sql`.
- Production deployment: `dpl_Gvd6aAxqbKwfwjdmbuSGkTTrjQd9`, Ready and
  aliased to `book.zingara.co.za` at 20:56:46 SAST.
- Final follow-up deployment: `dpl_DRTR4jiiSbNVERjrC9FAwcQbXYgv`, Ready and
  aliased to `book.zingara.co.za` at 21:23:40 SAST.
- Business-data delta: zero historical or customer records changed. The schema,
  response function and application were added; the rollback-only QA state was
  not persisted.
- Follow-up business-data delta: one sent QA Communications record only. No
  booking, attendance, seating, payment, ticket or financial record changed.
- Reminder refinement: the saved welcome now appears immediately below the
  Zingara header, followed by full-width `YES - ATTENDING` and
  `NO - NOT ATTENDING` actions, a compact booking card and digital-ticket
  link, venue-specific inclusions, booking-derived payment/gratuity wording,
  the existing age policy and legal footer. Cape Town and Johannesburg copy is
  selected from the authoritative show venue; deposits use the persisted
  payment status/balance and fully paid/COMP bookings do not claim an
  outstanding ticket balance. Six-plus bookings receive one discretionary
  12.5% notice. No New Year's Eve rule was added or changed.
- The saved Production body was still the untouched legacy default. Migration
  `20261105223000_pre_show_reminder_copy_refinement.sql` replaced only that
  exact body with the shorter editable welcome; it cannot overwrite a
  staff-customised template.
- Refinement verification passed six focused attendance checks, targeted
  ESLint, TypeScript, whitespace checks and two Next.js 16 Webpack Production
  builds. Authenticated Production preview confirmed the editable welcome,
  exact short-hyphen button labels, Cape Town inclusions, booking card,
  payment copy, age policy and footer through the shared scheduled renderer.
  Full-width stacked actions and the 100% responsive email tables preserve the
  compact mobile layout. No customer email was sent; the existing QA test
  count remained one with the prior 21:25:20 SAST send time.
- Refinement commits: `368a13f6`, `1c8230e0`.
- Final refinement deployment: `dpl_x2gRBzm6u3xbjRjWrzaQhxpHYTuw`, Ready and
  aliased to `book.zingara.co.za`.
- Refinement business-data delta: the saved pre-show welcome body only. No
  booking, attendance, communication, seating, payment, ticket or financial
  record changed.
- Copy and legal-footer follow-up: the shared renderer now describes the Cape
  Town dinner as `A decadent 3 course dinner` and the Johannesburg dinner as
  `A decadent 4 course dinner`. Authenticated Production preview confirmed the
  Cape Town wording, retained welcome drinks/canapes and duration copy, both
  attendance actions and the legal footer. Scheduled delivery and Admin preview
  still use the same renderer.
- All four footer routes returned HTTP 200 in Production: Terms & Conditions,
  Booking Terms, Booking & Cancellation Policy and Privacy Policy. No duplicate
  or broken footer link was found. The policies do not contradict the current
  booking, cancellation or privacy rules, but the four linked decrees do not
  expressly document the active 12.5% gratuity or New Year's Eve full-payment
  rules; detailed deposit wording remains in the separate Payment Terms decree.
  No legal or financial rule was changed.
- Copy follow-up verification passed six attendance tests, targeted ESLint,
  TypeScript, whitespace checks and the Next.js 16 Webpack Production build.
  Application commit: `14723c5a`. Production deployment:
  `dpl_ACAL6SjhMf7SG9zsQbRfPohsTaE7`, Ready and aliased to
  `book.zingara.co.za` at 21:58:52 SAST. No email was sent and no business data
  changed.
- Show-time restoration follow-up: the shared Pre-Show Reminder booking card
  once again displays Grounds Open, Guest Seating and Show Starts directly from
  the authoritative venue settings. Production currently configures both
  venues as `17:00`, `18:30` and `19:30` respectively. Authenticated preview
  and the delivered Production test email matched exactly.
- The one authorised test `TEST — Zingara Pre-Show Reminder` was provider
  accepted, logged once in Communications at 22:12:32 SAST and confirmed in
  `kaden@kaden.co.za` Outlook. It used isolated preview attendance links and
  changed no booking or attendance record. Application commit: `3bece54d`;
  migration: `20261105224500_pre_show_reminder_test_release.sql`; Production
  deployment: `dpl_31uQnKZg8JppiP4tVqp4wGfE2i9Q`, Ready and aliased to
  `book.zingara.co.za` at 22:09:24 SAST.
- Rollback: revert `510a003f`, redeploy, and stop generating new attendance
  links. The additive columns/table may remain safely in place; existing
  responses can be retained as audit evidence.
- Full record: `.codex/archive/PRE_SHOW_ATTENDANCE_CONFIRMATIONS_2026-11-05.md`.

---

# Intelligent Quick Bug Reporter

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Delivered

- A lightweight draggable issue button is available throughout authenticated
  Admin and opens a lazy-loaded compact report panel without closing the active
  workspace or losing unsaved form state.
- Existing Admin API failures supply sanitised, editable context without
  polling, network interception or continuous capture. Private image/video
  attachments, browser-approved screenshot capture and the existing Bug & Issue
  Register are reused.
- Quick reports use the existing permissioned issue API, private storage,
  Communications logging and branded Microsoft 365 email path. Notification
  delivery is asynchronous and idempotent.
- The compact panel uses the established rounded Admin surfaces, pill-shaped
  controls and clean uppercase sans-serif Management Controls typography.
- Sensitive credentials, payment details and unrelated customer data are
  excluded. Reports are never submitted automatically.
- Staff issue emails now lead with a short operational summary and a single
  selectable `REPORT` block. Only captured context is included, timestamps are
  readable in SAST, and secure attachments plus the existing `OPEN ISSUE`
  action and approved footer are preserved.
- The existing staff walkthrough now introduces the Quick Bug Reporter in five
  short steps. Version `quick-bug-reporter-2026-11-05-v1` makes it available to
  every existing staff account without deleting prior acknowledgement history;
  completed staff can reopen it from Academy.

## Verification And Release

- Focused tests passed 12/12; TypeScript, changed-file ESLint, whitespace checks
  and the Next.js Webpack Production build passed.
- Follow-up email and walkthrough tests passed 16/16. TypeScript, focused
  changed-file ESLint, whitespace checks and a clean Next.js Webpack Production
  build passed. The Admin page chunk measured 760,455 bytes, 16 bytes smaller
  than the previous verified release.
- Clean baseline comparison measured a 3,011-byte increase in the Admin
  closed-state page chunk (approximately 0.4%); the panel remains lazy-loaded.
- Authenticated Production desktop and 420px compact-width verification
  confirmed the floating control, rounded panel, sans-serif heading and
  Capture/Attach/Send actions without losing the active Admin workspace.
- The one authorised Production QA submission created `BUG-000030` with one
  ready private PNG attachment. It appeared in the existing Issue Register,
  produced one sent Communications record and one idempotency delivery attempt,
  and the branded email was received and visually verified in Kaden's Outlook.
  The QA issue was then marked Completed / Fixed; no duplicate was created.
- Application commits: `daa5620e`, `fc0b873e`, `0fa1525d`, `c9d7e168`.
- Final Production deployment: `dpl_J7v8gZnXDLNAkHjVJjMKiJnr3qAy`, Ready and
  aliased to `book.zingara.co.za` at 19:54:35 SAST.
- Follow-up application commit: `c4e1d3c2`.
- Follow-up Production deployment: `dpl_HkNA2JVARosoZ7gSDxaGARsWWEuu`, Ready
  and aliased to `book.zingara.co.za` at 20:29:41 SAST.
- Authenticated Production verification confirmed automatic first display for
  Kaden without reauthentication, all five steps, Back/Next navigation,
  completion persistence and the Academy entry labelled `QUICK BUG REPORTER
  WALKTHROUGH`. Concurrent user tab switching prevented a clean final visual
  observation after clicking the Academy reopen action; the live control and
  its tested event path were verified. No Capture, Send, issue creation or
  email delivery was triggered during this follow-up.
- No migration was required. Business-data delta is limited to the approved
  completed QA issue, its private attachment, one Communications record, one
  idempotency record and the issue completion audit. No booking, seating,
  payment, ticket or financial record changed.
- Rollback: revert the four application commits and redeploy. No database
  rollback is required; retain the completed QA record as release evidence.
- Follow-up rollback: revert `c4e1d3c2` and redeploy. No migration or database
  rollback is required.
- Full record: `.codex/archive/INTELLIGENT_QUICK_BUG_REPORTER.md`.

---

# P0 Internal Booking Amendment Failure

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Verified Incident

- `ZNG-9VHFFH` is a Cape Town Corporate fixed-price booking for 5 November
  2026. It remains at 84 guests, fully paid at R154,638 with R0 outstanding.
- The first failed amendment was rejected by the Corporate reconciliation RPC's
  public-sales status guard (`SHOW_NOT_ACTIVE`).
- After the show was reopened, the amendment reached the database but rolled
  back with `TABLE_OCCUPANCY_OUT_OF_RANGE|30|84|golden-circle`.
- The proposed 94 guests remain within the authoritative Golden Circle
  operational capacity: 139 guests after amendment against 144 seats.

## Correction

- Authorised internal creation, conversion, transfer and guest amendments now
  remain independent of Blackout, Inactive and Sold Out public-sales states.
  Venue Closure and Archived performances remain protected.
- Proposed single-zone guest count now drives table-fit validation. If the
  existing assignment cannot fit, the transaction atomically releases the
  claims and marks the booking as needing a table; it never auto-splits or
  auto-merges the booking.
- Corporate fixed-price totals and payments remain unchanged, and table
  integrity failures now return actionable staff messages.

## Verification

- Focused tests: 22/22 passed. Changed-file ESLint, TypeScript and the Next.js
  Webpack Production build passed.
- A rollback-only Production transaction proved the exact 84-to-94 amendment
  succeeds with R0 additional charge, preserves R154,638 paid / R0 outstanding,
  and returns `floor_assignment_required=true`.
- The transaction was rolled back. Production remains at 84 guests with all 15
  existing table claims (84 seats) intact and no financial change.

## Release

- Application and records commit: `37558c408c5f112a8484323101f5154e24c81afc`.
- Migration `20261105171000_p0_internal_booking_amendment_integrity.sql`
  applied successfully and was verified in `supabase_migrations`.
- Production deployment: `dpl_C4gBE3WudKjoH9Qzk3HTAiFhNVG8`, Ready and
  aliased to `book.zingara.co.za` at 19:07:57 SAST.
- Authenticated Production UI verification opened the exact Corporate booking
  amendment and entered 94 without submission. The screen showed 10 added
  guests, fixed total with no automatic repricing, R0 additional amount, R0 new
  outstanding and an enabled confirmation action.
- A post-release rollback-only Production transaction exercised the exact save
  path successfully. The live booking remains unchanged at 84 guests with 15
  table claims, R154,638 paid and R0 outstanding.
- Public booking remains active-only; no public availability predicate or
  database reservation boundary changed.
- Business-data delta: zero. Only function definitions and application policy
  were changed.
- Rollback: revert `37558c40`, redeploy, and restore the three prior function
  definitions from the migration baseline.

## Archive

- `.codex/archive/P0_INTERNAL_BOOKING_AMENDMENT_FAILURE_COMPLETE.md`

---

# Public Calendar Status & Colour Cleanup

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Verified Audit

- `Special Event` and `Full Show Buyout` are not functionally equivalent.
  Special Event is a show lifecycle state that remains unavailable publicly but
  permits management-approved internal booking. Full Show Buyout is an active
  `corporate_buyouts` record that closes every public zone and is protected by
  the atomic public-booking database guard.
- Production contains active and historical dependencies on Blackout, Special
  Event, Sold Out and Venue Closure. No records or business rules are being
  consolidated or migrated.
- JHB 6 November has an active buyout and a Blackout show state; JHB 7 November
  has an active buyout and a Special Event state. Both are publicly blocked by
  the active buyout. JHB 17 November is currently `inactive` and is not returned
  by the public show API.

## Implemented Presentation Change

- The public calendar legend is reduced to Available, Sold Out, Full Show
  Buyout and Venue Closure.
- Authoritative Full Show Buyouts use the existing blue Blackout colour.
- Blackout and Special Event remain fully enforced but appear publicly as a
  neutral unavailable date rather than separate legend categories.
- Internal staff booking journeys retain the original Blackout and Special
  Event distinctions. No availability, booking, payment or ticketing logic was
  changed.

## Verification

- Focused public lifecycle and calendar tests: 10/10 passed.
- TypeScript passed and the Next.js Webpack Production build completed.
- The default Turbopack build remains blocked by this local environment's
  compiler port restriction; the clean Webpack build and Vercel build are the
  release gates.
- Application and records commit: `e1504d6c5da8c517917cac67311fefa1ee2bf61b`.
- Production deployment: `dpl_CP9MmTWXMDzoJH23XAyDCp2KBEfk`, Ready and aliased
  to `book.zingara.co.za` at 15:10:05 SAST.
- Live desktop and 390x844 mobile verification confirmed the four-item legend,
  blue Full Show Buyouts on 6/7 November, neutral Unavailable Special Events on
  14/15 November, and an ordinary Available date continuing to guest selection.
- No migration was required. Business-data delta: zero.
- Rollback: revert `e1504d6c` and redeploy.

## Archive

- `.codex/archive/PUBLIC_CALENDAR_STATUS_COLOUR_CLEANUP.md`

---

# P0 Guest Count Reduction & Retained Value Transfer

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 3 NOVEMBER 2026

## Incident And Root Cause

- The reported reference `ZNG-M7HYQ3` belongs to a different 18-guest booking.
  Jane Grobler's authoritative booking is `DP-J7SPNC`: Johannesburg,
  20 November 2026, 70 Middle Ring guests, fully paid R103,950.
- Production UI reproduction confirmed that the retained-value confirmation
  kept `CONFIRM GUEST COUNT` disabled without explaining the missing action.
  No amendment request reached the API, so the atomic database path did not
  fail and no partial amendment existed.
- A rollback-only Production call proved the existing permissioned atomic RPC
  accepts Jane's 70-to-64 reduction and preserves her merged 70-seat table.

## Correction And Verification

- The explicit bar-tab transfer confirmation remains mandatory. The final
  button now provides an actionable inline instruction when that confirmation
  is missing instead of appearing inert.
- Verified calculation: R92,400 ticket evidence / 70 = R1,320 per guest;
  R7,920 released ticket value + R11,550 gratuity = R19,470 final bar tab;
  R84,480 final ticket value; R103,950 retained; refund R0.
- Focused tests passed 29/29; TypeScript, changed-file ESLint, diff validation
  and the Next.js Webpack Production build passed. The local Turbopack worker
  remains unable to bind its compiler port in this environment; Vercel's clean
  Production build is the release gate.
- Authenticated Production UI verification reproduced the exact 70-to-64
  workflow after deployment and confirmed the clear missing-confirmation
  message. The modal was closed without submitting the live amendment.
- Application commit: `b2807abb46699d82d21a064be66583bf353466c6`.
- Production deployment: `dpl_8WbtzWZuxES8jB41m8dLHL1AWPx3`, Ready and
  aliased to `book.zingara.co.za` at 14:11:55 SAST.
- No migration was required. Rollback: revert `b2807abb` and redeploy.
- Business-data delta: zero. Jane remains at 70 guests, R103,950 paid,
  R0 outstanding, with no retained-reduction audit event.

## Archive

- `.codex/archive/P0_GUEST_COUNT_REDUCTION_RETAINED_VALUE_TRANSFER_COMPLETE.md`

---

# P0 Table Plan Export & Seating Classification Integrity

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 3 NOVEMBER 2026

## Incident And Correction

- JHB 3 November 2026 placed numbered temporary table `408` in Middle Ring and
  omitted yellow repeated headings in a large dynamic export.
- The prior permanent-table fix covered only the exact 74 master codes. The
  temporary-plan allocator could continue from legacy cross-zone numbers.
  Sixteen retained temporary rows across four performances have this mismatch.
- Exact numeric table codes now export in the approved number families while
  preserving the booking's authoritative `ORIGINAL ZONE`. Named temporary
  tables and merged codes retain their show-specific saved section.
- Future temporary plans allocate atomically inside the selected zone family.
  Existing rows were not renamed or rewritten.
- Phase 64's unconditional `D79:K79` fill clearing mutated shared Excel styles.
  It now clears only recognised red fills on cloned styles, preserving every
  yellow repeated heading.

## Verification And Release

- Focused tests: 16/16 passed. TypeScript, changed-file ESLint, whitespace
  validation and the Next.js Webpack Production build passed.
- Migration `20261103135000_p0_table_plan_seating_classification.sql` applied.
- Fresh authenticated Production exports:
  `Zingara_Table_Plan_JHB_2026-11-03 (2).xlsx` and
  `Zingara_Table_Plan_CPT_2026-11-03 (2).xlsx`.
- JHB table `408` now appears under `GOLD CIRCLE`; Brenton Veeran remains 10
  guests and `ORIGINAL ZONE` remains `Middle Ring`. All JHB and CPT repeated
  headings are yellow; Notes, payment, COMP and dietary columns remain present.
- Application commit: `6af231b0`.
- Production deployment: `dpl_3h1g2KJyEmpSRs5DjMe64vqX4r8D`, Ready and aliased
  to `book.zingara.co.za` at 13:54:10 SAST.
- Rollback: revert `6af231b0` and restore the previous function definition from
  `20260910143000_phase_41_1x_a_incremental_temporary_capacity_recovery.sql`.
- Business-data delta: zero.

## Archive

- `.codex/archive/P0_TABLE_PLAN_EXPORT_SEATING_CLASSIFICATION_INTEGRITY_COMPLETE.md`

---

# P0 Box Office Seating Override Booking Failure

STATUS: COMPLETE - MIGRATED AND DEPLOYED

DATE: 3 NOVEMBER 2026

## Incident

- Authorised Box Office two-seater overrides reached the final booking step but
  failed before persistence with `Booking transaction failed`.
- Production recorded 13 failed `create_booking` events across five booking
  references between 12:38:01 and 16:24:28 SAST on 2 November 2026.
- All five failed references have zero bookings, payments and tickets, confirming
  retries did not create duplicate business records.

## Root Cause And Correction

- `enforce_two_seater_booking_limit()` is a `BEFORE INSERT` trigger. It consumed
  the valid override and linked `booking_id = NEW.id` before the new booking row
  existed, causing foreign-key error `23503`.
- Migration `20261103090000_p0_two_seater_override_creation_fk.sql` makes only
  that foreign key `DEFERRABLE INITIALLY DEFERRED`, so it is checked after the
  booking insert completes in the same transaction. Failed transactions still
  roll back authorization consumption and audit evidence atomically.
- Checkout errors now distinguish booking persistence failures from actual
  PayFast preparation failures. Complimentary creation errors no longer claim
  that payment could not be started.
- Roles, mandatory reasons, quota enforcement, capacity validation, one-table
  automatic assignment, payment logic and ticket rules are unchanged.

## Verification And Release

- Focused two-seater tests passed 10/10; complimentary tests passed 7/7;
  provenance tests passed 5/5; TypeScript and migration dry-run passed.
- Existing unrelated `paymentStart` source assertions and a direct Node module
  resolution test remain stale; neither failure references the changed logic.
- Production constraint verification reports `condeferrable=true` and
  `condeferred=true`.
- A rollback-only Production transaction exercised the formerly failing
  pre-insert relationship and persisted zero fixture rows.
- Authenticated Production Admin loaded successfully after deployment. No live
  booking, payment, ticket or customer record was created for QA.
- Application commit: `a4910fc4`.
- Migration applied: `20261103090000_p0_two_seater_override_creation_fk.sql`.
- Production deployment: `dpl_82X7gxcMgKiSiededRQxCxVyFaa3`, Ready and aliased
  to `book.zingara.co.za` at 09:28:46 SAST.
- Business-data delta: none. Only the foreign-key timing metadata changed.

## Previous Task: Meta Pixel & Conversions API Integration

STATUS: COMPLETE - META CAPI VERIFIED AND ACTIVE FOR FUTURE ELIGIBLE PAYMENTS

DATE: 3 NOVEMBER 2026

## Objective

Complete the existing consent-gated Meta Pixel and verified PayFast Purchase
Conversions API integration without duplicating the Phase 56.1 outbox or
affecting booking and payment workflows.

## Verified Baseline

- Meta Pixel already records PageView, ViewContent, InitiateCheckout and
  AddPaymentInfo only after Marketing consent and never on Admin routes.
- Phase 56.1 already provides ITN-authoritative payment-level Purchase events,
  an atomic destination outbox, bounded retries, leases and idempotency.
- Production initially had 357 consented attribution records and 299 successful GA4
  Purchase deliveries. No Meta outbox rows or historical Meta backlog exist.
- `META_PIXEL_ID` and `META_CAPI_ACCESS_TOKEN` are present as Production-only
  Vercel secrets. Their values were not exposed.
- Global server Purchase authority and attribution capture are active. Meta is
  not yet an enabled destination.

## Implementation

- Use the server-provided `META_PIXEL_ID` for both browser Pixel and CAPI instead
  of a duplicated source-code constant.
- Keep the CAPI access token server-only and send it in the Authorization header,
  never in source, browser bundles, URLs, logs or records.
- Default to supported Graph API `v26.0`, while retaining an optional validated
  environment override.
- Keep Purchase server-only when the Phase 56.1 server path is authorised. Each
  verified PayFast deposit, balance or full payment uses its own stable payment
  event ID and actual ZAR transaction value.
- Add a management-only readiness endpoint with two deliberately separate checks:
  a passive token identity check and an optional synthetic Test Events delivery
  check. Dataset delivery is never inferred from unrelated object-read access.

## Verification

- Focused advertising and consent tests: 27/27 passed.
- Final provider-readiness regression tests: 12/12 passed.
- TypeScript passed.
- Changed-file ESLint passed.
- Diff validation passed.
- The local full build reached an existing compiler-worker restriction in three
  unrelated Admin files. Vercel's clean Production build remains the release
  gate; no failure referenced changed Meta files.

## Production Release

- Application commits: `84f9ba441ce15993b3222bf1e7285b4fe0390eed`,
  `cef67e910988dd137cdb8bfd80563cd76acb960d` and
  `c6c2caf19e31a24ab3639eb65f0e9faba30b0e22`. Follow-up commit
  `59e63b0dedd4299b62d22f239a2f56d97731671b` adds only sanitised provider
  error reporting to the protected readiness check.
- Vercel automatically redeployed the corrected Production secret as deployment
  `9WYg3HZTR3MrmhYCi2tRq3U4C55Y`, Ready on 3 November 2026 at 08:21:15 SAST.
  Follow-up deployment `94SwdXrVC19XyhYV4PSx1dq8B57S` reached Ready at
  08:26:29 SAST and is the active Production release.
- Authenticated Production Admin loaded successfully. The management-only
  readiness request reached Meta without exposing credentials or sending an
  event.
- The protected retest used the corrected Production secret and Meta rejected
  the configured dataset/token readiness lookup with HTTP 400, provider code
  100, null subcode, type `OAuthException` and sanitised message
  `(#100) Missing Permission`. The failure is permission-related; dataset
  identity and provider acceptance therefore remain unverified.
- Production now contains 301 successful GA4 deliveries and still contains zero
  Meta outbox rows.

## Permission Error Resolution

- The HTTP 400 `OAuthException` code 100 `(#100) Missing Permission` came from
  `GET /v26.0/{dataset_id}?fields=id`. That operation tests dataset-object read
  access, not the `POST /v26.0/{dataset_id}/events` operation used by CAPI.
- Commit `8ee27acf6cd2792ffcd438217ea7dcb06404e37a` replaces that false gate with
  `GET /v26.0/me?fields=id` for passive token authentication and an optional
  synthetic, non-Purchase Test Events POST for actual delivery proof.
- Production deployment `dpl_DHSfS6PtdspULodkuUNf45W7jz32` was Ready and
  aliased to `book.zingara.co.za` on 3 November 2026 at 08:44:58 SAST.
- Authenticated Production verification returned HTTP 200 with
  `tokenAccepted=true`, `deliveryVerified=false`, `datasetMatches=null` and
  `testEventRequired=true`. The existing token is active; dataset delivery has
  not yet been tested because no `META_CAPI_TEST_EVENT_CODE` is configured.
- Production contains 304 successful GA4 outbox rows and zero Meta rows. No
  Purchase, synthetic event or historical conversion was queued or sent by
  this correction.

## Safe Activation Boundary

- Jurelle supplied a dataset Test Events code on 3 November 2026. It was stored
  as a protected Production-only setting, used once, and removed immediately
  after verification. Its value was not recorded in source, logs or Markdown.
- The protected `POST /v26.0/{dataset_id}/events` check returned HTTP 200 with
  `accepted=true`, `deliveryVerified=true`, `datasetMatches=true` and
  `tokenAccepted=true`. Meta therefore accepted the configured token for event
  delivery to the configured dataset.
- The check sent one synthetic `ZingaraCapiReadiness` Test Events event. It was
  not a Purchase and contained no customer data, booking data or payment data.
- Meta CAPI was enabled for future eligible payments from
  `2026-11-03T07:50:53Z` (`09:50:53 SAST`). The existing consent, authoritative
  PayFast confirmation, payment-level idempotency and browser/server
  deduplication controls remain unchanged.
- Activation deployment `dpl_2zx9DHZGFJcikzPiyZ2AY7ShdnGS` reached Ready and
  was aliased to `book.zingara.co.za` on 3 November 2026. The preceding
  test-setting deployment was `dpl_EQWqmCY8VDurww4kn5sMUxdTHPcH`.
- Post-activation Production evidence contains 307 succeeded GA4 outbox rows and
  zero Meta rows. No historical payment was queued or replayed; Meta rows can be
  created only for eligible verified payments occurring on or after the
  activation timestamp.
