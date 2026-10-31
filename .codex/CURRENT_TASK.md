# Waitlist Email Recipient Correction

STATUS: COMPLETE - PRODUCTION RELEASED AND VERIFIED

DATE: 31 OCTOBER 2026

## Objective

Correct every Waitlist-specific staff email route so Sharon, Rasmus, Fatima,
Michael and Lisa remain TO recipients, Kaden is the only CC recipient, and Tracy
and Nicky-Anne are removed without changing personal preferences or customer
acknowledgements.

## Verified Production Baseline

- Three Waitlist-specific staff routes exist and are enabled:
  `secret-guest-list`, `new-waitlist-enquiry` and `daily-waitlist-reminder`.
- Each route currently has the correct five TO recipients.
- Each route currently has Kaden, Tracy and Nicky-Anne in CC, and all eight
  recipients currently have their personal subscription enabled.
- The sender has no hard-coded or fallback recipient list. It loads only the
  configured management route, resolves active staff records, and then applies
  each staff member's personal preference.

## Correction

- Add one narrowly scoped migration that updates only the three Waitlist route
  rows.
- Preserve the five existing TO staff IDs.
- Replace each CC array with Kaden's authoritative active staff ID only.
- Fail the migration unless all six required recipients remain active with email
  addresses and all three route rows exist.
- Do not change staff subscriptions, templates, Communications, customer
  acknowledgements or historical delivery records.

## Verification

- Focused Waitlist communications tests: 5/5 passed.
- Targeted ESLint, TypeScript and diff validation passed.
- Migration dry run identified exactly one pending migration before release.
- Production verification confirmed all three routes are enabled with five TO
  recipients and one CC recipient.
- All six effective recipients currently have their individual preference
  enabled. Personal preference rows were not changed.
- Tracy and Nicky-Anne are absent from TO and CC on every Waitlist-specific
  route. Application inspection confirmed no alternate or fallback list.

## Release

- Commit: `0228727b6554df43325aa0813f71fe09cc0471df`.
- Migration `20261031080000_waitlist_email_recipient_correction.sql` applied
  successfully to Production.
- Vercel Production deployment: `BJ1ySRnxSiN5exT7o4JA5wVkL9wv`.
- Deployment completed at 07:44:10 SAST on 31 October 2026.
- Rollback point: `214e9e50ec00b98a1dbcdeca893fd0fa84ff46a9`.

## Business-Data Delta

The TO/CC arrays and `updated_at` value changed on exactly three Waitlist
management routing rows. No subscription, communication, customer, Waitlist,
booking, payment, seating, ticket or financial record changed. No email was sent
and no historical notification was replayed.
