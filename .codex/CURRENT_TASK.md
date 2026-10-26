# P0 - Two-Seater Box Office Override

STATUS: IN PROGRESS

DATE: 26 OCTOBER 2026

## Objective

Allow authorised Box Office staff to override only the twenty-booking
two-seater quota for one performance, with a mandatory reason and immutable
staff audit evidence. Public bookings remain strictly capped.

## Confirmed Baseline

- The existing PostgreSQL trigger serialises qualifying two-person claims with
  a performance-scoped advisory transaction lock and rejects the twenty-first.
- Public and internal creation currently receive the same quota error because
  the trigger has no trusted exception channel.
- Alternative-date suggestions are already bounded, venue-correct and limited
  to active, publicly bookable performances with zone capacity.
- Physical venue, zone and table capacity checks are separate from the
  two-seater quota and remain authoritative.

## Authorised Correction

- Add a private, short-lived override authorisation keyed to the exact booking
  reference and performance.
- Permit only authenticated staff with booking-management access and an
  authorised Box Office role to create an override authorisation.
- Require a non-empty reason and record staff identity, timestamp,
  performance, booking reference and reason.
- Consume and audit the override atomically inside the existing two-seater
  trigger only when the quota is full.
- Support the same server-side contract for booking creation, qualifying guest
  amendments and show transfers.
- Add the smallest existing-popup UI needed to collect the reason and retry.

## Safety

- Public creation can never create or consume an override.
- Override affects only the two-seater count; capacity, table, payment, ticket,
  lock and concurrency rules remain unchanged.
- No historical booking or financial mutation.
- Strict UX/UI freeze outside the small override control.
- Preserve unrelated user-owned files.
