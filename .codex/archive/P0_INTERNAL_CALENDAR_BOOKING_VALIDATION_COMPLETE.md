# P0 - Internal Calendar Booking Validation

STATUS: COMPLETE

DATE: 27 OCTOBER 2026

## Root Cause

The shared trusted-booking validator contained an explicit Corporate exception
that required email for `corporate-direct` creation. The Admin booking page also
duplicated that exception in both rendered copies of its customer form, so the
browser and authoritative API independently blocked Fatima's workflow.

## Correction

- Trusted internal Standard and Corporate creation now accepts a required contact
  name and valid guest count without email or mobile.
- Optional email and mobile values are still validated when staff enter them.
- Public booking and public Corporate enquiry contact rules remain mandatory.
- Customer and Company linking continue to persist blank contact channels as
  null/blank values without placeholders.
- Buyout creation already supported Company-linked contacts without email/mobile;
  its frontend, API, and atomic database function were verified unchanged.

## Verification

- Four focused source-level regressions passed for internal Corporate fields,
  authoritative server validation, optional PayFast contact data, and Buyout
  linked-contact handling.
- TypeScript, targeted changed-library/test ESLint, and `git diff --check` passed.
- The webpack Production build compiled every route successfully. The existing
  performance-budget checker then rejected Next's current unsupported client
  manifest format; this is unchanged and unrelated to the validation correction.
- No Production booking, payment, ticket, customer, Company, or communication
  record was created or modified during QA.

## Release Safety

- No migration or business-data reconciliation is required.
- No payment, capacity, ticketing, Xero, audit, or public validation rule changed.
- Rollback point: `d0f5500d000b06a098a0742e63c6f9e9f0ebc448`.
- Production business-data delta: zero.
