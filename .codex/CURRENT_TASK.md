# Staff Emails Recipient Correction & UX Cleanup

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 31 OCTOBER 2026

## Objective

Correct Waitlist staff routing and make Communications > Staff Emails a compact,
complete and permission-safe control surface.

## Verified Baseline

- The three Waitlist routes are enabled in Production.
- Before correction, Sharon, Rasmus, Fatima, Michael and Lisa were TO; Kaden was
  the only CC recipient.
- The registry already defined all three Waitlist workflows, but the API exposed
  only management-mode routes and the Staff Emails page explicitly hid personal
  preferences. This made the Waitlist workflows absent from the interface.
- Individual preference rows are currently empty, so the established default is
  enabled for every eligible routed recipient.

## Implementation

- Route all three Waitlist workflows TO Sharon, Rasmus, Michael and Lisa; CC
  Kaden and Tracy. Fatima and Nicky-Anne are absent from both arrays.
- Preserve each recipient's independent subscription and every unrelated route.
- Expose all six routed organisation workflows and all four personal
  subscriptions from the existing authenticated API.
- Keep organisation changes behind `settings:manage`; other staff receive a
  view-only workflow status and can change only their own eligible preferences.
- Replace the long card presentation with compact grouped rows, immediate ON/OFF
  switches and on-demand recipient editing.
- Keep Daily Booking Review and Review Management advanced settings in their
  established, separately protected controls below the compact list.

## Verification

- Focused Communications, routing and Waitlist tests: 16/16 passed.
- TypeScript and targeted ESLint passed.
- Next.js 16.3.4 webpack Production build passed, including all 27 static pages.
- Migration dry-run found exactly one pending migration.
- Rollback-only Production execution confirmed the exact four TO and two CC
  identities on all three routes, then left Production unchanged.
- Customer acknowledgement workflows remain enabled and unchanged.

## Release

- Application commit: `606915ef6c17f72904569deffe193c6e6a50e8fb`.
- Production migration: `20261031110000_staff_email_recipient_correction.sql`.
- Vercel deployment: `ANUShHYPyZo8ddrsVf8VJFgj2CHw`, completed at
  08:22:15 SAST on 31 October 2026.
- Authenticated Production verification with Kaden's Super Admin session
  confirmed the compact Staff Emails interface, four personal switches, six
  organisation workflows, protected recipient editing and approval-gated
  campaign remaining OFF.
- Production data verification confirmed all three Waitlist routes are enabled
  with TO Sharon, Rasmus, Michael and Lisa; CC Kaden and Tracy. Fatima and
  Nicky-Anne are absent.
- Secret Guest List and standard Waitlist customer acknowledgements remain
  enabled. No messages were sent during verification.
- Business-data delta: three staff routing rows only. No booking, customer,
  communication, payment, seating or financial records changed.
