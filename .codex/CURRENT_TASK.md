# Waitlist Communications & Data Integrity

STATUS: VERIFIED LOCALLY - PRODUCTION RELEASE IN PROGRESS

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
- Migration dry run: one pending migration only.
- The large Admin page retains two unrelated pre-existing effect-lint findings.
- The default Turbopack build cannot bind its local compiler port in this
  execution environment; the webpack Production build completed successfully.

## Release

- Application commit: pending.
- Migration: `20261031060000_waitlist_communications_integrity.sql` pending.
- Production deployment: pending.
- Production verification: pending.

## Business-Data Delta

Planned migration adds workflow/routing configuration, atomic submission logic
and idempotency indexes. It does not update, merge or delete historical Waitlist,
booking, seating, payment, ticket or financial records.
