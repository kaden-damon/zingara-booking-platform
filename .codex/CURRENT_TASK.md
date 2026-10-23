# P0 - Two-Seater Booking Limit & Alternative Dates

Zingara is live Production. Diagnose and implement one surgical operational safeguard without changing existing bookings or unrelated workflows.

## Goal

Enforce a maximum of 20 authoritative qualifying two-seater table requests per performance, including concurrent creates and relevant amendments, while preserving every existing booking, payment, ticket, capacity and seating record.

## Required work

- Identify the persisted source of truth for a two-seater request and reconcile the current Production population.
- Define and document the exact active-booking counting rule without guessing from names, notes or table assignments.
- Enforce the boundary atomically at the database layer for creation, show transfer, lifecycle restoration and guest-count amendments.
- Preserve existing bookings even if historical occupancy already exceeds the new limit; only block changes that increase the qualifying count.
- Return a structured conflict to public and staff booking workflows.
- Present a compact black/gold alternative-date dialog with only active, bookable performances that still have two-seater and ordinary capacity availability, plus a Box Office contact action.
- Keep mobile behaviour simple and accessible.

## Verification

- Reconcile actual Production counts and identify performances at or above the limit.
- Test 19/20/21, concurrency, cancellation/release, reinstatement, guest-count amendments and show transfers.
- Verify larger bookings and unrelated workflows remain unchanged.
- Run focused tests, TypeScript, changed-file ESLint, `git diff --check`, migration validation and Production build.
- Deploy the smallest verified correction and confirm Production without creating test bookings.

## Safety

- No historical booking mutation or guessed classification.
- No Production test bookings, payments, tickets, capacity edits or communications.
- Keep Xero paused and its pending webhook configuration untouched.
- Keep Phase 50.14 Guided Training untouched.
- Preserve unrelated user-owned files and generated outputs.

Final status: P0 complete - two-seater limit and alternative dates live.

## Verified implementation - 23 October 2026

- Production baseline before this P0: `0679e495e170f2084c7718f86b86982ddcddc362`; `main` and `origin/main` matched before editing.
- The authoritative classification is an unarchived booking with exactly two guests whose lifecycle is `new`, `pending_payment`, `confirmed` or `checked_in`. Table assignment is deliberately not used because ordinary bookings receive physical tables later.
- Read-only Production reconciliation covered 197 upcoming performances and 1,694 booking rows. Ninety-five performances have qualifying two-guest bookings; the maximum is 19.
- The only performance at the immediate boundary is Johannesburg, 12 December 2026 at 17:00, with 19 qualifying bookings. No existing performance is at or above 20.
- A database trigger serialises new qualifying claims per performance and blocks only the twenty-first claim. Existing qualifying bookings remain editable; cancellation, archive, release and guest-count increases away from two remain available.
- The same guard covers public and staff creation, reinstatement/reactivation, transfer into another performance, and amendments that change a booking into a two-guest entitlement.
- The booking API returns a structured conflict with at most five same-venue active alternatives. Alternatives must remain publicly bookable, have the requested zone open, retain at least two ordinary seats and remain below the two-seater limit.
- The existing booking journey now shows a compact black/gold alternative-date dialog and Box Office contact action. Safe intercepted browser QA passed at 390px and 1440px with no horizontal overflow and no Production write.
- Focused two-seater and amendment tests passed (8/8); the broader selected booking/capacity run passed 49 assertions. TypeScript, migration dry-run, Production schema lint, `git diff --check` and Production build passed. Changed-file lint has no new errors; the public booking page retains its pre-existing React effect lint findings.
- No booking, payment, ticket, table, capacity, customer, communication or Xero business data was modified during investigation or QA.
