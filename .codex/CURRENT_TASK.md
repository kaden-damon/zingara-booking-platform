# Waitlist Email Recipient Correction

STATUS: VERIFIED LOCALLY - PRODUCTION RELEASE IN PROGRESS

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

- Focused route test: pending final run.
- Migration dry run: pending.
- Production route verification: pending.

## Release

- Commit: pending.
- Migration: `20261031080000_waitlist_email_recipient_correction.sql` pending.
- Production deployment: pending.

## Business-Data Delta

Planned delta is limited to the TO/CC arrays and `updated_at` value on three
Waitlist management routing rows. No email will be sent and no historical
notification will be replayed.
