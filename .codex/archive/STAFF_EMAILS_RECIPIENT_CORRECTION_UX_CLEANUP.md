# Staff Emails Recipient Correction & UX Cleanup

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 31 OCTOBER 2026

## Root Causes

The Waitlist routes existed and were active, but they were classified as
personal subscriptions while the API loaded only management-mode routes for the
organisation list. The Staff Emails tab also mounted the settings component with
personal preferences explicitly hidden. As a result, the workflows were active
but undiscoverable on the page.

The prior recipient migration intentionally left Kaden as the only CC recipient
and retained Fatima in TO. That no longer matched the approved routing.

## Correction

- New Secret Guest List, New Waitlist Enquiry and Daily Waitlist Reminder:
  - TO: Sharon Ricketts, Rasmus Bjerregaard, Michael Davis, Lisa Rodderick.
  - CC: Kaden Damon, Tracy Maltman.
  - Excluded: Fatima MB and Nicky-Anne De Beer.
- Routing is resolved by the six authoritative active staff profile IDs.
- Organisation switches and recipient editing require `settings:manage` on the
  server. Personal changes remain self-service only.
- Staff Emails now shows compact grouped rows for Waitlist, Bookings & Accounts,
  Guest Feedback and approval-gated campaigns.
- Every established routed workflow has a visible ON/OFF state. Recipient detail
  is loaded only when Edit is opened.
- All four personal subscriptions are visible with independent ON/OFF switches.
- Existing Daily Booking Review and Review Management advanced controls remain
  available and protected.

## Safeguards

- Microsoft 365 delivery, HTML templates, Communications logging, schedules and
  idempotent delivery claims are unchanged.
- Secret Guest List and standard Waitlist customer acknowledgements remain
  active and unchanged.
- The migration updates exactly three routing rows and no subscription rows.
- No historical email is replayed and no approval-gated campaign is activated.

## Verification

- Focused tests: 16/16 passed.
- TypeScript: passed.
- Targeted ESLint: passed.
- Next.js webpack Production build: passed.
- Migration dry-run: exactly one expected migration.
- Rollback-only Production route verification: passed with no persisted delta.

## Release Evidence

- Application commit: `606915ef6c17f72904569deffe193c6e6a50e8fb`.
- Migration applied: `20261031110000_staff_email_recipient_correction.sql`.
- Vercel deployment: `ANUShHYPyZo8ddrsVf8VJFgj2CHw`.
- Deployment completed: 31 October 2026 at 08:22:15 SAST.
- Authenticated Production UI verification used Kaden Damon's Super Admin
  session and confirmed:
  - all four personal notification switches are visible;
  - all six organisation workflow switches are visible;
  - Waitlist workflows have distinct names and compact rows;
  - recipient editing remains behind Edit and management permission;
  - Booking Experience Feedback remains awaiting approval and OFF;
  - unrelated Daily Booking Review and Review Management controls remain intact.
- Direct Production database verification confirmed all three Waitlist routes
  are enabled with TO Sharon Ricketts, Rasmus Bjerregaard, Michael Davis and
  Lisa Rodderick; CC Kaden Damon and Tracy Maltman.
- Fatima MB and Nicky-Anne De Beer are absent from all three route arrays, so
  neither can receive these emails through the configured route or fallback.
- Both customer acknowledgement workflows remain enabled with their original
  activation records. No historical notification or customer email was sent.
- Responsive implementation uses stacked, wrapping rows and bounded controls;
  desktop Production rendering was inspected directly and the responsive
  component states were covered by the successful Production build.
- Business-data delta: exactly three management email route rows updated. No
  subscription preferences, communication history, bookings, payments, seating
  or financial records changed.
