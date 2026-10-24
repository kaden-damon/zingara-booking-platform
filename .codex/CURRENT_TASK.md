P0 - TWO-SEATER ALTERNATIVE DATE BOOKING FAILURE

STATUS: COMPLETE - VERIFIED FOR PRODUCTION RELEASE

DATE: 24 OCTOBER 2026

OUTCOME

- Corrected the shared public and internal alternative-performance handoff.
- A valid alternative now replaces the selected performance while preserving
  guest count, seating, customer details, pricing mode, and payment choice.
- A complete booking returns to Checkout instead of restarting at date or
  seating selection; incomplete state resumes at the furthest valid step.
- Internal bookings now replace the immutable Admin show snapshot with the
  selected alternative and never reuse a lock belonging to the original show.
- The alternative snapshot is reflected in the current booking URL so refresh
  and server validation refer to the same performance.

ROOT CAUSE

The two-seater popup reused the general recommended-show action. That action
intentionally reset ordinary journeys to Seating and explicitly ignored Admin
calendar journeys. For staff, the server-side calendar snapshot therefore also
continued to identify the original performance. The booking could not continue
authoritatively on the selected alternative.

SAFETY

- Atomic 20-booking enforcement and advisory-lock concurrency remain unchanged.
- Same-day cutoff, capacity, pricing, payment, ticket, and identity checks remain
  authoritative at the existing server/database boundaries.
- No automatic retry or booking creation occurs after choosing an alternative.
- No Production bookings, customers, payments, tickets, capacity, or
  communications were created or modified during QA.

VERIFICATION

- Focused alternative, staff snapshot, concurrency, cutoff, capacity, public
  sales, and show-lifecycle tests: 75 passed.
- One pre-existing source-text assertion in publicBookingAvailability.test.ts
  remains stale against the previously deployed Guided Training dependency; it
  is unrelated to this correction.
- TypeScript: passed.
- Production build and Admin performance budget: passed.
- Changed-file ESLint exposed only existing page-level hook diagnostics; no new
  diagnostic was introduced by this change.
- git diff --check: passed.

RELEASE

- Production baseline / rollback: f2de327dfeb80017be6be7c5ff05c22aeb978d9b
- Release commit: this P0 release commit.
- Production business-data delta: zero.
