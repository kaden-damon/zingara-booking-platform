# Waitlist Communications & Data Integrity

STATUS: COMPLETE - PRODUCTION RELEASED AND VERIFIED

DATE: 31 OCTOBER 2026

## Objective

Prevent accidental duplicate enquiries across the standard Waitlist and Secret
Guest List, verify historical SAST timestamps, add immediate standard Waitlist
staff and customer acknowledgements, and introduce one daily 08:00 SAST Box
Office reminder using the existing communications infrastructure.

## Verified Findings

- Production contains 390 Waitlist rows.
- The strict repeated-submission audit found 131 confirmed duplicate rows across
  93 customer/performance groups. Every confirmed duplicate came from the legacy
  standard Waitlist path; none came from the Secret Guest List atomic path.
- Carmen, Deniehl Booyens, Kiashka Govender and Nicci Richardson each have
  confirmed rapid repeat submissions. Historical rows remain unchanged.
- Nicci Richardson's authoritative creation time is
  `2026-10-12T07:04:07.368Z`, which correctly displays as 12 October 2026 at
  09:04:07 SAST. No historical timestamp correction is required.
- Root cause: the legacy public standard Waitlist path performed a read followed
  by a non-transactional insert, so retries could each create a new row.

## Implementation

- Both public enquiry sources now use one server-owned, advisory-lock-protected
  atomic database function. Existing active/contacted enquiries for the same
  performance and contact are returned instead of duplicated.
- Legitimate enquiries for a different performance remain possible.
- New standard Waitlist entries send the existing branded staff notification to
  the configured five TO and three CC recipients after the response.
- New standard Waitlist entries send the approved branded customer
  acknowledgement with subject `You're on Zingara's Waitlist!` after successful
  acceptance. Delivery is source-specific, asynchronous and idempotent; there is
  no historical replay.
- The existing Secret Guest List customer acknowledgement remains active and
  unchanged.
- A bounded daily workflow runs during the 08:00 SAST hour, includes only future
  active/contacted enquiries from both sources, groups them by performance and
  records one idempotent Communications entry per day.
- `New Waitlist Enquiry` and `Daily Waitlist Reminder` use the existing Staff
  Emails preferences and management routing.
- Waitlist creation, promotion and conversion timestamps render explicitly in
  `Africa/Johannesburg`.

## Verification

- Focused Waitlist and staff-email tests: 17/17 passed.
- TypeScript: passed.
- Targeted ESLint: passed for all changed Waitlist and communication modules.
- Next.js 16.3.4 webpack Production build: passed.
- Migration dry run identified one pending migration; the same migration then
  applied successfully to Production.
- Rollback-only Production execution verified first-create, cross-source
  duplicate suppression and a legitimate separate-performance submission. The
  transaction left zero test customers or enquiries.
- Authenticated Production Waitlist inspection confirmed Compact view, preserved
  historical duplicates and Nicci Richardson's 12/10/2026 09:04 SAST display.
- Production contains 390 Waitlist rows and zero standard acknowledgement
  Communications after release, confirming there was no historical replay.
- The large Admin page retains two unrelated pre-existing effect-lint findings.
- The default Turbopack build cannot bind its local compiler port in this
  execution environment; the webpack Production build completed successfully.

## Release

- Application commit: `a11e8c71bb9921abb205ab9ac92db6932f505386`.
- Migration `20261031060000_waitlist_communications_integrity.sql` applied
  successfully to Production.
- Vercel Production deployment: `CLxjUtfWUzu7KfaMe1NWsCsq9nLH`.
- Deployment completed at 07:35:55 SAST on 31 October 2026.
- Live Admin returned HTTP 200 and the deployed public endpoint returned the new
  bounded Waitlist validation response without creating an enquiry.
- Both acknowledgement workflows are enabled. Two new management routes each
  contain the authoritative five TO and three CC recipients, and both new
  idempotency indexes are present.
- Rollback point: `b8aa675d5a9b22167629468cff5b180377344009`.

## Business-Data Delta

The migration added one workflow configuration, two notification routes, atomic
submission logic and two idempotency indexes. It did not update, merge or delete
historical Waitlist records. Release verification created no customer, enquiry,
booking, communication, seating, payment, ticket or financial record.
