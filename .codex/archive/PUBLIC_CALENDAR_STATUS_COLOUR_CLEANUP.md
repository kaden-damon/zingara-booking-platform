# Public Calendar Status & Colour Cleanup

STATUS: COMPLETE - DEPLOYED AND VERIFIED IN PRODUCTION

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
- JHB 17 November 2026 is currently `inactive`, has no active Full Show Buyout
  and is not returned by the public show API.
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
- Live Production desktop verification confirmed the four-item legend and
  correct gold, red, blue and grey status differentiation.
- Live Production 390x844 mobile verification confirmed the calendar, legend
  and labels fit without overlap or clipping.
- JHB 6/7 November render as blue Full Show Buyouts; JHB 14/15 November render
  as neutral Unavailable dates; Blackout and Special Event are absent from the
  public legend.
- An Available date continued normally to show selection and the guest step.

## Release

- Application and records commit: `e1504d6c5da8c517917cac67311fefa1ee2bf61b`.
- Production deployment: `dpl_CP9MmTWXMDzoJH23XAyDCp2KBEfk`.
- Deployment state: Ready, aliased to `book.zingara.co.za` at 15:10:05 SAST.
- Migration: none.
- Business-data delta: zero.

## Rollback

Revert `e1504d6c` and redeploy. No data rollback or migration is required.

