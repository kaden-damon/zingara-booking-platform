# P0 - Internal Calendar Booking Validation

STATUS: COMPLETE

DATE: 27 OCTOBER 2026

## Objective

Allow authorised staff to create Standard, Corporate, and Buyout bookings from
the Admin calendar without requiring an email address or mobile number, while
keeping the applicable contact person and guest count requirements intact.

## Scope

- Correct the shared frontend and server-side trusted booking validation.
- Preserve customer and company linking without placeholder contact details.
- Prevent customer communications when no valid delivery address is present.
- Keep public booking contact validation unchanged.
- Preserve all payment, capacity, ticketing, Xero, audit, and concurrency rules.

## Verification

- Reproduce the internal Corporate failure with blank email and mobile fields.
- Verify trusted Standard and Corporate creation validation with blank contact
  channels and valid contact names.
- Verify Buyout contacts without contact channels remain eligible when properly
  linked to their Company.
- Verify malformed optional values still fail validation.
- Verify public email and mobile requirements remain enforced.
- Run focused tests, TypeScript, changed-file lint, diff checks, and a Production
  build before release.

## Safety

- Use isolated fixtures only; create no Production bookings or communications.
- Make no layout, workflow, business-rule, database, or financial changes beyond
  the authorised validation correction.

## Outcome

- Removed the Corporate-only email requirement from the shared trusted booking
  validator used by both the Admin form and authoritative booking API.
- Internal Standard and Corporate creation now require the contact name and valid
  guest count; email and mobile are optional but validated when supplied.
- Both duplicated Corporate checkout forms now match the server rule. Public
  booking and public Corporate enquiry requirements remain unchanged.
- Buyout creation was verified to require a Company-linked named contact without
  requiring contact channels; no Buyout code or database change was necessary.
- Empty contact values remain null/blank, so no placeholder email or mobile is
  generated. Internal booking creation adds no customer communication records.
- Four focused source regressions, TypeScript, targeted non-page ESLint, and diff
  checks passed. The webpack Production application build compiled successfully.
- Existing whole-page lint findings and the current performance-budget manifest
  incompatibility are unchanged baseline issues outside this surgical fix.
- Rollback point: `d0f5500d000b06a098a0742e63c6f9e9f0ebc448`.
- Production business-data delta: zero.
