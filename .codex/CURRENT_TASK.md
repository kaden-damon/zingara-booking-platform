# P0 - Same-Day Cutoff & Two-Seater Live Verification

Zingara is live Production. Verify the public same-day booking cutoff and the newly deployed two-seater limit using read-only Production evidence and isolated fixtures. Correct only proven defects.

## Authoritative rules

- Cape Town and Johannesburg public bookings close at 12:00 SAST on the performance date when the venue-specific same-day cutoff is enabled.
- The venue-specific same-day cutoff is the public-sales authority. The legacy `bookingCutoffHours` value does not participate in public booking eligibility or booking creation.
- A qualifying two-seater claim is an unarchived booking for exactly two guests in `new`, `pending_payment`, `confirmed` or `checked_in` lifecycle state.
- At most twenty new qualifying claims may exist per performance. Existing historical claims are preserved.

## Verification

- Read the saved Production venue configuration and reconcile the two cutoff settings.
- Verify UI eligibility and the public booking API at the exact 11:59:59.999/12:00:00 SAST boundary and confirm direct callers cannot bypass the server guard.
- Reconcile current Production two-seater counts without mutation.
- Verify the 19/20/21 boundary, database concurrency lock, cancellation/amendment behavior, structured conflict and branded popup.
- Verify every suggested alternative is active, venue-correct, publicly open, before its same-day cutoff, below the two-seater limit and has at least two seats in the requested zone.

## Safety

- No Production bookings, payments, tickets, customers, capacity, communications or financial records may be created or changed.
- Keep Phase 50.14 Guided Training untouched.
- Keep Xero synchronisation paused and do not alter webhook configuration.
- Preserve unrelated user-owned files and worktree outputs.

## Confirmed defect

- The initial two-seater alternative-date helper validated status, venue, zone sales, capacity and two-seater count but did not apply the venue's public opening and same-day cutoff settings. A same-day alternative could therefore be suggested after 12:00 SAST even though selection and the server booking endpoint would reject it.
- Correct the existing helper at the narrow eligibility boundary; do not change the booking limit, historical records or public booking architecture.

## Verified outcome - 23 October 2026

- Production stores `sameDayCutoffEnabled=true` and `sameDayCutoffTime=12:00` for Cape Town and Johannesburg. The timestamp is constructed explicitly at `+02:00`, so 11:59:59.999 SAST is open and 12:00:00.000 SAST is closed.
- The public UI removes same-day availability at the cutoff. The public `POST /api/bookings` route independently resolves the authoritative show and venue settings, then returns `PUBLIC_BOOKING_CUTOFF_REACHED` before customer, booking, payment, capacity or ticket mutation. Unauthenticated callers cannot claim an internal source label.
- `bookingCutoffHours=4` is a legacy saved/displayed value with no execution reference outside the settings model and Admin field. The venue-specific 12:00 rule therefore takes precedence for public bookings.
- The fully paginated read-only reconciliation covered 197 upcoming performances and 2,786 booking rows. One hundred and two performances contain qualifying two-guest bookings; six pre-existing performances are at or above twenty and remain grandfathered.
- The remote database migration contains the atomic trigger guard. It serialises new claims by performance, allows the twentieth claim when nineteen exist and blocks the twenty-first when twenty exist. Cancellation/archive/non-occupying lifecycle changes release a claim; existing same-show qualifying bookings remain editable.
- Alternative-date discovery now also requires the authoritative venue public-booking window to be open and each candidate to remain before its same-day cutoff. Existing active-status, venue, zone sales, capacity, buyout and two-seater-count checks remain intact.
- At 12:23 SAST, live public UI verification showed Cape Town 23 October disabled as `Online bookings closed`; future available dates remained selectable. Read-only alternative reconciliation found valid future same-venue candidates for every enabled seating zone on each capped active performance.
- Nineteen focused cutoff/two-seater tests, TypeScript, changed-file ESLint, `git diff --check` and the Production build passed. The build retained one unrelated existing dynamic-font tracing warning.
- Production business-data delta during verification and QA: zero.
