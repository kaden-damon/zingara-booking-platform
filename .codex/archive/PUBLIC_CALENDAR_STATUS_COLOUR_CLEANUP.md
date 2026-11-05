# Public Calendar Status & Colour Cleanup

STATUS: IMPLEMENTED - RELEASE VERIFICATION PENDING

DATE: 5 NOVEMBER 2026

## Scope

Simplify the public booking calendar's status legend and colours without
changing show lifecycle records, public eligibility, internal controls or
historical audit evidence.

## Authoritative Status Audit

### Available

- Database meaning: `shows.status = active`.
- Public effect: eligible for sale only when all other availability, capacity,
  cutoff and buyout checks pass.
- Admin effect: ordinary operational show state.

### Sold Out

- Database meaning: explicit `shows.status = sold_out`.
- Public effect: visible but unavailable for booking.
- Admin effect: authorised internal booking remains available under the
  existing staff lifecycle policy.

### Booking Blackout

- Database meaning: explicit `shows.status = blackout`.
- Public effect: visible but unavailable for booking.
- Admin effect: internal booking is also blocked. Existing Admin controls and
  audit history remain authoritative.

### Special Event

- Database meaning: explicit `shows.status = special_event`.
- Public effect: visible but unavailable for booking.
- Admin effect: management-approved internal booking is permitted with the
  existing reason and permission safeguards.
- Conclusion: it is not equivalent to Full Show Buyout.

### Full Show Buyout

- Database meaning: an active lifecycle record in `corporate_buyouts`, separate
  from `shows.status`.
- Public effect: every seating zone is unavailable. The public booking insert
  boundary atomically rejects active buyouts, independently of calendar labels.
- Admin effect: existing Buyout management and internal approval rules remain.

### Venue Closure

- Database meaning: explicit `shows.status = venue_closure`.
- Public and Admin effect: booking is blocked by the existing lifecycle policy.

## Production Evidence

- Production includes current and historical records for all operational show
  states, so no status records can safely be removed or mass-converted.
- JHB 6 November 2026 has an active Full Show Buyout and a Blackout show state.
- JHB 7 November 2026 has an active Full Show Buyout and a Special Event state.
- JHB 17 November 2026 was changed from Blackout to Active by staff; it does
  not have an active Full Show Buyout.
- Special Event records exist both with and without active buyouts, proving the
  two concepts are not interchangeable.

## Correction

- Public legend: Available (gold), Sold Out (red), Full Show Buyout (blue),
  Venue Closure (grey).
- Public Blackout and Special Event dates: neutral grey `Unavailable`, without
  separate legend entries or operational labels.
- Active buyout evidence always takes precedence and displays Full Show Buyout.
- Staff booking journeys retain the original Blackout and Special Event labels
  and colours.
- No show, buyout, capacity, booking, payment, ticket or audit data is changed.

## Verification

- Focused calendar and public lifecycle tests: 10/10 passed.
- TypeScript: passed.
- Next.js Webpack Production build: passed.
- Default Turbopack build: unavailable locally because its compiler worker is
  denied port binding by the execution environment.
- Production deployment and desktop/mobile verification: pending.

## Rollback

Revert the public calendar presentation commit and redeploy. No data rollback
or migration is required.

